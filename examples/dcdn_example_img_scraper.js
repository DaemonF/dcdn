var urlToImgTags = {}; // A map from URL to a list of image tags fullfiled by it

// Put all image tags on the page with a 'data-src' into the urlToImgTags dict
var imgTags = document.getElementsByTagName('img');
for(var i = 0; i < imgTags.length; i++){
	var url = imgTags[i].getAttribute("data-src");
	if(url == null)
		continue; // Ignore tags with no data-src
	url = dcdn.canonicalizeUrl(url);

	if (typeof urlToImgTags[url] === 'undefined') {
		urlToImgTags[url] = [imgTags[i]];
	} else {
		urlToImgTags[url].push(imgTags[i]);
	}
}

// Request those URLS through DCDN
for(var url in urlToImgTags){
	dcdn.fetchResource(url, function(url, src){
		var imageTagsWithUrl = urlToImgTags[url];
		for(var i = 0; i < imageTagsWithUrl.length; i++){
			imageTagsWithUrl[i].src = src;
		}
	});
}