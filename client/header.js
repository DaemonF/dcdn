// DCDN: A Distributed Open Source CDN


// BASIC SETUP:
// A web server, a coordination server and many clients with standard web browsers.

// The coordination server provides metadata about URLs, a list of peers that 
// probably have the data and a chat-room style message chanel to establish 
// P2P connections.

// The clients must be using browsers with WebRTC, otherwise the system will fallback to normal HTTP download

if (typeof RTCPeerConnection === "undefined") {
	if (typeof webkitRTCPeerConnection !== "undefined") {
		RTCPeerConnection = webkitRTCPeerConnection;
	} else if (typeof mozRTCPeerConnection !== "undefined") {
		RTCPeerConnection = mozRTCPeerConnection;
	} else {
		console.error("No support for RTCPeerConnection.");
	}
}

function DCDN(){
	COORD_SERVER_URL="ws://localhost:8081/"; //TODO NICK Remove need for static define
	var STUN_CONFIG = {
		'iceServers': [{
			'url': 'stun:stun.l.google.com:19302'
		}]
	};

	var RTC_DATA_CHAN_CONFIG = {
		ordered: false,
		maxRetransmitTime: 3000, // in milliseconds
	}

	CONCURRENT_CHUNK_LIMIT=10; // How many chunks can be downloaded at once by DCDN.

	var fatalError = false;
	var coordinationServer = null;
	var peerConnections = {};
	var resourceHandles = {}; // URL to RsrcHandle
	// TODO, Well need a globl priority queue to manage chunk ordering and figure out a scheduling algorythm that makes sense (Perhaps deadline timestamps for priority?)
