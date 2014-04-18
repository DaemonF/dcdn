// DCDN: A Distributed Open Source CDN


// BASIC SETUP:
// A web server, a coordination server and many clients with standard web browsers.

// The coordination server provides metadata about URLs, a list of peers that 
// probably have the data and a chat-room style message chanel to establish 
// P2P connections.

// The clients must be using browsers with WebRTC, otherwise the system will fallback to normal HTTP download

function DCDN(){
	COORD_SERVER_URL="ws://localhost:8081/"; //TODO NICK Remove need for static define
	CONCURRENT_CHUNK_LIMIT=10; // How many chunks can be downloaded at once by DCDN.

	var coordinationServer = null;
	var peerConnections = {};
	var resourceHandles = {}; // URL to RsrcHandle
	// TODO, Well need a globl priority queue to manage chunk ordering and figure out a scheduling algorythm that makes sense (Perhaps deadline timestamps for priority?)
