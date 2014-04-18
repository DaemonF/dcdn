messageHandlers = {
	"metadataRequest": function(message, ws){
		console.log('<<< [%s] for %s', message.type, message.url);
		loadMetadata(message.url, function(metadata){
			var reply = metadata;
			reply.type = 'metadata';
			reply.url = message.url;

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
						"chunk": chunk,
						"data": file.toString('base64')
					}

					console.log('>>> [%s] chunk: %s for %s', reply.type, reply.chunk, reply.url);
					sendMessage(reply, ws);
				}
			});
		});	
	},

	"peerCoordMsg": function(message, ws, peerId){
		console.log('<<< [%s] to: %s', message.type, message.to);
		message.from = peerId;

		if( !(message.to in peers) ){
			return console.error("!!! Unknown destination peerId: %s", message.to); // TODO Should return an error to the client
		}

		// TODO check if the connection to the other peer is still open, if not return error to the client

		console.log('>>> [%s] forwarded to: %s', message.type, message.to);
		sendMessage(message, peers[message.to]);
	}
}
