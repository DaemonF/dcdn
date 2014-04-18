function QueuedConnection(connection, onmessage){
	var conn = connection;
	conn.onmessage = onmessage;
	var q = [];

	this.send = function(msg){
		if(q !== null){
			q.push(msg);
		} else {
			console.log("Sent immediately")
			conn.send(msg);
		}
	}

	conn.onopen = function(){
		for(var i = 0; i < q.length; i++){
			console.log("Sent from q")
			conn.send(q[i]);
		}
		q = null;
	}
}
