DEBUG_FILES = dcdn.js coordination_server.js
MINIFIED_FILES = dcdn.min.js coordination_server.min.js

UGLIFY_CMD = node_modules/uglify-js/bin/uglifyjs
LINT_CMD = node_modules/jshint/bin/jshint

all : $(MINIFIED_FILES)

debug : $(DEBUG_FILES)

%.js : src/%.js
	cat $^ > $@

%.min.js : %.js
	$(LINT_CMD) $?
	node_modules/uglify-js/bin/uglifyjs $< > $@

examples : debug examples/webserver.js
	# Examples available at: http://localhost:8080/examples/
	node examples/webserver.js &
	node coordination_server.js

clean :
	rm $(DEBUG_FILES) $(MINIFIED_FILES)
