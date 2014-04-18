var messageHandlers = {
	"metadata": function(message){
		// Stores metadata, sets up chunk queue and makes a few requests (Limited by the concurrent connection limit)
		var meta = message;
		delete meta.type;
		resourceHandles[message.url].meta = meta;
		resourceHandles[message.url].chunks = [];
		
		// TODO Replace with actual request from Peers
		chunks = [];
		for(var i = 0; i < meta.chunkcount; i++){
			chunks.push(i);
		}
		onMessage({"data": BSON.serialize({
				"type": 'chunkfail',
				"chunks": chunks,
				"url": message.url,
				"hash": message.hash
		})});

		// TODO enqueue/request chunks up to the concurrent chunk limit
	},

	"chunk": function(message){
		// Stores chunk, checks if done, calls callback if so
		// Requests the next chunk in the chunk queue

		resourceHandles[message.url].chunks[message.chunk] = message.data.buffer;

		var chunks = resourceHandles[message.url].chunks
		
		for(var i = 0; i < chunks.length; i++){
			if(typeof chunks[i] === 'undefined'){
				break;
			}

			if(i == resourceHandles[message.url].meta.chunkcount - 1){
				// Done with download
				var blob = new Blob(chunks, {type: resourceHandles[message.url].meta.contenttype});
				resourceHandles[message.url].callback(URL.createObjectURL(blob));
			}
		}
	},

	"chunkfail": function(message){
		// Requests chunk from another source (always C. Serv at this point)
		requestChunks(message.url, message.hash, message.chunks, coordinationServer);
	},

	"peerCoordMsg": function(message){
		if(! (message.from in peerConnections) ){
			start(); // TODO
		}

		var conn = peerConnections[message.from];

		if (message.sdp){
			conn.setRemoteDescription(new RTCSessionDescription(message.sdp), function () {
				if (conn.remoteDescription.type == 'offer')
					conn.createAnswer(localDescCreated, logError);
			}, logError);
		} else if (message.candidate){
			conn.addIceCandidate(new RTCIceCandidate(message.candidate));
		}
	},

	"error": function(message){
		console.error("Server error: %o", message);
	}
}
