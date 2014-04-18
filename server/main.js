var WebSocketServer = require('ws').Server;
var BSON = require('bson').pure().BSON;
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


new WebSocketServer({port: 8081}).on('connection', function(ws) {
	var peerId = nextPeerId++;
	peers[peerId] = ws;
	console.log('<<< New connection. PeerId: %s', peerId);
	ws.on('message', function(message) {
		message = BSON.deserialize(message);

		if( !('type' in message) ){
			console.error('!!! Got message with no type: %o', message);
			return;
		}

		if( !(message.type in messageHandlers) ){
			console.error('!!! Got message with unknown type: %o', message);
			return;
		}
		
		messageHandlers[message.type](message, ws, peerId);
	});
});
