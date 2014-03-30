#!/usr/local/bin/python3

import asyncio
import websockets
try:
	import simplejson as json
except:
	print("Could not import simplejson. Install it with pip.")
	import json

import logging
logging.basicConfig(level=logging.WARNING)
#logging.basicConfig(level=logging.DEBUG)

# TODO NICK This probably needs to be per client, but not important
lastId = 0


# TODO NICK get this data from the webserver's files directly
# BEGIN Stub data
chromeLogoMeta = {
	"hash": "fakeMd5Hash",
	"length": 122169,
	"contenttype": "image/png",
	"chunksize": 150000,
	"chunkhashes": [
		"fakeMd5Hash",
	],
	"peers": [
		"fakePeerID",
		"fakePeerID",
		"fakePeerID",
	]
}
seattleSkylineMeta = {
	"hash": "fakeMd5Hash",
	"length": 3232686,
	"contenttype": "image/jpeg",
	"chunksize": 500000,
	"chunkhashes": [
		"fakeMd5Hash",
		"fakeMd5Hash",
		"fakeMd5Hash",
		"fakeMd5Hash",
		"fakeMd5Hash",
		"fakeMd5Hash",
		"fakeMd5Hash",
	],
	"peers": [
		"fakePeerID",
		"fakePeerID",
		"fakePeerID",
	]
}
# END Stub data


@asyncio.coroutine
def hello(websocket, uri):
	global lastId
	message = yield from websocket.recv()
	print("< {}".format(message))

	# Basic response format
	msg = json.loads(message)
	msgId = msg['id']
	lastId += 1
	respId = lastId
	resp = {
		"id": respId,
		"replyTo": msgId,
	}

	if msg['action'] == "getMetadata": # TODO NICK factor out various actions into functions
		url = msg['url']
		if url.endswith("chrome.png"): # TODO NICK do this automatically
			resp['metadata'] = chromeLogoMeta
		elif url.endswith("seattle.jpg"):
			resp['metadata'] = seattleSkylineMeta
		else:
			resp['error'] = "Unknown URL"
	else:
		resp['error'] = "Unknown action"


	response = json.dumps(resp)
	print("> {}".format(response))
	yield from websocket.send(response)

start_server = websockets.serve(hello, 'localhost', 8081)
print("Running...")

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()