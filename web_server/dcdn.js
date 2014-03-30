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

//TODO NICK Remove need for these static defines
COORD_SERVER_URL="ws://localhost:8081/";

function ResourceHandle(url, metadata){
	this.url = url;
	console.log(metadata)
	this.hash = metadata.hash; // TODO NICK Impliment hash checking
	this.length = metadata.length;
	this.contenttype = metadata.contenttype;
	this.chunksize = metadata.chunksize;
	this.chunkhashes = metadata.chunkhashes;
	this.chunkcount = this.chunkhashes.length;
	this.peers = metadata.peers;

	// Basic error checking
	if((this.chunkcount * this.chunksize) < this.length){
		console.error("There are too few chunks given the length and chunks size for "+this.url);
	}
	if((this.chunkcount * this.chunksize) >= this.length + this.chunksize){ // There could be a chunk with 1 valid byte and many zeros
		console.error("There are too many chunks given the length and chunks size for "+this.url);
	}
}

function CoordServ(){
	var socket = new WebSocket(COORD_SERVER_URL);
	var messageIdToCallback = {};
	var queue = []
	var lastId = 0;

	function send(msg, callback){
		if(socket.readyState != 1){
			queue.push(msg)
			queue.push(callback);
		} else {
			lastId++;
			var id = lastId;
			msg['id'] = id;
			messageIdToCallback[id] = callback;
			socket.send(JSON.stringify(msg));
		}
	}

	socket.onmessage = function(msgEvent){
		var msg = JSON.parse(msgEvent.data);
		var id = msg['replyTo'];
		messageIdToCallback[id](msg);
		delete messageIdToCallback[id];
	};

	socket.onopen = function(){
		for(var i = 0; i < queue.length; i += 2){
			send(queue[i], queue[i+1]);
		}
		delete queue;
	};

	this.sendMessage = send;
}

function DCDN(){
	// Defaults for parameters in 'tuning' section of server response
	var DEFAULT_RETRYS_BEFORE_HTTP_FALLBACK = 3; // overridden by rsrcHandle.tuning['try_limit']


	// TODO NICK These two items being persistant would make this system SOOOO much more efficient
	var chunkCache = {}; // getCacheKey(rsrcHandle) -> list of ArrayBuffers where each is a complete, validated chunk
	var coordServ = new CoordServ();
	var peerConnectionCache = {}; // Peer ID -> Peer connection (They are either open, or the other end closed them)

	// Object to represent that static data about a particular URL returned by the Coordination server (jsonMetadata)
	// This info is used as the main handle for a resource
	

	function logProtocolStep(stepNumber){
		console.log("Protocol Step #"+stepNumber);
	}

	this.canonicalizeUrl = function(url){
		var link = document.createElement('a'); // Helper <a> tag used for canonicalization
		link.href = url;
		url = link.protocol + "//" + link.host + link.pathname + link.search;
		delete link;
		return url;
	}

	// Gets the URL's metadata from the coo. server and calls back with a handle object for the URL
	function getResourceHandle(url, callback){
		logProtocolStep(1);
		coordServ.sendMessage({"url":url, "action":"getMetadata"}, function(response){
			var rsrcHandle = new ResourceHandle(url, response['metadata']);
			logProtocolStep(2);
			callback(rsrcHandle); return;
		});
	}

	function getCacheKey(rsrcHandle){
		return rsrcHandle.url+":"+rsrcHandle.hash;
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
		// TODO NICK Keep track of attempts up here and make getChunk try or fail

		var lastYielded = 0;
		for(var i = 0; i < rsrcHandle.chunkcount; i++){
			getChunk(rsrcHandle, i, 0, function(chunkNumber, data){
				completedChunks[chunkNumber] = data;

				var inOrderDone = []
				for(var i = 0; i < completedChunks.length; i++){
					if(typeof completedChunks[i] !== 'undefined'){
						inOrderDone.push(completedChunks[i]);
					} else {
						break;
					}
				}

				if(inOrderDone.length > lastYielded){
					lastYielded = inOrderDone.length;
					logProtocolStep(6);
					var blob = new Blob(inOrderDone, {type: rsrcHandle.contenttype});
					logProtocolStep(7);
					callback(URL.createObjectURL(blob)); return;
				}
			});
		}
	}

	function getChunk(rsrcHandle, chunkNumber, attempts, callback){
		var cacheKey = getCacheKey(rsrcHandle);
		if(typeof chunkCache[cacheKey][chunkNumber] !== 'undefined'){
			// TODO NICK Good stat
			console.log("Fullfilled request from chunkCache. "+rsrcHandle.url + " chunk #"+chunkNumber);
			callback(chunkNumber, chunkCache[cacheKey][chunkNumber]); return;
		}

		var try_limit = DEFAULT_RETRYS_BEFORE_HTTP_FALLBACK; // TODO NICK Decide if this should stay
		
		console.log("Attempt: "+attempts);
		if(attempts >= try_limit){
			_getChunkHTTP(rsrcHandle, chunkNumber, callback); return;
		}

		_getChunkP2P(rsrcHandle, chunkNumber, function(chunkNumber, data){
			if(data !== null){
				callback(chunkNumber, data); return;
			} else {
				console.log("Failed to get "+rsrcHandle.url+" chunk #"+chunkNumber+" via P2P (Try #"+(attempts+1)+").");
				getChunk(rsrcHandle, chunkNumber, attempts + 1, callback); return;
			}
		});
	}

	function _getChunkP2P(rsrcHandle, chunkNumber, callback){
		var data = null;

		// TODO NICK impliment

		// If this is the last chunk, truncate to the appropriate length based on chunksize and content length
		if(data !== null && rsrcHandle.chunkcount == chunkNumber){
			data = data.slice(0, rsrcHandle.length % rsrcHandle.chunksize);
		}

		callback(chunkNumber, data); return;
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
					// TODO NICK Good stat (Determine if Range is a viable fallback vs. just full HTTP)
					console.log("Web Server returned full file instead of Range requested.")
					// TODO NICK Consider filling in all the cache in this case? Might be worthwhile
					data = data.slice(start, end);
				} else {
					// TODO NICK This happens in Chrome against Nginx so its important. Seems to have to do with gzip?
					console.error("Web Server returned a different range than requested, but not whole file. Could not handle. Expected: "+(end-start)+" Got: "+data.byteLength+". Headers:\n\n"+xhr.getAllResponseHeaders())
				}
			}

			callback(chunkNumber, data); return;
		}
		xhr.send(null);
	}

	function initP2P(rsrcHandle){
		// TODO NICK Add all the peers from the rsrcHandle to the peerConnectionCache and open data channels
		// These will be used as soon as added to the cache because the chunk fetcher tries to use them!
	}

	this.fetchResource = function(url, callback){
		getResourceHandle(url, function(rsrcHandle){ // Protocol step 1 & 2
			initP2P(rsrcHandle); // TODO NICK Implement
			startDownload(rsrcHandle, function(localUrl){
				callback(url, localUrl); // Protocol step 6
			});
		});
	}
}

var dcdn = new DCDN();
