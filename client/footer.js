
	this.canonicalizeUrl = function(url){
		var link = document.createElement('a');
		link.href = url;
		url = link.protocol + "//" + link.host + link.pathname + link.search;
		delete link;
		return url;
	}

	this.fetchResource = function(url, callback){
		if(fatalError){
			return callback(url);
		}

		resourceHandles[url] = {
			"callback": callback
		};
		requestMetadata(url, coordinationServer);
	}

	if(checkBrowserCompatibility()){
		coordinationServer = new WebSocket(COORD_SERVER_URL);
		coordinationServer.onmessage = onMessage;
		coordinationServer.onerror = onError;
		coordinationServer.binaryType = 'arraybuffer';
		coordinationServer = new QueuedConnection(coordinationServer);
	} else {
		onError();
	}
}
