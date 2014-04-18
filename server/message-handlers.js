messageHandlers = {
	"metadataRequest": function(message, sendReply){
		loadMetadata(message.url, function(metadata){
			metadata.type = 'metadata';
			metadata.url = message.url;
			sendReply(metadata);
		});
	},
	"chunkRequest": function(message, sendReply){
		loadFile(message.url, function(file){
			loadMetadata(message.url, function(metadata){
				for(var i = 0; i < message.chunks.length; i++){
					var chunk = message.chunks[i];
					var start = chunk * metadata.chunksize;
					var end = Math.min(start + metadata.chunksize, metadata.length);
					sendReply({
						"type": 'chunk',
						"url": message.url,
						"chunknum": chunk,
						"data": file.toString('base64')
					});
				}
			});
		});	
	},
}
