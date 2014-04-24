function checkBrowserCompatibility(){
	return ('WebSocket' in window &&
		'RTCPeerConnection' in window);
}

function canonicalizeUrl(url){
	var link = document.createElement('a');
	link.href = url;
	url = link.protocol + "//" + link.host + link.pathname + link.search;
	delete link;
	return url;
}

function uint8Array2str(src) {
	return String.fromCharCode.apply(null, src);
}

function str2uint8Array(str, dest) {
	if(dest.length != str.length){
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

// Message format is [headerString.length]|[headerString in ASCII]|[binary message]
function sendMessage(header, connection, binary){
	if(typeof binary === 'undefined' || binary === null){
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

function onMessage(msgEvent){
	var headerLength = new Uint16Array(msgEvent.data, 0, 1)[0];
	var header = JSON.parse(uint8Array2str(new Uint8Array(msgEvent.data, 2, headerLength)));
	var binary = new Uint8Array(msgEvent.data, 2+headerLength);

	console.log("GOT [%s] [Binary: %sB] %o", header.type, binary.length, header);

	if(! ('type' in header) ){
		console.error('Got message with no type: %o', header);
		return;
	}

	if(! (header.type in messageHandlers) ){
		console.error('Got message with unknown type: %o', header);
		return;
	}

	if('url' in header && ! header.url in resourceHandles){
		console.error('Got message about a URL we dont care about: %s', header.url);
		return;
	}

	messageHandlers[header.type](header, msgEvent.conn, binary);
}

function onError(){
	console.error('Fatal error. Throwing back to normal download.');
	fatalError = true;
	for(var url in resourceHandles){
		resourceHandles[url].callback(url);
	}
}

function setupDataChannel(conn, dataChannel){
	dataChannel.onmessage = onMessage;
	dataChannel.onclose = function(evt){
		console.error("CONN CLOSED: ", conn, evt);
	}
	dataChannel.onerror = function(evt){
		console.error("CONN ERRORED: ", conn, evt);
	}
	conn.dataChannel = new QueuedConnection(dataChannel);
}

function connectToPeer(peerId, isInitiator){
	var conn = peerConnections[peerId] = new RTCPeerConnection(STUN_CONFIG);

	// send any ice candidates to the other peer
	conn.onicecandidate = function (evt) {
		if (evt.candidate){
			sendPeerCoordMesg(peerId, 'candidate', evt.candidate);
		}
	};

	// let the 'negotiationneeded' event trigger offer generation
	conn.onnegotiationneeded = function () {
		conn.createOffer(function(desc){
			conn.setLocalDescription(desc, function () {
				sendPeerCoordMesg(peerId, 'sdp', conn.localDescription);
			}, logError);
		}, logError);
	}

	if (isInitiator) {
        setupDataChannel(conn, conn.createDataChannel("dcdn", RTC_DATA_CHAN_CONFIG));
    } else {
        conn.ondatachannel = function (evt) {
            setupDataChannel(conn, evt.channel);
        };
    }
}

function requestMetadata(url){
	sendMessage({
		"type": 'metadataRequest',
		"url": url
	}, coordinationServer);
}

function sendPeerCoordMesg(peerId, type, message){
	var msg = {
		"type": 'peerCoordMsg',
		"to": peerId
	}
	msg[type] = message;
	sendMessage(msg, coordinationServer);
}

function requestChunks(url, hash, chunklist, connection){
	sendMessage({
		"type": 'chunkRequest',
		"url": url,
		"hash": hash,
		"chunks": chunklist
	}, connection);
}

function requestMorePeers(url, hash){
	sendMessage({
		"type": 'peerListRequest',
		"url": url,
		"hash": hash
	}, coordinationServer);
}
