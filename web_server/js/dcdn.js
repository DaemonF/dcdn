// DCDN: A Distributed Open Source CDN


// BASIC SETUP:
// A web server, a coordination server and many clients with standard web browsers.

// The web server must support the HTTP 'Range' request header

// The coordination server provides metadata about URLs, a list of peers that 
// probably have the data and a chat-room style message chanel to establish 
// P2P connections.

// The clients must be using browsers with WebRTC, otherwise the system will fallback to normal HTTP download


// PROTOCOL FLOW: (* means not implimented yet)
// (The numbering is refferenced in the code comments)
// 1) Client requests metadata about a URL from the coordination server (coo. server)
// 2) Server returns it and the client stores this static info.
// *3) The client requests a few chunks of data from the web server to utilize bandwidth while p2p is setup
// *4) Client connects to the recommended clients from the metadata
// *5) As soon as possible, client begins requesting chunks via p2p according to an algorythm of their choice (a recomended algorythm is specified in the metadata, along with fallbacks)
// 6) When all chunks are retrieved and hash validated, the chunks are assembled
// 7) An event is ommited with a local URL to the data
// This last step is slightly different for stream media and involves an inorder chunk algorythm and a URL to incomplete data once buffer has been established (TODO NICK figure this out)


// Defaults for parameters in 'tuning' section of server response
var DEFAULT_RETRYS_BEFORE_HTTP_FALLBACK = 3; // overridden by rsrcHandle.tuning['try_limit']

var chunkCache = {}; // getCacheKey(rsrcHandle) -> list of ArrayBuffers where each is a complete, validated chunk
var peerConnectionCache = {}; // Peer ID -> Peer connection (They are either open, or the other end closed them)


// Object to represent that static data about a particular URL returned by the Coordination server (jsonMetadata)
// This info is used as the main handle for a resource
function ResourceHandle(url, jsonMetadata){
	this.url = url;
	this.hash = "fakeMd5Hash";
	this.length = 122169;
	this.contenttype = "image/png";
	this.chunksize = 50000;
	this.chunkhashes = [
		"fakeMd5Hash",
		"fakeMd5Hash",
		"fakeMd5Hash"
	];
	this.chunkcount = this.chunkhashes.length;
	this.recentPeers = [
		"fakePeerID",
		"fakePeerID"
	];

	// Not required for basic function, but recommends tweaks to the clients algorytms for specific scenarios
	// Required for special cases like inOrder download for video streaming.
	this.tuning = {
		inOrderStreaming: 'false'
	};

	// Basic error checking
	if((this.chunkcount * this.chunksize) < this.length){
		console.error("There are too few chunks given the length and chunks size for "+this.url);
	}
	if((this.chunkcount * this.chunksize) >= this.length + this.chunksize){ // There could be a chunk with 1 valid byte and many zeros
		console.error("There are too many chunks given the length and chunks size for "+this.url);
	}
}

function logProtocolStep(stepNumber){
	console.log("Protocol Step #"+stepNumber);
}

// Gets the URL's metadata from the coo. server and calls back with a handle object for the URL
function getResourceHandle(url, callback){
	logProtocolStep(1);
	var rsrcHandle = new ResourceHandle(url, "fake JSON From Server"); // TODO NICK actually fetch from server
	logProtocolStep(2);
	callback(rsrcHandle);
}

function getCacheKey(rsrcHandle){
	return rsrcHandle.url+":"+rsrcHandle.hash;
}

function completeDownload(rsrcHandle, completedChunks, callback){
	console.log(completedChunks); // TODO Remove

	logProtocolStep(6);
	var blob = new Blob(completedChunks, {type: rsrcHandle.contenttype});

	logProtocolStep(7);
	callback(URL.createObjectURL(blob));
}

// Starts getting the URL by any means and calls back with a local resource URL pointing at the data.
function startDownload(rsrcHandle, callback){
	// Make a pointer to this file's spot in the global chunk cache
	var cacheKey = getCacheKey(rsrcHandle);
	if(typeof chunkCache[cacheKey] === 'undefined'){
		chunkCache[cacheKey] = [];
	}
	var completedChunks = chunkCache[cacheKey];

	// TODO NICK Refactor to dump everything into a priority waiting queue with 
	//    priority based on a lambda (inOrder for video, by recommendation 
	//    from server, etc)
	// TODO NICK Refactor to have an active queue (10 maybe?) and a waiting queue
	//    to see if that increases throughput or decreases.
	// TODO NICK Figure out a good system for Video priority and very well controlled 
	//    fallback to HTTP when the buffer is nearly out
	
	var chunksLeft = rsrcHandle.chunkcount;
	for(var i = 0; i < rsrcHandle.chunkcount; i++){
		getChunk(rsrcHandle, i, function(chunkNumber, data){
			completedChunks[chunkNumber] = data;
			chunksLeft--;

			// Could complete download from cache or from async calls to getChunk (Here)
			if(chunksLeft === 0){
				completeDownload(rsrcHandle, completedChunks, callback);
			}
		});

		// Could complete download from cache (Here) or from async calls to getChunk
		if(chunksLeft === 0){
			completeDownload(rsrcHandle, completedChunks, callback);
		}
	}
}

function getChunk(rsrcHandle, chunkNumber, callback){
	var cacheKey = getCacheKey(rsrcHandle);
	if(typeof chunkCache[cacheKey][chunkNumber] !== 'undefined'){
		// TODO NICK Good stat
		console.log("Fullfilled request from chunkCache. "+rsrcHandle.url + " chunk #"+chunkNumber);
		callback(chunkNumber, chunkCache[cacheKey][chunkNumber]);
	}
	
	_getChunkP2P(rsrcHandle, chunkNumber, function(data){
		if(data !== null){
			callback(chunkNumber, data);
		} else {
			_getChunkHTTP(rsrcHandle, chunkNumber, callback);
		}
	});
}

function _getChunkP2P(rsrcHandle, chunkNumber, callback){
	var try_limit = DEFAULT_RETRYS_BEFORE_HTTP_FALLBACK;
	if(typeof rsrcHandle.tuning['try_limit'] !== 'undefined'){
		try_limit = rsrcHandle.tuning['try_limit']; // TODO NICK Validate is a number or log error
	}

	// Try try_limit times to find a peer with the data and download it.
	for(var i = 0; i < try_limit; i++){
		var data = null; // TODO NICK impliment

		if(data !== null){
			// TODO NICK If this is the last chunk, truncate to the appropriate length based on chunksize and content length
			callback(chunkNumber, data);
			return;
		} else {
			// TODO NICK Good stat
			console.log("Failed to get "+rsrcHandle.url+" chunk #"+chunkNumber+" via P2P (Try #"+i+").");
		}
	}
	callback(null);
}

function _getChunkHTTP(rsrcHandle, chunkNumber, callback){
	var start = rsrcHandle.chunksize * chunkNumber;
	var end = Math.min(start + rsrcHandle.chunksize, rsrcHandle.length);

	var xhr = new XMLHttpRequest();
	xhr.open('GET', url, true);
	xhr.responseType = "arraybuffer";
	xhr.setRequestHeader('Range', 'bytes='+start+'-'+end); // Range header
	xhr.onload = function() {
		var data = xhr.response;
		if(data.byteLength !== (end-start)){
			if(data.byteLength == rsrcHandle.length){
				// Server returned the full file instead of Range
				console.log("Web Server returned the whole file rather than Range requested. Slicing.");
				data = data.slice(start, end); // TODO NICK Probably could be solved more efficiently
			} else {
				// TODO NICK Look into Range header spec and see if this is easily fixed.
				console.error("Web Server returned a different range than requested, but not whole file. Could not handle.")
			}
		}

		// TODO NICK Figure out what to do if the server doesnt support Range header and returns the whole file!!!
		callback(chunkNumber, data);
	}
	xhr.send(null);
}

function fetchResource(url, callback){
	getResourceHandle(url, function(rsrcHandle){ // Protocol step 1 & 2
		startDownload(rsrcHandle, function(localUrl){
			callback(url, localUrl); // Protocol step 6
		});
	});
}

/*
freedom.on('fetchResource', function(url){
	getResourceHandle(url, function(rsrcHandle){ // Protocol step 1 & 2
		startDownload(rsrcHandle, function(localUrl){
			freedom.emit('resourceReady', {url: url, src: localUrl}); // Protocol step 6
		});
	});
});

freedom.emit('dcdnReady', '');
*/
