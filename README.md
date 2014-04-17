# DCDN #

A Distributed CDN based on modern web technologies

(A work in progress for my Undergraduate Thesis at the University of Washington)

## Checklist ##
- [x] Design and begin documenting the basic protocol (Top of dcdn.js)
- [x] Impliment file chunking, basic code piping and the HTTP fallback layer
- [x] Impliment serving of metadata through Coordination Server
- [ ] Impliment P2P initiation through coordination server
- [ ] Impliment P2P connections
- [ ] Impliment P2P file transfer
- [ ] More Doccumentation of the protocol
- [ ] Add tons of stat collection for research

## Running the Examples ##
1. Clone this repo
2. run `node install`
3. run `make`
4. In one terminal `node webserver.js`
5. In another `python3 dcdn-coord-serv.py`
6. Navigate to http://localhost:8080/examples/ in your browser
