/* global window, document, console, URL, Blob, ArrayBuffer, Uint8Array,
	Uint16Array, WebSocket, RTCPeerConnection, RTCSessionDescription,
	RTCIceCandidate
*/

// DCDN: An open-source cdn powered by peer to peer sharing

/*
	Required infrastructure:
		- web server
		- coordination server (coordination_server.js)
		- one or more clients with this script (dcdn.js)

	Roles:
		- The coordination server acts as a caching-proxy to the HTTP server to support P2P coordination, chunking and metadata for peers
		- Clients access the coord. server to get metadata (the eqiv of a .torrent file) and find peers.
		- Clients are always open to connections initiated by other clients via the coord. server
*/


window.DCDN = (function(){
	"use strict";


	// GLOBALS //

	var LINK = document.createElement("a"); // <a> element used for URL normalization
	var DEFAULT_COORD_SERV_PORT = 8081;
	var STUN_CONFIG = {
		"iceServers": [{
			"url": "stun:stun.l.google.com:19302"
		}]
	};
	var RTC_DATA_CHAN_CONFIG = {
		ordered: false
	};

	// TODO persist this in a shared worker?
	var fatalError = false;
	var peerConnections = {}; // A hash of peerId -> WebRTCPeerConnection for each peer
	var resourceHandles = {}; // A hash of URL to various info about the download or cached file


	polyfill("RTCPeerConnection");

	if(checkBrowserCompatibility()){
		var coordinationServer = new WebSocket(discoverCoordServerUrl());
		coordinationServer.onmessage = recvMessage;
		coordinationServer.onerror = onFatalError;
		coordinationServer.onclose = onFatalError;
		coordinationServer.binaryType = "arraybuffer";
		coordinationServer = new QueuedConnection(coordinationServer);
	} else {
		onFatalError();
	}


	// CLASSES //


	function QueuedConnection(connection){
		/*
			Queued Connection wraps a webSocket-like connection to allow messages to
			be enqueued for sending before the connection is ready.

			It also inserts the socket handle into the on message event to
			facillitate replying to messages.
		*/

		var conn = connection;
		var onopen = conn.onopen;
		var onmessage = conn.onmessage;
		var q = [];

		this.send = function(message){
			if(q !== null){
				q.push(message);
			} else {
				conn.send(message);
			}
		};

		conn.onmessage = function(evt){
			evt.conn = this;
			if(onmessage !== null){
				onmessage(evt);
			}
		};

		conn.onopen = function(evt){
			for(var i = 0; i < q.length; i++){
				conn.send(q[i]);
			}
			q = null;

			if(onopen !== null){
				onopen(evt);
			}
		};
	}


	// UTIL FUNCTIONS //

	function polyfill(name){
		/* Fills in an attribute that is prefixed by various vendors */
		var prefixes = ["", "webkit", "moz"];
		for(var i = 0; i < prefixes.length; i++){
			if(typeof window[prefixes[i]+name] !== "undefined"){
				window[name] = window[prefixes[i]+name];
				return prefixes[i];
			}
		}
		console.error("Could not polyfill for "+name);
	}

	function checkBrowserCompatibility(){
		return ("WebSocket" in window &&
			"RTCPeerConnection" in window);
	}

	function canonicalizeUrl(url){
		LINK.href = url;
		url = LINK.protocol + "//" + LINK.host + LINK.pathname + LINK.search;
		return url;
	}

	function discoverCoordServerUrl(){
		LINK.href = window.location;
		var host = LINK.host.split(":")[0];
		return "ws://" + host + ":" + DEFAULT_COORD_SERV_PORT + "/";
	}

	function uint8Array2str(src) {
		return String.fromCharCode.apply(null, src);
	}

	function str2uint8Array(str, dest) {
		if(dest.length !== str.length){
			return console.error("dest is not the right size for the given string.");
		}
		for(var i=0; i < str.length; i++) {
			var charCode = str.charCodeAt(i);
			if(charCode > 255){
				console.error("Non-ASCII character in string '%s'. Cannot convert to byte.", str[i]);
			}
			dest[i] = charCode;
		}
	}

	function logError(error){
		console.error("RTC Error: %s", error);
	}

	function onFatalError(){
		fatalError = true;
		for(var url in resourceHandles){
			var handle = resourceHandles[url];
			if(typeof handle.meta !== "undefined"){
				if(handle.lastYeilded === handle.meta.chunkcount){
					// Dont bother failing back for URLs already completed
					continue;
				}
			}
			console.error("DCDN fatal error. Throwing back to normal download for: ", url);
			resourceHandles[url].callback(url);
		}
	}


	// PEER TO PEER //

	function setupDataChannel(conn, dataChannel){
		dataChannel.onmessage = recvMessage;
		dataChannel.onclose = function(evt){
			console.error("CONN CLOSED: ", conn, evt);
		};
		dataChannel.onerror = function(evt){
			console.error("CONN ERRORED: ", conn, evt);
		};
		conn.dataChannel = new QueuedConnection(dataChannel);
	}

	function connectToPeer(peerId, isInitiator){
		var conn = peerConnections[peerId] = new RTCPeerConnection(STUN_CONFIG);

		// send any ice candidates to the other peer
		conn.onicecandidate = function (evt) {
			if (evt.candidate){
				sendPeerCoordMesg(peerId, "candidate", evt.candidate);
			}
		};

		// let the "negotiationneeded" event trigger offer generation
		conn.onnegotiationneeded = function () {
			conn.createOffer(function(desc){
				conn.setLocalDescription(desc, function () {
					sendPeerCoordMesg(peerId, "sdp", conn.localDescription);
				}, logError);
			}, logError);
		};

		if (isInitiator) {
			setupDataChannel(conn, conn.createDataChannel("dcdn", RTC_DATA_CHAN_CONFIG));
		} else {
			conn.ondatachannel = function (evt) {
				setupDataChannel(conn, evt.channel);
			};
		}
	}


	// SEND MESSAGES //

	function sendMessage(header, connection, binary){
		if(typeof binary === "undefined" || binary === null){
			binary = new Uint8Array(0);
		}

		var headerString = JSON.stringify(header);
		var headerStringOffset = 2;
		var binaryOffset = headerStringOffset + headerString.length;
		var buf = new ArrayBuffer(binaryOffset + binary.length);

		// Write the header
		var headerLengthField = new Uint16Array(buf, 0, 1);
		headerLengthField[0] = headerString.length;
		var headerBuf = new Uint8Array(buf, headerStringOffset, headerString.length);
		str2uint8Array(headerString, headerBuf);

		// Write the binary
		var binaryBuf = new Uint8Array(buf, binaryOffset);
		binaryBuf.set(binary);

		console.log("SENT [%s] [Binary: %sB] %o", header.type, binary.length, header);
		connection.send(buf);
	}

	function sendMetadataRequest(url){
		sendMessage({
			"type": "metadataRequest",
			"url": url
		}, coordinationServer);
	}

	function sendPeerCoordMesg(peerId, type, message){
		var msg = {
			"type": "peerCoordMsg",
			"to": peerId
		};
		msg[type] = message;
		sendMessage(msg, coordinationServer);
	}

	function sendChunkRequest(url, hash, chunklist, connection){
		sendMessage({
			"type": "chunkRequest",
			"url": url,
			"hash": hash,
			"chunks": chunklist
		}, connection);
	}


	// RECV MESSAGES //

	function recvMessage(msgEvent){
		var handlers = {
			"metadata": recvMetadata,
			"chunk": recvChunk,
			"chunkfail": recvChunkFail,
			"chunkRequest": recvChunkRequest,
			"peerCoordMsg": recvPeerCoordMsg,
			"error": recvError
		};

		var headerLength = new Uint16Array(msgEvent.data, 0, 1)[0];
		var header = JSON.parse(uint8Array2str(new Uint8Array(msgEvent.data, 2, headerLength)));
		var binary = new Uint8Array(msgEvent.data, 2+headerLength);

		console.log("GOT [%s] [Binary: %sB] %o", header.type, binary.length, header);

		if(! ("type" in header) ){
			console.error("Got message with no type: %o", header);
			return;
		}

		if(("url" in header) && !(header.url in resourceHandles)){
			console.error("Got message about a URL we dont care about: %s", header.url);
			return;
		}

		if(! (header.type in handlers) ){
			console.error("Got message with unknown type: %o", header);
			return;
		}

		handlers[header.type](header, msgEvent.conn, binary);
	}

	function recvMetadata(message){
		// Stores metadata, sets up chunk queue and makes a few requests (Limited by the concurrent connection limit)
		var meta = message;
		delete meta.type;

		var handle = resourceHandles[meta.url];
		handle.meta = meta;
		handle.chunks = [];
		handle.lastYeilded = 0; // Keep track of how many chunks we have yeilded to the client
		handle.chunkqueue = []; // TODO Should be a priority queue

		for(var i = 0; i < meta.chunkcount; i++){
			handle.chunkqueue.push(i);
		}


		// TODO replace here down with real ordering algorthm

		meta.peers.push(0); // 0 is reserved for the coordination server
		var chunkRequests = {};
		var peerId;
		for(i = 0; i < handle.chunkqueue.length; i++){
			// Round robin the chunkrequests to all available peers.
			var chunknum = handle.chunkqueue[i];
			peerId = meta.peers[i % meta.peers.length];

			if(typeof chunkRequests[peerId] === "undefined"){
				chunkRequests[peerId] = [];
			}
			chunkRequests[peerId].push(chunknum);
		}

		// Send out the requests
		for(peerId in chunkRequests){
			var conn = coordinationServer;
			if(Number(peerId) !== 0){
				if( !(peerId in peerConnections) ){
					connectToPeer(peerId, true);
				}
				conn = peerConnections[peerId].dataChannel;
			}
			sendChunkRequest(meta.url, meta.hash, chunkRequests[peerId], conn);
		}
	}

	function recvChunk(message, conn, binary){
		// Stores chunk, checks if done, calls callback if so
		// Requests the next chunk in the chunk queue
		var handle = resourceHandles[message.url];
		handle.chunks[message.chunk] = binary;

		var inOrderComplete = [];
		for(var i = 0; i < handle.chunks.length; i++){
			if(typeof handle.chunks[i] === "undefined"){
				break;
			} else {
				inOrderComplete.push(handle.chunks[i]);
			}
		}

		// TODO determine a heuristic for when to reasonably yield to the client
		// It must be often enough for long video but not harm small files.
		if(inOrderComplete.length === handle.meta.chunkcount){
			handle.lastYeilded = inOrderComplete.length;
			var blob = new Blob(inOrderComplete, {type: handle.meta.contenttype});
			handle.callback(URL.createObjectURL(blob));
		}
	}


	function recvChunkFail(message){
		// Requests chunk from another source (always C. Serv at this point)
		sendChunkRequest(message.url, resourceHandles[message.url].meta.hash, [message.chunk], coordinationServer);
	}

	function recvChunkRequest(message, conn){
		for(var i = 0; i < message.chunks.length; i++){
			var chunk = message.chunks[i];

			var reply = {
				"url": message.url,
				"chunk": chunk,
			};

			if(typeof resourceHandles[message.url] !== "undefined" &&
				typeof resourceHandles[message.url].chunks[chunk] !== "undefined"){
				reply.type = "chunk";
				sendMessage(reply, conn, resourceHandles[message.url].chunks[chunk]);
			} else {
				reply.type = "chunkfail";
				sendMessage(reply, conn);
			}
		}
	}

	function recvPeerCoordMsg(message){
		if( !(message.from in peerConnections) ){
			connectToPeer(message.from, false);
		}

		var conn = peerConnections[message.from];

		if (message.sdp){
			conn.setRemoteDescription(new RTCSessionDescription(message.sdp), function () {
				if (conn.remoteDescription.type === "offer"){
					conn.createAnswer(function(desc){
						conn.setLocalDescription(desc, function () {
							sendPeerCoordMesg(message.from, "sdp", conn.localDescription);
						}, logError);
					}, logError);
				}
			}, logError);
		} else if (message.candidate){
			conn.addIceCandidate(new RTCIceCandidate(message.candidate));
		}
	}

	function recvError(message){
		console.error("Server error: %o", message);
	}


	// DCDN API //

	return {
		fetchResource: function(url, callback){
			if(fatalError){
				return callback(url);
			}

			url = canonicalizeUrl(url);

			resourceHandles[url] = {
				"callback": callback
			};
			sendMetadataRequest(url, coordinationServer);
		}
	};
})();
