var videoTags = document.querySelectorAll('video[data-src]');
for(var i = 0; i < videoTags.length; i++){
	var tag = videoTags[i];
	var url = tag.getAttribute("data-src");
	var ms = new MediaSource();

	ms.addEventListener('sourceopen', function(e) {
		var sourceBuffer = ms.addSourceBuffer('video/webm; codecs="vorbis,vp8"');

		var nextDesiredChunk = 0;

		var onprogress = function(metadata, data){
			console.log("progress")

			if(data.length == metadata.chunkcount){
				console.log("DONE");
				(function readChunk_(i){
					var chunk = data[i];
					setTimeout(function(){
						if(i == metadata.chunkcount){
							ms.endOfStream();
							return;
						}

						sourceBuffer.appendBuffer(chunk);
						console.log('appended chunk:' + i);
						readChunk_(++i);
					}, 0);
				})(nextDesiredChunk);
			}
		};

		var oncomplete = function(getBlobUrl){
			console.log("complete")
			//tag.src = getBlobUrl();
		};

		DCDN.fetchResource(url, oncomplete, onprogress);
	}, false);

	tag.src = URL.createObjectURL(ms);
}