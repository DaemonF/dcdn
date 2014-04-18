function QueuedConnection(connection, onmessage){
	var conn = connection;
	conn.onmessage = onmessage;
	var q = [];

	this.send = function(message){
		if(q !== null){
			q.push(message);
		} else {
			conn.send(message);
		}
	}

	conn.onopen = function(){
		for(var i = 0; i < q.length; i++){
			conn.send(q[i]);
		}
		q = null;
	}
}
