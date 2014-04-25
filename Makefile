DEBUG_FILES = dcdn.js coordination_server.js
MINIFIED_FILES = dcdn.min.js coordination_server.min.js

UGLIFY_CMD = node_modules/uglify-js/bin/uglifyjs
LINT_CMD = node_modules/jshint/bin/jshint

all : $(MINIFIED_FILES)

dcdn.js : src/dcdn.js
	cat $^ > $@

coordination_server.js : src/coordination_server.js node_modules/
	cat $< > $@

%.min.js : %.js node_modules/
	$(LINT_CMD) $<
	node_modules/uglify-js/bin/uglifyjs $< > $@

debug : $(DEBUG_FILES)

examples : debug examples/webserver.js node_modules/
	# Examples available at: http://localhost:8080/examples/
	node examples/webserver.js &
	node coordination_server.js

node_modules/ : package.json
	npm install

clean :
	rm -f $(DEBUG_FILES) $(MINIFIED_FILES)
