var WebSocketServer = require('ws').Server;

new WebSocketServer({port: 8081}).on('connection', function(ws) {
	ws.on('message', function(message) {
		message = JSON.parse(message);
		console.log('<<< %s', message.type);

		if(! 'type' in message){
			console.error('Got message with no type: %o', message);
			return;
		}

		if(! message.type in messageHandlers){
			console.error('Got message with unknown type: %o', message);
		}
		
		messageHandlers[message.type](message, function(reply){
			console.log('>>> %s', reply.type);
			ws.send(JSON.stringify(reply));
		});
	});
});
