var imap = {}; // imap maps unique urls to the image tags they feed (TODO NICK refactor)

function canonicalize(url){
	var link = document.createElement('a'); // Helper <a> tag used for canonicalization
	console.log("Before canonicalization: " + url); // TODO NICK remove
	link.href = url;
	url = link.protocol + "//" + link.host + link.pathname + link.search;
	console.log("After canonicalization: " + url); // TODO NICK remove
	delete link;
	return url;
}

//freedom.on('dcdnReady', function() {
	console.log("GOT HERRE!!!");
	// Rewrite all img tags with data-src set.
	var images = document.getElementsByTagName('img');
	var urls = []; // urls is the list of URLs we want to obtain via P2P (TODO NICK refactor)
	for (var i = 0; i < images.length; i++) {
		var url = images[i].getAttribute("data-src");
		if(url == null)
			continue;

		url = canonicalize(url);
		
		// De-duplicate multiple images with the same source so we dont download multiple times. (TODO NICK refactor)
		if (typeof imap[url] === 'undefined') {
			// We havent seen this URL, so add to fetch list and url->imageTag map 'imap'
			imap[url] = [images[i]];
			urls.push(url);
		} else {
			// Were already gonna fetch the URL, so just add this to the images it fulfills
			imap[url].push(images[i]);
		}
	}
	top.postMessage({'n':window.performance.now(),'l':'fetch'},'*');
	console.log("Requesting fetch of "+urls); // TODO remove
	for(var i = 0; i < urls.length; i++){
		fetchResource(urls[i], function(url, src){
			var els = imap[url]; // els is a list of image tags that use the given URL (TODO NICK refactor)
			for (var i = 0; els && i < els.length; i++) {
				els[i].src = src;
			}
			delete imap[url];
		});
	}

//});

/*
freedom.on('resourceReady', function(rsrc) { // rsrc is resource. Why shorten names when this will be minified anyway? (TODO NICK refactor)
	var url = rsrc['url'];
	var els = imap[url]; // els is a list of image tags that use the given URL (TODO NICK refactor)
	for (var i = 0; els && i < els.length; i++) {
		els[i].src = rsrc['src'];
	}
	delete imap[url];
});
*/