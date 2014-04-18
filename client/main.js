function base64ToArrayBuffer(base64) {
    var binary_string =  window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array( len );
    for (var i = 0; i < len; i++)        {
        var ascii = binary_string.charCodeAt(i);
        bytes[i] = ascii;
    }
    return bytes.buffer;
}

function onMetadata(msg){
	// Stores metadata, sets up chunk queue and makes a few requests (Limited by the concurrent connection limit)
	
	// TODO Check if wanted!

	var meta = msg;
	delete meta.type;
	resourceHandles[msg.url].meta = meta;
	resourceHandles[msg.url].chunks = [];
	
	// TODO Replace with request from Peers
	chunks = [];
	for(var i = 0; i < meta.chunkcount; i++){
		chunks.push(i);
	}
	console.log(chunks)
	onChunkFail({
		"chunks": chunks,
		"url": msg.url,
		"hash": msg.hash
	});

	// TODO enqueue/request chunks up to the concurrent chunk limit
}

function onChunk(msg){
	// Stores chunk, checks if done, calls callback if so
	// Requests the next chunk in the chunk queue

	resourceHandles[msg.url].chunks[msg.chunknum] = base64ToArrayBuffer(msg.data);

	var chunks = resourceHandles[msg.url].chunks
	
	for(var i = 0; i < chunks.length; i++){
		if(typeof chunks[i] === 'undefined'){
			break;
		}

		if(i == resourceHandles[msg.url].meta.chunkcount - 1){
			// Done with download
			var blob = new Blob(chunks, {type: resourceHandles[msg.url].meta.contenttype});
			resourceHandles[msg.url].callback(URL.createObjectURL(blob));
		}
	}
}

function onChunkFail(msg){
	// Requests chunk from another source (always C. Serv at this point)
	requestChunks(msg.url, msg.hash, msg.chunks, coordinationServer);
}

function onPeerCoordMsg(msg){
	// Does WebRTC stuff for that given peer
}

function onMessage(msgEvent){
	var msg = JSON.parse(msgEvent.data);
	console.log("Got message type '%s'", msg.type);

	switch(msg.type){
		case 'metadata':
			onMetadata(msg);
			break;
		case 'chunk':
			onChunk(msg);
			break;
		case 'chunkFail':
			onChunkFail(msg);
			break;
		case 'peerCoordMsg':
			onPeerCoordMsg(msg);
			break;
		case 'error':
			console.error("Server error: %o", msg);
			break;
		default:
			console.log("Got unknown message type: %o", msg);
			break;
	}
}

function sendMessage(obj, connection){
	console.log("Sending message type '%s'", obj.type);
	connection.send(JSON.stringify(obj));
}

function requestMetadata(url, connection){
	sendMessage({
		"type": 'metadataRequest',
		"url": url
	}, connection);
}

function sendPeerCoordMesg(peerId, message, connection){
	sendMessage({
		"type": 'peerCoordMesg',
		"to": peerId,
		"msg": message
	}, connection);
}

function requestChunks(url, hash, chunklist, connection){
	sendMessage({
		"type": 'chunkRequest',
		"url": url,
		"hash": hash,
		"chunks": chunklist
	}, connection);
}

function requestMorePeers(url, hash, connection){
	sendMessage({
		"type": 'peerListRequest',
		"url": url,
		"hash": hash
	}, connection);
}
