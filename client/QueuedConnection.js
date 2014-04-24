function QueuedConnection(connection){
	var conn = connection;
	var onopen = conn.onopen;
	var onmessage = conn.onmessage;
	var q = [];

	this.send = function(message){
		if(q !== null){
			q.push(message);
		} else {
			conn.send(message);
		}
	}

	conn.onmessage = function(msgEvent){
		msgEvent.conn = conn;
		if(onmessage !== null)
			onmessage(msgEvent);
	}

	conn.onopen = function(evt){
		for(var i = 0; i < q.length; i++){
			conn.send(q[i]);
		}
		q = null;

		if(onopen !== null)
			onopen(evt);
	}
}
