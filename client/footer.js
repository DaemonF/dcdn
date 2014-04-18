
	this.canonicalizeUrl = function(url){
		var link = document.createElement('a');
		link.href = url;
		url = link.protocol + "//" + link.host + link.pathname + link.search;
		delete link;
		return url;
	}

	this.fetchResource = function(url, callback){
		resourceHandles[url] = {
			"callback": callback
		};
		requestMetadata(url, coordinationServer);
	}

	coordinationServer = new QueuedConnection(new WebSocket(COORD_SERVER_URL), onMessage);
}
