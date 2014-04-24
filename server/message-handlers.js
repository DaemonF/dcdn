messageHandlers = {
	"metadataRequest": function(message, ws, myPeerId){
		console.log('<<< [%s] for %s', message.type, message.url);
		loadMetadata(message.url, function(metadata){
			var reply = metadata;
			reply.type = 'metadata';
			reply.url = message.url;

			// Replace this with file specific peers
			var peerlist = [];
			for(var peerId in peers){
				if(myPeerId != peerId){
					peerlist.push(peerId);
				}
			}
			reply.peers = peerlist;

			console.log('>>> [%s] for %s', reply.type, reply.url);
			sendMessage(reply, ws);
		});
	},

	"chunkRequest": function(message, ws){
		console.log('<<< [%s] chunk: %s for %s', message.type, message.chunks, message.url);
		loadFile(message.url, function(file){
			loadMetadata(message.url, function(metadata){
				for(var i = 0; i < message.chunks.length; i++){
					var chunk = message.chunks[i];
					var start = chunk * metadata.chunksize;
					var end = Math.min(start + metadata.chunksize, metadata.length);

					var reply = {
						"type": 'chunk',
						"url": message.url,
						"chunk": chunk
					}

					console.log('>>> [%s] chunk: %s for %s', reply.type, reply.chunk, reply.url);
					sendMessage(reply, ws, file.slice(start, end));
				}
			});
		});	
	},

	"peerCoordMsg": function(message, ws, peerId){
		console.log('<<< [%s] from: %s to: %s', message.type, peerId, message.to);
		message.from = peerId;

		if( !(message.to in peers) ){
			return console.error("!!! Unknown destination peerId: %s", message.to); // TODO Should return an error to the client
		}

		// TODO check if the connection to the other peer is still open, if not return error to the client

		console.log('>>> [%s] forwarded from: %s to: %s', message.type, message.from, message.to);
		sendMessage(message, peers[message.to]);
	}
}
