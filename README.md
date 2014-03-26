DCDN
====

A Distributed CDN over WebRTC with fallback to HTTP download
(A work in progress for my Undergraduate Thesis at the University of Washington)

CHECKLIST:
[x] Design and begin documenting the basic protocol (Top of dcdn.js)
[x] Impliment file chunking, basic code piping and the HTTP fallback layer
[ ] Impliment P2P connections
[ ] Impliment P2P file transfer
[ ] Impliment P2P coordination server
[ ] More Doccumentation of the protocol
[ ] Add tons of stat collection for research


RUNNING THE DEMO:

The source is layed out in example format at the moment, so its very easy to run the demo:
1) Clone this repo
2) cd to the web_server directory
3) Run 'php -S localhost:8080'
4) Navigate to localhost:8080 in any browser that supports WebRTC!
