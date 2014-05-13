/* global require, console, Buffer
*/

// DCDN Coordination Server

/*
	This server acts as a caching proxy for files accessed by URL.
	It serves both metadata and file chunks to clients and also
	provides for peer to peer coordination.
*/

var coordinationServer = (function(){
	"use strict";

	// GLOBALS //

	var WebSocketServer = require("ws").Server;
	var http = require("http");
	var urlparse = require("url").parse;

	var nextPeerId = 1;
	var peers = {};
	var fileCache = {};
	var urlMetadataCache = { // TODO Remove
		"chrome.png": {
			"hash": "fakeMd5Hash",
			"length": 122169,
			"contenttype": "image/png",
			"chunksize": 15000,
			"chunkcount": 9
		},
		"seattle.jpg": {
			"hash": "fakeMd5Hash",
			"length": 3232686,
			"contenttype": "image/jpeg",
			"chunksize": 15000,
			"chunkcount": 216
		}
	};


	// UTIL FUNCTIONS //

	function buffer2str(src) {
		return String.fromCharCode.apply(null, src);
	}

	function str2buffer(str, dest) {
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

	function loadFile(url, callback){
		if(url in fileCache){
			callback(fileCache[url]);
		} else {
			console.log("Loading file from URL...");
			http.get(urlparse(url), function(res) {
				var data = [];
				res.on("data", function(chunk) {
					data.push(new Buffer(chunk));
				});
				res.on("end", function() {
					var buffer = Buffer.concat(data);
					fileCache[url] = buffer;
					callback(buffer);
				});
			});
		}
	}

	function loadMetadata(url, callback){
		// TODO Remove this hack (it supports the hard coded metadata)
		url = url.split("/");
		url = url[url.length - 1];

		if(url in urlMetadataCache){
			callback(urlMetadataCache[url]);
		} else {
			// TODO impliment metadata generation
			console.log("Error: url not in metadata cache: "+url);
		}
	}


	// SEND MESSAGES //

	function sendMessage(header, connection, binary){
		if(typeof binary === "undefined" || binary === null){
			binary = new Buffer(0);
		}

		var headerString = JSON.stringify(header);
		var headerStringOffset = 2;
		var binaryOffset = headerStringOffset + headerString.length;
		var buf = new Buffer(binaryOffset + binary.length);

		// Write the header
		buf.writeUInt16LE(headerString.length, 0);
		var headerBuf = buf.slice(headerStringOffset, headerStringOffset + headerString.length);
		str2buffer(headerString, headerBuf);

		// Write the binary
		binary.copy(buf, binaryOffset);

		connection.send(buf);
	}


	// RECV MESSAGES //

	function recvMessage(message, ws, peerId){
		var headerLength = message.readUInt16LE(0);
		var header = JSON.parse(buffer2str(message.slice(2, 2 + headerLength)));
		var binary = message.slice(2+headerLength);

		if( !("type" in header) ){
			console.error("!!! Got message with no type: %o", header);
			return;
		}

		if( !(header.type in messageHandlers) ){
			console.error("!!! Got message with unknown type: %o", header);
			return;
		}

		messageHandlers[header.type](header, ws, peerId, binary);
	}

	var messageHandlers = {
		"metadataRequest": function(message, ws, myPeerId){
			console.log("<<< [%s] for %s", message.type, message.url);
			loadMetadata(message.url, function(metadata){
				var reply = metadata;
				reply.type = "metadata";
				reply.url = message.url;

				// Replace this with file specific peers
				var peerlist = [];
				for(var peerId in peers){
					if(myPeerId !== Number(peerId)){
						peerlist.push(peerId);
					}
				}
				reply.peers = peerlist;

				console.log(">>> [%s] for %s", reply.type, reply.url);
				sendMessage(reply, ws);
			});
		},

		"chunkRequest": function(message, ws){
			console.log("<<< [%s] chunk: %s for %s", message.type, message.chunks, message.url);
			loadFile(message.url, function(file){
				loadMetadata(message.url, function(metadata){
					for(var i = 0; i < message.chunks.length; i++){
						var chunk = message.chunks[i];
						var start = chunk * metadata.chunksize;
						var end = Math.min(start + metadata.chunksize, metadata.length);

						var reply = {
							"type": "chunk",
							"url": message.url,
							"chunk": chunk
						};

						console.log(">>> [%s] chunk: %s for %s", reply.type, reply.chunk, reply.url);
						sendMessage(reply, ws, file.slice(start, end));
					}
				});
			});
		},

		"peerCoordMsg": function(message, ws, peerId){
			console.log("<<< [%s] from: %s to: %s", message.type, peerId, message.to);
			message.from = peerId;

			if( !(message.to in peers) ){
				return console.error("!!! Unknown destination peerId: %s", message.to); // TODO Should return an error to the client
			}

			// TODO check if the connection to the other peer is still open, if not return error to the client

			console.log(">>> [%s] forwarded from: %s to: %s", message.type, message.from, message.to);
			sendMessage(message, peers[message.to]);
		}
	};


	// API //

	return {
		start: function(wsPort, httpPort){
			new WebSocketServer({"port": wsPort}).on("connection", function(ws) {
				var peerId = nextPeerId++;
				peers[peerId] = ws;

				console.log("<<< New connection. PeerId: %s", peerId);

				ws.on("close", function(){
					delete peers[peerId];
				});

				ws.on("message", function(message) {
					recvMessage(message, ws, peerId);
				});
			});

			http.createServer(function(request, response){
				switch(request.method){
				case "POST":
					var body = new Buffer(parseInt(request.headers["content-length"]));
					var recieved = 0;

					var conn = {
						"send": function(message){
							response.writeHead(200, {
								"Access-Control-Allow-Origin": "*",
								"Content-Type": "application/octet-stream"
							});
							response.write(message);
							response.end();
						}
					};

					request.setEncoding("binary");
					request.on("data", function(chunk){
						body.write(chunk, recieved, chunk.length, "binary");
						recieved += chunk.length;
					});
					request.on("end", function(){
						recvMessage(body, conn, -1);
					});
					break;
				case "OPTIONS":
					var requestedHeaders = request.headers["access-control-request-headers"];
					response.writeHead(200, {
						"Allow": "POST, OPTIONS",
						"Access-Control-Allow-Origin": "*",
						"Access-Control-Allow-Headers": requestedHeaders
					});
					response.end();
					break;
				default:
					console.log("Got HTTP %s request. Ignoring.", request.method);
					response.writeHead(404);
					response.end();
					break;
				}
			}).listen(httpPort);
		}
	};

})();

coordinationServer.start(8081, 8082);
