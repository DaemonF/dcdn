function sendMessage(obj, connection){
	console.log("<<< [%s]", obj.type);
	connection.send(BSON.serialize(obj));
}

function onMessage(msgEvent){
	var message = BSON.deserialize(new Uint8Array(msgEvent.data));
	console.log(">>> [%s]", message.type);

	if(! ('type' in message) ){
		console.error('Got message with no type: %o', message);
		return;
	}

	if(! (message.type in messageHandlers) ){
		console.error('Got message with unknown type: %o', message);
		return;
	}

	if('url' in message && ! message.url in resourceHandles){
		console.error('Got message about a URL we dont care about: %s', message.url);
		return;
	}

	messageHandlers[message.type](message);
}

function localDescCreated(peerId, msgChannel, desc){
	var conn = peerConnections[peerId];
	conn.setLocalDescription(desc, function () {
		sendPeerCoordMesg(peerId, 'sdp', conn.localDescription, msgChannel);
	}, logError);
}

function requestMetadata(url, connection){
	sendMessage({
		"type": 'metadataRequest',
		"url": url
	}, connection);
}

function sendPeerCoordMesg(peerId, type, message, connection){
	var msg = {
		"type": 'peerCoordMsg',
		"to": peerId
	}
	msg[type] = message;
	sendMessage(msg, connection);
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
