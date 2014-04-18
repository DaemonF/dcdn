if(typeof dcdn === 'undefined'){
	dcdn = new DCDN();
}

// Put all image tags on the page with a 'data-src' into the urlToImgTags dict
var imgTags = document.getElementsByTagName('img');
for(var i = 0; i < imgTags.length; i++){
	var tag = imgTags[i];
	var url = tag.getAttribute("data-src");
	if(url == null)
		continue; // Ignore tags with no data-src
	
	url = dcdn.canonicalizeUrl(url);
	dcdn.fetchResource(url, function(bloburl){
		tag.src = bloburl;
	});
}