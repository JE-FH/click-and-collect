const http = require("http");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises");
const crypto = require("crypto");
const cookie = require('cookie');

const port = 8000;
const hostname = '127.0.0.1';

let db;

async function requestHandler(request, response) {
    console.log("Received " + request.method + " " + request.url);
    
    cookieMiddleware(request, response);

    switch(request.method) {
        case "POST": {
            switch(request.url) {
                default:
                    defaultResponse(response);
                    break;
            }
            break;
        }
        case "GET": {
            switch(request.url) {
                case "/api/add_package":
                    add_package();
                    break;
                default:
                    defaultResponse(response);
                    break;
            }
            break;
        }
        default:
            defaultResponse(response);
            break;
    }
}

/* Request handler for any endpoint that isn't explicitally handled */
function defaultResponse(response) {
    console.log("Nothing is here (jk)");
    response.setHeader('Content-Type', 'text/plain');
    response.write(' ');
    response.end("\n");
    response.statusCode = 404;
}

/* Example of a HTTP request case */
function add_package() {
    console.log('No API');
    response.setHeader('Content-Type', 'text/plain');
    response.write(' ');
    response.end("\n");
    response.statusCode = 404;
}

/* cant contain ( ) < > @ , ; : \ " / [ ] ? = { } per https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie */
const COOKIES_SESSION_ID = "sessid";
/* Seconds until the cookie expires */
const COOKIES_EXPIRE_TIME = 60*60*24; /*24 hours*/
/* This is where all the session data is stored */
let sessionStore = new Map();

function cookieMiddleware(req, res) {
    /* Check if the user has any cookies set in the header */
    if (typeof(req.headers["cookie"]) == "string") {
        let cookies = cookie.parse(req.headers["cookie"]);
        /* Check if the user has the specific cookie where we store session id */
        if (typeof(cookies[COOKIES_SESSION_ID]) == "string") {
            /* Check if that session exists in our session store */
            let store = sessionStore.get(cookies[COOKIES_SESSION_ID]);
            if (store != null) {
                /* Check if the cookie has expired, getTime() returns time in milliseconds*/
                if (new Date().getTime() > store.create_time.getTime() + COOKIES_EXPIRE_TIME * 1000) {
                    sessionStore.delete(cookies[COOKIES_SESSION_ID]);
                } else {
                    req.session = store.data;
                    return;
                }
            }
        }
    }
    /* Client doesnt have a valid session id, so we create one */
    let id = crypto.randomBytes(16).toString("hex");

    if (sessionStore.has(id)) {
        /* session id is already used which has around 1 in 3e+38 chance of happening */
        throw new Error("Super duper unlucky, lets just throw an error");
    }

    /* We add a create time so that we can expire old sessions */
    sessionStore.set(id, {create_time: new Date(), data: {}});

    req.session = sessionStore.get(id).data;

    /* Set the session cookie */
    res.setHeader("Set-Cookie", `${COOKIES_SESSION_ID}=${id}`);
}



async function main() {
    const server = http.createServer(requestHandler);

    db = new sqlite3.Database(__dirname + "/../databasen.sqlite3");

    let database_creation_command = (await fs.readFile(__dirname + "/database_creation.sql")).toString();
    
    console.log("Configuring database");

    /* Create a promise that should be resolved when the command has been executed */
    await new Promise((resolve, reject) => {
        /* db.serialize makes every command execute in the correct order */
        db.serialize(() => {
            /* db.exec executes all the statements in the given string */
            db.exec(database_creation_command, (err) => {
                if (err) {
                    /* There was an error, call reject */
                    reject(err);
                } else {
                    /* There was no error, call resolve */
                    resolve();
                }
            })
        });
    })

    console.log("Database correctly configured");


    /* Starts the server */
    server.listen(port, hostname, () => {
        console.log("Server listening on " + hostname + ":" + port);
    })

    /* Just before the program exits we have to make sure that the database is saved */
    process.on('beforeExit', (code) => {
        console.log('Process beforeExit event with code: ', code);
        db.close((err) => {
            if (err) {
                console.log(err);
            }
            process.exit(code);
        });
    });
}

main();