function buffer2str(src) {
	return String.fromCharCode.apply(null, src);
}

function str2buffer(str, dest) {
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

function sendMessage(header, connection, binary){
	if(typeof binary === 'undefined' || binary === null){
		binary = new Buffer(0);
	}

	var headerString = JSON.stringify(header);
	var headerStringOffset = 2;
	var binaryOffset = headerStringOffset + headerString.length;
	var buf = new Buffer(binaryOffset + binary.length);

	// Write the header
	buf.writeUInt16LE(headerString.length, 0);
	var headerBuf = buf.slice(headerStringOffset, headerStringOffset + headerString.length);
	str2buffer(headerString, headerBuf);

	// Write the binary
	binary.copy(buf, binaryOffset);

	connection.send(buf);
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