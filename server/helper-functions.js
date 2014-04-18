function sendMessage(message, connection){
	connection.send(JSON.stringify(message));
}

var http = require('http');
var urlparse = require('url').parse;
var fileCache = {};
function loadFile(url, callback){
	if(url in fileCache){
		callback(fileCache[url]);
	} else {
		console.log("Loading file from URL...");
		http.get(urlparse(url), function(res) {
		    var data = [];
		    res.on('data', function(chunk) {
		        data.push(new Buffer(chunk));
		    });
		    res.on('end', function() {
		    	var buffer = Buffer.concat(data);
		    	fileCache[url] = buffer;
		    	callback(buffer);
		    });
		});
	}
}

// TODO NICK get this data from the files directly
var urlMetadataCache = {
	"http://localhost:8080/examples/chrome.png": {
		"hash": "fakeMd5Hash",
		"length": 122169,
		"contenttype": "image/png",
		"chunksize": 150000,
		"chunkhashes": [
			"fakeMd5Hash",
		],
		"chunkcount": 1,
		"peers": []
	},
	"http://localhost:8080/examples/seattle.jpg": {
		"hash": "fakeMd5Hash",
		"length": 3232686,
		"contenttype": "image/jpeg",
		"chunksize": 500000,
		"chunkhashes": [
			"fakeMd5Hash",
			"fakeMd5Hash",
			"fakeMd5Hash",
			"fakeMd5Hash",
			"fakeMd5Hash",
			"fakeMd5Hash",
			"fakeMd5Hash",
		],
		"chunkcount": 7,
		"peers": []
	}
}
function loadMetadata(url, callback){
	if(url in urlMetadataCache){
		callback(urlMetadataCache[url]);
	} else {
		// TODO impliment
		console.log("Error: url not in metadata cache: "+url);
	}
}