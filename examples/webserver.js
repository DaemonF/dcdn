var http = require('http');
var connect = require('connect');
var serveStatic = require('serve-static');
var serveIndex = require('serve-index');

var root = "./"

http.createServer(connect().use(serveStatic(root)).use(serveIndex(root))).listen(8080);
