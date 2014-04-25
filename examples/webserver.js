var http = require('http');
var connect = require('connect');
var serveStatic = require('serve-static');

var root = "./"

http.createServer(connect().use(serveStatic(root))).listen(8080);
