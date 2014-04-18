
function sendMessage(message, connection){
	connection.send(BSON.serialize(message));
}

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

function loadMetadata(url, callback){
	if(url in urlMetadataCache){
		callback(urlMetadataCache[url]);
	} else {
		// TODO impliment
		console.log("Error: url not in metadata cache: "+url);
	}
}