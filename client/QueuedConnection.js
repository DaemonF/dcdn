function QueuedConnection(connection){
	var conn = connection;
	var onopen = conn.onopen;
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

		if(onopen !== null)
			onopen.call(arguments);
	}
}
