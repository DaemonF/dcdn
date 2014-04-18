FILES = dcdn.js server.js
UGLIFY_CMD = node_modules/uglify-js/bin/uglifyjs

CLIENT_COMPONENTS = client/header.js client/QueuedConnection.js client/main.js client/footer.js
SERVER_COMPONENTS = server/helper-functions.js server/message-handlers.js server/main.js

all : $(FILES)

dcdn.js : $(CLIENT_COMPONENTS)
	cat $(CLIENT_COMPONENTS) > dcdn.js

server.js : $(SERVER_COMPONENTS)
	cat $(SERVER_COMPONENTS) > server.js

%.min.js : %.js
	node_modules/uglify-js/bin/uglifyjs $< > $@

webserver : dcdn.js webserver.js
	node webserver.js

server : server.js
	node server.js

clean :
	rm $(FILES)
