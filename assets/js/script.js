(function() {
    if (globalThis.window === globalThis /* UI thread */) {
        console.log("Running demo from main UI thread.");
    } else { /* Worker thread */+
        console.log("Running demo from Worker thread.");
    }

    const sqlinjectionApp = function(sqlite3) {
        // Setup the local sql database
        const capi = sqlite3.capi/*C-style API*/;
        const oo = sqlite3.oo1/*high-level OO API*/;
        console.log("sqlite3 version", capi.sqlite3_libversion(), capi.sqlite3_sourceid());
        const db = new oo.DB("/sqlinject.sqlite3", 'ct');
        console.log("transient db =", db.filename);

        try {
            db.exec('DROP TABLE IF EXISTS users');
            db.exec(`CREATE TABLE users (id, username, password)`);
            db.exec(`INSERT INTO users (id, username, password) VALUES (1, 'markeliasen', '7c4a8d09ca3762af61e59520943dc26494f8941b')`);
            db.exec(`INSERT INTO users (id, username, password) VALUES (2, 'johndoe', 'b1b3773a05c0ed0176787a4f1574ff0075f7521e')`);
            db.exec(`INSERT INTO users (id, username, password) VALUES (3, 'janedoe', 'e731a7b612ab389fcb7f973c452f33df3eb69c99')`);
            console.info("Created table and added dummy data.");
        } catch (e) {
            console.warn("Got expected exception:", e.message);
        }

        // !!!!! DO NOT USE SHA1 IN PRODUCTION !!!!!
        // I only use it here because it produces a reasonably
        // short string, which makes it look nicer in the output.
        // For production I recommend: <STRING> -> SHA512 -> ARGON2ID -> ENCRYPT
        function sha1(str) {
            var buffer = new TextEncoder("utf-8").encode(str);
            return crypto.subtle.digest("SHA-1", buffer).then(function(hash) {
                return hex(hash);
            });
        }

        // code from https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
        function hex(buffer) {
            var hexCodes = [];
            var view = new DataView(buffer);
            for (var i = 0; i < view.byteLength; i += 4) {
                // Using getUint32 reduces the number of iterations needed (we process 4 bytes each time)
                var value = view.getUint32(i)
                // toString(16) will give the hex representation of the number without padding
                var stringValue = value.toString(16)
                // We use concatenation and slice for padding
                var padding = '00000000'
                var paddedValue = (padding + stringValue).slice(-padding.length)
                hexCodes.push(paddedValue);
            }

            // Join all the hex strings into one
            return hexCodes.join("");
        }

        // create our simple Vue app
        new Vue({
            el: '#sql-demo',
            data: {
                query: '',
                username: '',
                password: '',
                result: '',
                answer: 'click here',
            },
            methods: {
                login: function() {
                    var self = this;

                    sha1(self.password).then(function(passwordHash) {
                        // if the password is empty, lets ignore the hash, as it might be confusing.
                        if (self.password === "") {
                            passwordHash = "";
                        }

                        self.query = 'SELECT\n'
                        self.query += '    id, username, password\n'
                        self.query += 'FROM\n'
                        self.query += '    users\n'
                        self.query += 'WHERE\n'
                        // sqlite uses /* for comments, but since we are emulating MySQL, we sneakily replace MySQL
                        // comments with SQLite :)
                        self.query += `    username = '${self.username.replace(/\-\-/, '/*')}'\n`
                        self.query += 'AND\n'
                        self.query += `    password = '${passwordHash}'`

                        // THIS IS INTENTIONALLY LEFT VULNERABLE TO SQL INJECTIONS
                        // YOU SHOULD NEVER DIRECTLY MANIPULATE THE SQL QUERY STRING LIKE!
                        // USE PREPARED STATEMENTS!
                        try {
                            let resultRows = [];

                            db.exec({
                                sql: self.query.replace(/\n/g, ' '),
                                resultRows: resultRows,
                            });

                            if (!resultRows.length) {
                                self.result = 'No results';
                                return;
                            }

                            self.result = JSON.stringify(Array.from(resultRows), null, 3);
                        } catch (error) {
                            console.log(error);
                            self.result = "Error! Invalid query";
                        }
                    });
                }
            }
        });
    }

    console.log("Loading and initializing sqlite3 module...");
    if (globalThis.window !== globalThis) /*worker thread*/ {
        /*
          If sqlite3.js is in a directory other than this script, in order
          to get sqlite3.js to resolve sqlite3.wasm properly, we have to
          explicitly tell it where sqlite3.js is being loaded from. We do
          that by passing the `sqlite3.dir=theDirName` URL argument to
          _this_ script. That URL argument will be seen by the JS/WASM
          loader and it will adjust the sqlite3.wasm path accordingly. If
          sqlite3.js/.wasm are in the same directory as this script then
          that's not needed.
 
          URL arguments passed as part of the filename via importScripts()
          are simply lost, and such scripts see the globalThis.location of
          _this_ script.
        */
        let sqlite3Js = 'sqlite3.js';
        const urlParams = new URL(globalThis.location.href).searchParams;
        if (urlParams.has('sqlite3.dir')) {
            sqlite3Js = urlParams.get('sqlite3.dir') + '/' + sqlite3Js;
        }
        importScripts(sqlite3Js);
    }

    globalThis.sqlite3InitModule({
        /* We can redirect any stdout/stderr from the module like so, but
           note that doing so makes use of Emscripten-isms, not
           well-defined sqlite APIs. */
        print: console.log,
        printErr: console.error
    }).then(function(sqlite3) {
        //console.log('sqlite3 =',sqlite3);
        console.log("Done initializing. Running demo...");
        sqlinjectionApp(sqlite3);
    });
})();
