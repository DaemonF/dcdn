# DCDN #

A Distributed CDN based on modern web technologies

(A work in progress for my Undergraduate Thesis at the University of Washington)

## Checklist ##
- [x] Design and begin documenting the basic protocol (Top of dcdn.js)
- [x] Impliment file chunking, basic code piping and the HTTP fallback layer
- [x] Impliment serving of metadata through Coordination Server
- [x] Impliment P2P initiation through coordination server
- [x] Impliment P2P connections
- [x] Impliment P2P file transfer
- [ ] Impliment metadata generation from URL
- [ ] Impliment URL caching to disk on C.Serv
- [ ] Persist as much as possible on the client
- [ ] More Doccumentation of the protocol
- [ ] Add tons of stat collection for research

## Running the Examples ##
1. Clone this repo
2. run `npm install`
3. run `make demo`
4. Navigate to http://localhost:8080/examples/ in your browser (Chrome or Firefox)
