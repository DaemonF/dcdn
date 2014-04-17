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
// *4) Client inits P2P and connects to the recommended clients from the metadata
// *5) As soon as possible, client begins requesting chunks via p2p according to an algorythm of their choice (a recomended algorythm is specified in the metadata, along with fallbacks)
// 6) When all chunks are retrieved and hash validated, the chunks are assembled
// 7) An event is ommited with a local URL to the data
// This last step is slightly different for stream media and involves an inorder chunk algorythm and a URL to incomplete data once buffer has been established (TODO NICK figure this out)

//TODO NICK Remove need for these static defines
COORD_SERVER_URL="ws://localhost:8081/";

function ResourceHandle(url, metadata){
	this.url = url;
	this.hash = metadata.hash; // TODO NICK Impliment hash checking
	this.length = metadata.length;
	this.contenttype = metadata.contenttype;
	this.chunksize = metadata.chunksize;
	this.chunkhashes = metadata.chunkhashes;
	this.chunkcount = this.chunkhashes.length;
	this.peers = metadata.peers;

	function toString(){
		return this.url+" <"+this.hash+">";
	}

	// Basic error checking
	if((this.chunkcount * this.chunksize) < this.length){
		console.error("There are too few chunks given the length and chunks size for "+toString());
	}
	if((this.chunkcount * this.chunksize) >= this.length + this.chunksize){ // There could be a chunk with 1 valid byte and many zeros
		console.error("There are too many chunks given the length and chunks size for "+toString());
	}

	this.toString = toString;
}

// Represents a connection to the Coordination Server. This connection multiplexs many channels over a single WebSocket
function CoordServ(){
	var socket = new WebSocket(COORD_SERVER_URL);
	var channels = [];
	var onReadyQueue = [];
	var channelNum = 1;

	socket.onopen = function(){
		for(var i = 0; i < onReadyQueue.length; i++){
			onReadyQueue[i]();
		}
		delete onReadyQueue;
	};

	socket.onmessage = function(msgEvent){
		var msg = JSON.parse(msgEvent.data);
		var channelNum = msg['channel'];
		chan = channels[channelNum];
		if(typeof chan !== 'undefined'){
			chan.onmessage(msg);
		} else {
			console.error("Got message for unregistered channel: "+msg);
		}
	};

	function sendmessage(msg){
		if(onReadyQueue){
			onReadyQueue.push(function(){
				socket.send(JSON.stringify(msg));
			});
		} else {
			socket.send(JSON.stringify(msg));
		}
	}

	function Channel(channelNum){
		this.socket = socket;
		this.channelNum = channelNum;
		
		this.send = function(msg){
			msg['channel'] = this.channelNum;
			sendmessage(msg);
		}

		this.onmessage = null;
	}

	this.openChannel = function(){
		chan = new Channel(channelNum);
		channels[channelNum] = chan;
		channelNum++;
		return chan;
	}
}

/**
 *	This object helps coordinate chunk downloading by providing an event based interface for coordinating chunk download and reassembly.
 *  Its main purpose is to forward chunk download failures and success to any code segment that needs that info.
 *  The setChunk and failChunk methods are called to signal that the current attempt to obtain that chunk failed or succeded and trigger the relevant events.
 */
function ChunkManager(rsrcHandle){
	var LOCAL_STORAGE_KEY = 'chunkCache:'+rsrcHandle.toString();
	var chunkDoneHandlers = [];
	var chunkFailHandlers = [];
	var cache = [];

	// TODO NICK Read in persistent cache from localstorage or from shared worker.

	function registerHandler(handlerVar, chunkNumber, callback){
		if(chunkNumber == -1){
			for(var i = 0; i < rsrcHandle.chunkcount; i++){
				registerHandler(handlerVar, i, callback);
			}
		}
		if(typeof handlerVar[chunkNumber] === 'undefined'){
			handlerVar[chunkNumber] = []
		}
		handlerVar[chunkNumber].push(callback);
	}

	// Register a download success handler for a specific chunk number, or -1 to register for all chunk numbers
	this.registerChunkDoneHandler = function(chunkNumber, callback){
		if(typeof cache[chunkNumber] !== 'undefined'){
			callback(rsrcHandle, chunkNumber, cache[chunkNumber]);
		} else {
			registerHandler(chunkDoneHandlers, chunkNumber, callback);
		}
	}

	// Register a download failure handler for a specific chunk number, or -1 to register for all chunk numbers
	this.registerChunkFailHandler = function(chunkNumber, callback){
		if(typeof cache[chunkNumber] === 'undefined'){
			registerHandler(chunkFailHandlers, chunkNumber, callback);
		}
	}

	this.setChunk = function(chunkNumber, data){
		if(typeof cache[chunkNumber] === 'undefined'){
			cache[chunkNumber] = data;

			// Call then clear all handlers for this chunk
			if(typeof chunkDoneHandlers[chunkNumber] !== 'undefined'){
				var handlers = chunkDoneHandlers[chunkNumber];
				delete chunkDoneHandlers[chunkNumber];
				delete chunkFailHandlers[chunkNumber];
				for(var i = 0; i < handlers.length; i++){
					handlers[i](rsrcHandle, chunkNumber, data);
				}
			}

			// TODO NICK eval policy to decide what to keep and throw out, then cache to persistant storage
			// TODO NICK write cached stuff to persistent storage or shared worker
		} else {
			// TODO NICK LOGSTAT
			console.log("Got a duplicate chunk.");
		}
	}

	// Called by a chunk fetcher to signify that it failed to obtain the chunk.
	// One of the chunk fail handlers should try another method of obtaining the chunk.
	this.failChunk = function(chunkNumber){
		if(typeof cache[chunkNumber] !== 'undefined'){
			return; // If the chunk is already here, ignore failure.
		}
		if(typeof chunkFailHandlers[chunkNumber] !== 'undefined'){
			var handlers = chunkFailHandlers[chunkNumber];
			for(var i = 0; i < handlers.length; i++){
				handlers[i](rsrcHandle, chunkNumber);
			}
		} else {
			console.error("No fail handler for "+rsrcHandle+" chunk #"+chunkNumber+". The chunk may never be downloaded.");
		}
	}
}

function PeerManager(coordServ){
	this.connectToPeer = function(){

		// Check peer cache and connect if not there
	}

}

function DCDN(){
	// TODO NICK These two items being persistant would make this system SOOOO much more efficient
	var coordServ = new CoordServ();
	var metadataChannel = coordServ.openChannel();
	var peers = PeerManager(); // Peer ID -> Peer connection (They are either open, or the other end closed them)

	// Object to represent that static data about a particular URL returned by the Coordination server (jsonMetadata)
	// This info is used as the main handle for a resource
	

	function logProtocolStep(stepNumber){
		var delay = "";
		if(typeof window.performance !== 'undefined'){
			now = new Date().getTime();
			delay = now - window.performance.timing.navigationStart + "ms - ";
		}
		console.log(delay + "Protocol Step #"+stepNumber);
	}

	// Gets the URL's metadata from the coo. server and calls back with a handle object for the file at that URL
	function getResourceHandle(url, callback){
		logProtocolStep(1);
		metadataChannel.onmessage = function(response){
			var rsrcHandle = new ResourceHandle(url, response['metadata']);
			logProtocolStep(2);
			callback(rsrcHandle);
		}

		metadataChannel.send({"url":url, "action":"getMetadata"});
	}

	// Starts downloading the URL and calls back one or more times with a URL pointing to the data available
	function startDownload(rsrcHandle, callback){
		// TODO NICK Refactor to dump everything into a priority waiting queue with 
		//    priority based on a lambda (inOrder for video, by recommendation 
		//    from server, etc)
		// TODO NICK Refactor to have an active queue (10 maybe?) and a waiting queue
		//    to see if that increases throughput or decreases.
		// TODO NICK Figure out a good system for Video priority and very well controlled 
		//    fallback to HTTP when the buffer is nearly out

		var chunkMgr = new ChunkManager(rsrcHandle);
		
		// This algorythm will request all chunks at once and yeild to the client everytime a longer stretch of in-order file is complete
		var completedChunks = [];
		var lastYielded = 0; // The last longest string of in-order chunks we gave to the client
		
		chunkMgr.registerChunkDoneHandler(-1, function(rsrcHandle, chunkNumber, data){
			completedChunks[chunkNumber] = data;

			var inOrderDone = []
			for(var i = 0; i < completedChunks.length; i++){
				if(typeof completedChunks[i] !== 'undefined'){
					inOrderDone.push(completedChunks[i]);
				} else {
					break;
				}
			}

			//if(inOrderDone.length == rsrcHandle.chunkcount){
			if(inOrderDone.length > lastYielded){
				lastYielded = inOrderDone.length;
				logProtocolStep(6);
				var blob = new Blob(inOrderDone, {type: rsrcHandle.contenttype});
				logProtocolStep(7);
				callback(URL.createObjectURL(blob));
				return;
			}
		});
		chunkMgr.registerChunkFailHandler(-1, function(rsrcHandle, chunkNumber){
			getChunkHTTP(rsrcHandle, chunkMgr, i);
		});

		for(var i = 0; i < rsrcHandle.chunkcount; i++){
			getChunkP2P(rsrcHandle, chunkMgr, i);
		}
		// End of in-order, multi-yeild algorythm
	}

	function initP2P(rsrcHandle){
		logProtocolStep(4);
		// TODO NICK Add all the peers from the rsrcHandle to the peerConnectionCache and open data channels
		// These will be used as soon as added to the cache because the chunk fetcher tries to use them!
	}

	function getChunkP2P(rsrcHandle, chunkMgr, chunkNumber){
		// TODO NICK impliment P2P data fetch
		var data = null;
		if(data === null){
			chunkMgr.failChunk(chunkNumber);
			return;
		}

		// If this is the last chunk, truncate to the appropriate length based on chunksize and content length
		if(data !== null && rsrcHandle.chunkcount == chunkNumber){
			data = data.slice(0, rsrcHandle.length % rsrcHandle.chunksize);
		}

		chunkMgr.setChunk(chunkNumber, data);
		return;
	}

	function getChunkHTTP(rsrcHandle, chunkMgr, chunkNumber){
		var start = rsrcHandle.chunksize * chunkNumber;
		var end = Math.min(start + rsrcHandle.chunksize, rsrcHandle.length) - 1;
		var expectedLength = (end - start) + 1;

		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.responseType = "arraybuffer";
		xhr.setRequestHeader('Range', 'bytes='+start+'-'+end); // Range header
		xhr.onload = function() {
			var data = xhr.response;
			if(data.byteLength == expectedLength) {
				chunkMgr.setChunk(chunkNumber, data);
			} else {
				if(data.byteLength == rsrcHandle.length){ // Special case for full HTTP resposne (instead of the Range requested)
					// TODO NICK Good stat (Determine if Range is a viable fallback vs. just full HTTP)
					for(var i = rsrcHandle.chunkcount; i >= 0; i--){
						start = rsrcHandle.chunksize * i;
						end = Math.min(start + rsrcHandle.chunksize, rsrcHandle.length);
						chunkMgr.setChunk(i, data.slice(start, end));
					}
				} else {
					// TODO NICK This happens in Chrome against Nginx so its important. Seems to have to do with gzip?
					console.error("Web Server returned a different range than requested, but not whole file. Could not handle. Expected: "+expectedLength+" Got: "+data.byteLength+". Headers:\n\n"+xhr.getAllResponseHeaders())
				}
			}
		}
		xhr.send(null);
		chunkMgr.registerChunkDoneHandler(chunkNumber, function(){
			if(xhr.readyState != 4){
				xhr.abort();
			}
		});
	}

	function browserMeetsRequirements(){
		return true;
	}

	this.canonicalizeUrl = function(url){
		var link = document.createElement('a'); // Helper <a> tag used for canonicalization
		link.href = url;
		url = link.protocol + "//" + link.host + link.pathname + link.search;
		delete link;
		return url;
	}

	this.fetchResource = function(url, callback){
		if(browserMeetsRequirements()){
			getResourceHandle(url, function(rsrcHandle){ // Protocol step 1 & 2
				initP2P(rsrcHandle); // TODO NICK Implement
				startDownload(rsrcHandle, function(localUrl){
					callback(url, localUrl); // Protocol step 6
				});
			});
		} else {
			callback(url, url);
		}
	}
}

var dcdn = new DCDN();
