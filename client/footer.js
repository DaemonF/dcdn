	this.fetchResource = function(url, callback){
		if(fatalError){
			return callback(url);
		}

		url = canonicalizeUrl(url);

		resourceHandles[url] = {
			"callback": callback
		};
		requestMetadata(url, coordinationServer);
	}

	if(checkBrowserCompatibility()){
		coordinationServer = new WebSocket(COORD_SERVER_URL);
		coordinationServer.onmessage = onMessage;
		coordinationServer.onerror = onError;
		coordinationServer.onclose = onError;
		coordinationServer.binaryType = 'arraybuffer';
		coordinationServer = new QueuedConnection(coordinationServer);
	} else {
		onError();
	}
}
