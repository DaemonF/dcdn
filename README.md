# DCDN #

A Distributed CDN based on modern web technologies

(A work in progress for my Undergraduate Thesis at the University of Washington)

## Checklist ##
- [x] Design and begin documenting the basic protocol (Top of dcdn.js)
- [x] Implement file chunking, basic code piping and the HTTP fallback layer
- [x] Implement serving of metadata through Coordination Server
- [x] Implement P2P initiation through coordination server
- [x] Implement P2P connections
- [x] Implement P2P file transfer
- [ ] Implement metadata generation from URL
- [ ] Implement URL caching to disk on C.Serv
- [ ] Allow certain things to be accessed over HTTP to the C Serv (ie low latency metadata and chunks)
- [ ] Persist as much as possible on the client
- [ ] More Doccumentation of the protocol
- [ ] Add tons of stat collection for research

## Running the Examples ##
1. Clone this repo
2. run `make examples`
3. Navigate to http://localhost:8080/examples/ in your browser (Chrome or Firefox)
