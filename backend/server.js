const http = require("http");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises");
const crypto = require("crypto");
const cookie = require('cookie');
const querystring = require("querystring");

const port = 8000;
const hostname = '127.0.0.1';

let db;

async function requestHandler(request, response) {
    console.log("Received " + request.method + " " + request.url);
    
    cookieMiddleware(request, response);
    await userMiddleware(request, response);
    queryMiddleware(request, response);

    switch(request.method) {
        case "POST": {
            switch(request.path) {
                default:
                    defaultResponse(response);
                    break;
                case "/login":
                    login_post(request, response);
                    break;
            }
            break;
        }
        case "GET": {
            switch(request.path) {
                case "/api/add_package":
                    add_package();
                    break;
                case "/login":
                    login_get(request, response);
                    break;
                case "/static/style.css":
                    staticStyleCss(response);
                    break;
                case "/store":
                    storeMenu(request, response);
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

async function staticStyleCss(response) {
    let content = (await fs.readFile(__dirname + "/../frontend/css/style.css")).toString();
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/css");
    response.write(content);
    response.end();
}

/* Request handler for any endpoint that isn't explicitally handled */
function defaultResponse(response) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain');
    response.write("Page not found");
    response.end();
   
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
    res.setHeader("Set-Cookie", `${COOKIES_SESSION_ID}=${id};path=/`);
}

/*
 * Checks if the client is logged in and sets req.user to the user object if so
 * to check if the client is logged in, just check if the user object is null
 */
async function userMiddleware(req, res) {
    req.user = null;
    if (typeof(req.session.user_id) == "number") {
        let user = await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT * FROM user WHERE id=?", [req.session.user_id], (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                })
            });
        });
        req.user = user;
    }
}

function queryMiddleware(req, res) {
    let raw_path = req.url.toString();
    
    let [pathPart, queryPart] = raw_path.split("?");
    
    let queryData = null;

    if (queryPart != null) {
        queryData = querystring.parse(queryPart);
    }
    if (queryData == null || typeof(queryData) != "object") {
        queryData = {};
    }

    req.query = queryData;
    req.path = pathPart;
}

async function login_get(request, response, error) {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.write(`
<!DOCTYPE html>
<html>
    <head>
        <title>login</title>
    </head>

    <body>
        ${error ? `<p>${error}</p>` : ""}
        <form action="/login" method="POST">
            <label for="username">Username: </label>
            <input type="text" name="username" placeholder="username" required><br>
            <label for="password">Password: </label>
            <input type="password" name="password" placeholder="password" required><br>
            <input type="submit" value="login">
        </form>
    </body>
</html>
`);
    response.end();
}

const HASHING_ITERATIONS = 100000;
const HASHING_KEYLEN = 64;
const HASHING_ALGO = "sha512";
const HASHING_HASH_ENCODING = "hex";
async function login_post(request, response) {
    /* Read the post body */
    let post_body = await new Promise((resolve, reject) => {
        let body = ''
        request.on('data', function(data) {
          body += data;
        })
        request.on('end', function() {
          resolve(body);
        })
    });

    let post_parameters = {};

    /* Decode the key value pairs from the url encoding */
    post_body.split("&").map((v) => {
        let split = v.split("=");
        post_parameters[decodeURIComponent(split[0])] = decodeURIComponent(split[1]);
    });

    /* Make sure that we got the right parameters */
    if (!(typeof post_parameters["username"] == "string" && typeof post_parameters["password"] == "string")) {
        response.statusCode = 400;
        response.write("du har glemt at skrive username eller password");
        response.end();
        return;
    }

    /* Find the user if it exists */
    let user = await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.get("SELECT id, password, salt, storeId, superuser FROM user WHERE username=?", [post_parameters["username"]], (err, row) => {
                if (err) {
                    resolve(null);
                } else {
                    if (row == undefined) {
                        resolve(null);
                    } else {
                        resolve(row);
                    }
                }
            })
        });
    });

    if (user == null) {
        /* Wrong username */
        login_get(request, response, "Wrong username")
        return;
    }

    /* Create a hash from the given password */
    let hashed = await new Promise((resolve, reject) => {
        crypto.pbkdf2(post_parameters["password"], user.salt, HASHING_ITERATIONS, HASHING_KEYLEN, HASHING_ALGO, (err, derivedKey) => {
            if (err) {
                reject(err);
            }
            resolve(derivedKey);
        });
    });
    
    /* Compare the stored password and the given password using function that protects against timing attacks*/
    if (crypto.timingSafeEqual(Buffer.from(user.password, HASHING_HASH_ENCODING), hashed)) {
        response.statusCode=302;
        
        request.session.user_id = user.id;

        if (user.superuser) {
            response.setHeader('Location','/admin/' + user.storeId.toString());
        } else {
            response.setHeader('Location','/store/' + user.storeId.toString());
        }
        response.end();

        //TODO: set session state when we have session middleware or something like that
        return;
    } else {
        /* Wrong password */
        login_get(request, response, "Wrong password");
        return;
    }

}

async function storeMenu(request, response, storeid){

    /* Check if the user is logged in */
    if (request.user == null) {
        response.statusCode = 401;
        response.write("You need to be logged in to access this page");
        response.end();
        return;
    }
    
    /* Check if the storeid is set up correctly */
    if (typeof(request.query.storeid) != "string" || Number.isNaN(Number(request.query.storeid))) {
        response.statusCode = 400;
        response.write("Queryid malformed");
        response.end();
        return;
    }

    /* Convert the storeid to a number */
    let wantedStoreId = Number(request.query.storeid);

    if (request.user.storeId != wantedStoreId) {
        response.statusCode = 401;
        response.write("You dont have access to this store");
        response.end();
        return;
    }

    /* Get the storeid from the database */
    let store = await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.get("SELECT * FROM store WHERE id=?", [wantedStoreId], (err, row) => {
                if (err) {
                    reject(err)
                } else {
                    if (row == undefined) {
                        reject(`Expected store with id ${wantedStoreId} to exist`);
                    } else {
                        resolve(row);
                    }
                }
            })
        });
    });

    /* Print the menu site */
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>Store menu for ${store.name}</title>
        </head>
    
        <body>
            <h1>${store.name} menu</h1>
            <form action="/store" method="POST">
                <input type="button" value="Overview of packages"><br><br>
                <input type="button" value="Confirm delivery"><br>
            </form>
        </body>
    </html>
    `)
    response.end();
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