var messageHandlers = {
	"metadata": function(message){
		if( !(message.url in resourceHandles) ){
			return console.error("Got metadata for a URL we dont care about.");
		}

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

		if(meta.peers.length != 0){
			for(var i = 0; i < handle.chunkqueue.length; i++){
				var chunknum = handle.chunkqueue[i];

				var peerId = meta.peers[i % meta.peers.length];
				if( !(peerId in peerConnections) ){
					connectToPeer(peerId, true);
				}
				requestChunks(meta.url, meta.hash, [chunknum], peerConnections[peerId].dataChannel);
			}
		} else {
			requestChunks(meta.url, meta.hash, handle.chunkqueue, coordinationServer);
		}
	},

	"chunk": function(message, conn, binary){
		// Stores chunk, checks if done, calls callback if so
		// Requests the next chunk in the chunk queue
		var handle = resourceHandles[message.url];
		handle.chunks[message.chunk] = binary;

		var inOrderComplete = [];
		for(var i = 0; i < handle.chunks.length; i++){
			if(typeof handle.chunks[i] === 'undefined'){
				break;
			} else {
				inOrderComplete.push(handle.chunks[i]);
			}
		}

		if(inOrderComplete.length > handle.lastYeilded){
			handle.lastYeilded = inOrderComplete.length;
			var blob = new Blob(inOrderComplete, {type: handle.meta.contenttype});
			handle.callback(URL.createObjectURL(blob));
		}
	},

	"chunkfail": function(message){
		// Requests chunk from another source (always C. Serv at this point)
		requestChunks(message.url, resourceHandles[message.url].meta.hash, [message.chunk], coordinationServer);
	},

	"chunkRequest": function(message, conn){
		for(var i = 0; i < message.chunks.length; i++){
			var chunk = message.chunks[i];
		
			var reply = {
				"url": message.url,
				"chunk": chunk,
			}

			if(typeof resourceHandles[message.url] !== 'undefined' &&
				typeof resourceHandles[message.url].chunks[chunk] !== 'undefined'){
				reply.type = 'chunk';
				sendMessage(reply, conn, resourceHandles[message.url].chunks[chunk]);
			} else {
				reply.type = 'chunkfail';
				sendMessage(reply, conn);
			}
		}
	},

	"peerCoordMsg": function(message){
		if( !(message.from in peerConnections) ){
			connectToPeer(message.from, false);
		}

		var conn = peerConnections[message.from];

		if (message.sdp){
			conn.setRemoteDescription(new RTCSessionDescription(message.sdp), function () {
				if (conn.remoteDescription.type == 'offer'){
					conn.createAnswer(function(desc){
						conn.setLocalDescription(desc, function () {
							sendPeerCoordMesg(message.from, 'sdp', conn.localDescription);
						}, logError);
					}, logError);
				}
			}, logError);
		} else if (message.candidate){
			conn.addIceCandidate(new RTCIceCandidate(message.candidate));
		}
	},

	"error": function(message){
		console.error("Server error: %o", message);
	}
}
