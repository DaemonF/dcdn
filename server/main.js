var WebSocketServer = require('ws').Server;

var nextPeerId = 1;
var peers = {};

new WebSocketServer({port: 8081}).on('connection', function(ws) {
	var peerId = nextPeerId++;
	peers[peerId] = ws;
	console.log('<<< New connection. PeerId: %s', peerId);
	ws.on('message', function(message) {
		message = JSON.parse(message);

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
