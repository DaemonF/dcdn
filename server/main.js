var WebSocketServer = require('ws').Server;
var http = require('http');
var urlparse = require('url').parse;

var nextPeerId = 1;
var peers = {};
var fileCache = {};
var urlMetadataCache = { // TODO Remove
	"http://localhost:8080/examples/chrome.png": {
		"hash": "fakeMd5Hash",
		"length": 122169,
		"contenttype": "image/png",
		"chunksize": 15000,
		"chunkcount": 9
	},
	"http://localhost:8080/examples/seattle.jpg": {
		"hash": "fakeMd5Hash",
		"length": 3232686,
		"contenttype": "image/jpeg",
		"chunksize": 50000,
		"chunkcount": 65
	}
}

new WebSocketServer({port: 8081}).on('connection', function(ws) {
	var peerId = nextPeerId++;
	peers[peerId] = ws;

	console.log('<<< New connection. PeerId: %s', peerId);

	ws.on('close', function(){
		delete peers[peerId];
	});

	ws.on('message', function(message) {
		var headerLength = message.readUInt16LE(0);
		var header = JSON.parse(buffer2str(message.slice(2, 2 + headerLength)));
		var binary = message.slice(2+headerLength);

		if( !('type' in header) ){
			console.error('!!! Got message with no type: %o', header);
			return;
		}

		if( !(header.type in messageHandlers) ){
			console.error('!!! Got message with unknown type: %o', header);
			return;
		}
		
		messageHandlers[header.type](header, ws, peerId, binary);
	});

});
