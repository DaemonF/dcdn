// Put all image tags on the page with a 'data-src' into the urlToImgTags dict
var imgTags = document.querySelectorAll('img[data-src]');
for(var i = 0; i < imgTags.length; i++){
	var tag = imgTags[i];
	var url = tag.getAttribute("data-src");
	
	DCDN.fetchResource(url, function(bloburl){
		tag.src = bloburl;
	});
}