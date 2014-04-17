FILES = dcdn-client.js dcdn-coord-serv.py

all : $(FILES)

dcdn-client.js :
	cat client/main.js > dcdn-client.js

dcdn-coord-serv.py :
	cat server/main.py > dcdn-coord-serv.py

clean :
	rm $(FILES)
