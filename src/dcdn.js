/* global window, document, console, URL, Blob, ArrayBuffer, Uint8Array,
	Uint16Array, WebSocket, RTCPeerConnection, RTCSessionDescription,
	RTCIceCandidate, XMLHttpRequest, performance
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

	var DEBUG = true;
	var logger = console;
	if(!DEBUG){
		logger = {
			"log": function(){},
			"error": console.error
		};
	}

	// GLOBALS //

	var LINK = document.createElement("a"); // <a> element used for URL normalization
	var DEFAULT_COORD_SERV_PORT = 8081;
	var STUN_CONFIG = {
		"iceServers": [
			{ "url": "stun:stun.l.google.com:19302" },
			{ "url": "stun:stunserver.org" },
			{ "url": "stun:stun1.l.google.com:19302" },
			{ "url": "stun:stun.ekiga.net" },
			{ "url": "stun:stun2.l.google.com:19302" },
		]
	};
	var RTC_DATA_CHAN_CONFIG = {
		ordered: false
	};
	var CHUNKS_IN_FLIGHT_LIMIT = 10;
	var HTTP_INTITIAL_LOAD_PERC = 0.20; // Load about %15 of the file from HTTP to give peers time to connect
	var HTTP_INTITIAL_LOAD_MAX_CHUNKS = 20; // But load no more than 20 chunks via HTTP (To prevent long startup lag)

	// TODO persist this in a shared worker?
	var fatalError = false;
	var peerConnections = {}; // A hash of peerId -> WebRTCPeerConnection for each peer
	var resourceHandles = {}; // A hash of URL to various info about the download or cached file
	var chunkRequestQueue = [];
	var chunksInFlight = 0;


	polyfill("RTCPeerConnection");
	polyfill("RTCSessionDescription");
	polyfill("RTCIceCandidate");

	if(checkBrowserCompatibility()){
		// Push connection but requires lengthy setup
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

	function Chunk(metadata, chunkNum){
		this.meta = metadata;
		this.num = chunkNum;
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
		logger.error("Browser does not seem to support "+name);
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
			return logger.error("dest is not the right size for the given string.");
		}
		for(var i=0; i < str.length; i++) {
			var charCode = str.charCodeAt(i);
			if(charCode > 255){
				logger.error("Non-ASCII character in string '%s'. Cannot convert to byte.", str[i]);
			}
			dest[i] = charCode;
		}
	}

	function logError(error){
		logger.error("RTC Error: %s", error);
	}

	function onFatalError(){
		fatalError = true;
		logger.error("DCDN Fatal Error. All requests will be fullfilled by normal HTTP.");

		// Fallback any incomplete downloads to HTTP
		for(var url in resourceHandles){
			var handle = resourceHandles[url];
			if(typeof handle.meta !== "undefined"){
				if(handle.lastYeilded === handle.meta.chunkcount){
					continue;
				}
			}
			logger.log("Fallback to HTTP: ", url);
			resourceHandles[url].oncomplete(function(){
				return url;
			}); // jshint ignore:line
		}
	}

	function getRandomInt(min, max) { // Inclusive max and min
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	// Requests a single chunk then calls itself to do more
	function scheduleChunks(){
		if (chunksInFlight <= CHUNKS_IN_FLIGHT_LIMIT && chunkRequestQueue.length > 0) {
			// Pick a peer or the coordination server
			var chunk = chunkRequestQueue.shift();
			var peerIds = chunk.meta.peers; // TODO only use peers we are already connected to
			var rnd = getRandomInt(-1, peerIds.length - 1);

			if(rnd === -1){
				httpChunkRequest(chunk.meta, chunk.num);
			} else {
				var peerId = peerIds[rnd];
				if(typeof peerConnections[peerId] === "undefined"){
					connectToPeer(peerId, true);
				}
				sendChunkRequest(peerConnections[peerId].dataChannel, chunk.meta, chunk.num);
			}

			// Request the next chunk
			chunksInFlight++;
			scheduleChunks();
		}
	}

	function httpChunkRequest(metadata, chunknum, count){
		if(typeof count === "undefined"){
			count = 1;
		}
		if(count <= 0){
			return;
		}

		logger.log(performance.now() + " HTTP Request chunk "+chunknum+ (count !== 1 ? " through "+(chunknum+count-1) : ""));
		var start = chunknum * metadata.chunksize;
		var end = Math.min(start + (count*metadata.chunksize), metadata.length) - 1;

		var xhr = new XMLHttpRequest();
		xhr.open("GET", metadata.url, true);
		xhr.setRequestHeader("Range", "bytes="+start+"-"+end);
		xhr.responseType = "arraybuffer";
		xhr.onload = function(){
			if(xhr.response.byteLength !== (1 + end - start)){
				logger.error("HTTP server returned a different range than expected.");
			}
			for(var i = 0; i < count; i++){
				logger.log(performance.now() + " HTTP Got chunk "+(i+chunknum));
				var chunkData = xhr.response.slice(i*metadata.chunksize, (i+1)*metadata.chunksize);
				recvChunk({ "chunk": (i+chunknum), "url": metadata.url }, null, new Uint8Array(chunkData));
			}
		};
		xhr.send();
	}


	// PEER TO PEER //

	function setupDataChannel(conn, dataChannel){
		dataChannel.onmessage = recvMessage;
		dataChannel.onclose = function(evt){
			logger.error("CONN CLOSED: ", conn, evt);
		};
		dataChannel.onerror = function(evt){
			logger.error("CONN ERRORED: ", conn, evt);
		};
		conn.dataChannel = new QueuedConnection(dataChannel);
	}

	function connectToPeer(peerId, isInitiator){
		var conn = peerConnections[peerId] = new RTCPeerConnection(STUN_CONFIG);

		// send any ice candidates to the other peer
		conn.onicecandidate = function (evt) {
			if (evt.candidate){
				sendPeerCoordMesg(coordinationServer, peerId, "candidate", evt.candidate);
			}
		};

		// let the "negotiationneeded" event trigger offer generation
		conn.onnegotiationneeded = function () {
			conn.createOffer(function(desc){
				conn.setLocalDescription(desc, function () {
					sendPeerCoordMesg(coordinationServer, peerId, "sdp", conn.localDescription);
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
		if(headerLengthField[0] !== headerString.length){
			return logger.error("Tried to send a message longer than is possible.");
		}

		var headerBuf = new Uint8Array(buf, headerStringOffset, headerString.length);
		str2uint8Array(headerString, headerBuf);

		// Write the binary
		var binaryBuf = new Uint8Array(buf, binaryOffset);
		binaryBuf.set(binary);

		logger.log(performance.now() + " SENT [%s] [Binary: %sB] %o", header.type, binary.length, header);
		connection.send(buf);
	}

	function sendMetadataRequest(connection, url){
		sendMessage({
			"type": "metadataRequest",
			"url": url
		}, connection);
	}

	function sendPeerCoordMesg(connection, peerId, type, message){
		var msg = {
			"type": "peerCoordMsg",
			"to": peerId
		};
		msg[type] = message;
		sendMessage(msg, connection);
	}

	function sendChunkRequest(connection, metadata, chunknum){
		sendMessage({
			"type": "chunkRequest",
			"url": metadata.url,
			"hash": metadata.hash,
			"chunk": chunknum
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

		logger.log(performance.now() + " GOT [%s] [Binary: %sB] %o", header.type, binary.length, header);

		if(! ("type" in header) ){
			logger.error("Got message with no type: %o", header);
			return;
		}

		if(! (header.type in handlers) ){
			logger.error("Got message with unknown type: %o", header);
			return;
		}

		handlers[header.type](header, msgEvent.conn, binary);
	}

	function recvMetadata(message){
		if(!(message.url in resourceHandles)){
			return logger.log("Got metadata for an unrequested URL: " + message.url);
		}

		// Stores metadata, sets up chunk queue and makes a few requests (Limited by the concurrent connection limit)
		var meta = message;
		delete meta.type;

		var handle = resourceHandles[meta.url];
		handle.meta = meta;
		handle.chunks = [];
		handle.lastYeilded = 0; // Keep track of how many chunks we have yeilded to the client

		// Get about 10% of the file from HTTP to allow peers time to connect
		var httpChunks = Math.min(Math.ceil(HTTP_INTITIAL_LOAD_PERC * meta.chunkcount), HTTP_INTITIAL_LOAD_MAX_CHUNKS);
		httpChunkRequest(meta, 0, httpChunks);

		for(var i = httpChunks; i < meta.chunkcount; i++){
			chunkRequestQueue.push(new Chunk(meta, i));
		}
		scheduleChunks();
	}

	function recvChunk(message, conn, binary){
		if(!(message.url in resourceHandles)){
			return logger.log("Got chunk for an unrequested URL: " + message.url);
		}

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

		if((typeof handle.onprogress === "function") && (inOrderComplete.length > handle.lastYeilded)){
			handle.onprogress(handle.meta, inOrderComplete);
		}
		handle.lastYeilded = inOrderComplete.length;

		if((typeof handle.oncomplete === "function") && (inOrderComplete.length === handle.meta.chunkcount)){
			handle.oncomplete(function(){
				var blob = new Blob(inOrderComplete, {type: handle.meta.contenttype});
				return URL.createObjectURL(blob);
			});
		}

		chunksInFlight--;
		scheduleChunks();
	}


	function recvChunkFail(message){
		if(!(message.url in resourceHandles)){
			return logger.log("Got chunkfail for an unrequested URL: " + message.url);
		}

		chunkRequestQueue.unshift(new Chunk(resourceHandles[message.url].meta, message.chunk));
		chunksInFlight--;
		scheduleChunks();
	}

	function recvChunkRequest(message, conn){
		var chunk = message.chunk;

		var reply = {
			"url": message.url,
			"chunk": chunk,
		};

		if(typeof resourceHandles[message.url] !== "undefined" &&
			typeof resourceHandles[message.url].chunks[chunk] !== "undefined"){
			reply.type = "chunk";
			sendMessage(reply, conn, resourceHandles[message.url].chunks[chunk]);
		} else {
			if(typeof resourceHandles[message.url] === "undefined"){
				// TODO Good stat
				logger.log("Got request for a URL we dont have at all: " + message.url);
			}

			reply.type = "chunkfail";
			sendMessage(reply, conn);
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
							sendPeerCoordMesg(coordinationServer, message.from, "sdp", conn.localDescription);
						}, logError);
					}, logError);
				}
			}, logError);
		} else if (message.candidate){
			conn.addIceCandidate(new RTCIceCandidate(message.candidate));
		}
	}

	function recvError(message){
		logger.error("Server error: %o", message);
	}


	// DCDN API //

	return {
		fetchResource: function(url, oncomplete, onprogress){
			if(fatalError){
				return oncomplete(function(){
					return url;
				});
			}

			url = canonicalizeUrl(url);

			resourceHandles[url] = {
				"onprogress": onprogress,
				"oncomplete": oncomplete
			};

			sendMetadataRequest(coordinationServer, url);
		}
	};
})();
