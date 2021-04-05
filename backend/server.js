const http = require("http");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises");
const crypto = require("crypto");
const cookie = require('cookie');
const querystring = require("querystring");
const { timeStamp } = require("console");
const { resolve } = require("path");

const {is_string_int, is_string_number, receive_body, parseURLEncoded, assertAdminAccess} = require("./helpers");
const {queryMiddleware, sessionMiddleware, createUserMiddleware} = require("./middleware");
const {adminNoAccess, invalidParameters} = require("./generic-responses");
const {db_all, db_get, db_run, db_exec} = require("./db-helpers");


const port = 8000;
const hostname = '127.0.0.1';

let db;
let userMiddleware;

async function requestHandler(request, response) {
    console.log("Received " + request.method + " " + request.url);
    
    sessionMiddleware(request, response);
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
                case "/api/add_package":
                    api_post(request, response);
                    break;
                case "/packageFormHandler":
                    packageFormHandler(request, response);
                    break;
                case "/admin/employees/add":
                    add_employee_post(request, response);
                    break;
                case "/admin/employees/remove":
                    remove_employee_post(request,response);
                    break;
                case "/admin/queues/remove":
                    queueRemove(request, response);
                    break;
                case "/admin/queues/add":
                    queueAdd(request, response);
                    break;
            }
            break;
        }
        case "GET": {
            switch(request.path) {
                case "/login":
                    login_get(request, response);
                    break;
                case "/admin/employees/add":
                    add_employee(request, response, "");
                    break;
                case "/admin/employees/remove":
                    remove_employee(request,response, "");
                break;
                case "/admin/queues":
                    queueList(request, response);
                    break;
                case "/admin":
                    adminGet(request, response);
                    break;
                case "/admin/package_form":
                    package_formGet(request, response);
                    break;
                case "/static/style.css":
                    staticStyleCss(response);
                    break;
                case "/static/queueListScript.js":
                    staticQueueListScriptJS(response);
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

/* Request handler for the /api/add_package endpoint */
async function api_post(request, response) {
    let body = await extractBody(request);
    
    if(isApiPostValid(body)) {
        console.log('Valid post body');
        let store = await apiKeyToStore(body.apiKey);
        add_package(store.id, body.customerEmail, body.customerName, body.orderId);
        response.statusCode = 200;
        response.end();
    } else {
        console.log('Ivalid post body');
        response.statusCode = 400;
        response.end()
    }
}

/* Returns the associated store fram a given API key */
async function apiKeyToStore(apiKey) {
    let store = await new Promise((resolve, reject) => {
        db.get("SELECT * FROM store WHERE apiKey=?", [apiKey], (err, row) => {
            if(err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    })

    return store;
}

/* Returns true if the API POST body is valid. Further checks could be added. */
function isApiPostValid(body) {
    if(objLength(body) != 4) {
        console.log("POST body doesn't have 4 keys");
        return false;
    } else return true;
}

function objLength(obj) {
    let size = 0;
    for(key in obj) {
        size++;
    }
    return size;
}

/* Adds a package from the form on /admin/add_package */ 
async function packageFormHandler(request, response) {

    if (request.user == null) {
        response.statusCode = 401;
        response.write("You need to be logged in to access this page");
        response.end();
        return;
    }

    if (request.superuser == 0) {
        response.statusCode = 401;
        response.write("You need to be admin to access this page");
        response.end();
        return;
    }

    if (typeof(request.query.storeid) != "string" || Number.isNaN(Number(request.query.storeid))) {
        response.statusCode = 400;
        response.write("Queryid malformed");
        response.end();
        return;
    }

    let wantedStoreId = Number(request.query.storeid);

    if (request.user.storeId != wantedStoreId) {
        response.statusCode = 401;
        response.write("You dont have access to this store");
        response.end();
        return;
    }

    let body = await extractBody(request);
    add_package(4563, body.customerEmail, body.customerName, body.externalOrderId);
    response.statusCode = 302;
    response.setHeader('Location', request.headers['referer']);
    response.end();
}

async function extractBody(request) {
    let body = [];
    let bodyJSON = {};
    let promise = await new Promise((resolve, reject) => {
        request.on('data', (data) => {
            body.push(data);
        }).on('end', () => {
            bodyJSON = qsToObj(body.toString());
            resolve(bodyJSON);
        })
    })
    
    return promise;
}

/* Converts a query string to an object */
function qsToObj(queryString) {
    let pairs = queryString.split('?');
    let result = {};
    pairs.forEach(pair => {
      pair = pair.split('=');
      result[pair[0]] = pair[1];
    });
    return result;
}

/* Adds a package to the 'package' table in the database */
function add_package(storeId, customerEmail, customerName, externalOrderId) {
    let guid, bookedTimeId, creationDate, verificationCode;

    guid = crypto.randomBytes(8).toString("hex");
    bookedTimeId = null;
    creationDate = new Date();
    verificationCode = crypto.randomBytes(16).toString("hex");
    
    let query = 'INSERT INTO package (guid, storeId, bookedTimeId, verificationCode, customerEmail, customerName, externalOrderId, creationDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';

    /* Serialize er ikke nødvendig og hvis vi ville kunne vi samle i en linje
    */
    db.serialize(() => {
        db.run(query, [guid, storeId, bookedTimeId, verificationCode, customerEmail, customerName, externalOrderId, creationDate]);
    })

    console.log('Package added for: ' + customerName);
}

function package_formGet(request, response) {
    if (request.user == null) {
        response.statusCode = 401;
        response.write("You need to be logged in to access this page");
        response.end();
        return;
    }

    if (request.superuser == 0) {
        response.statusCode = 401;
        response.write("You need to be admin to access this page");
        response.end();
        return;
    }

    if (typeof(request.query.storeid) != "string" || Number.isNaN(Number(request.query.storeid))) {
        response.statusCode = 400;
        response.write("Queryid malformed");
        response.end();
        return;
    }

    let wantedStoreId = Number(request.query.storeid);

    if (request.user.storeId != wantedStoreId) {
        response.statusCode = 401;
        response.write("You dont have access to this store");
        response.end();
        return;
    }

    response.setHeader('Content-Type', 'text/html');
    response.write(renderPackage_form(request.query.storeid));
    response.end();
    response.statusCode = 200;
}

function renderPackage_form(query) {
    return `
        <html>
            <head>
                <meta charset="UTF-8">
                <title>Add package</title>

                <style>
                    body {
                        font-family: sans-serif;
                    }
                </style>
            </head>
            <body>
                <h1>Add package</h1>
                <form action="/packageFormHandler?storeid=${query}" method="POST">
                    <input type="text" name="customerName" placeholder="Customer name" required>
                    <input type="text" name="customerEmail" placeholder="Customer email" required>
                    <input type="text" name="externalOrderId" placeholder="Order ID" required> 
                    <input type="submit">
                </form>
            </body>
        </html>
    `;
}

async function staticStyleCss(response) {
    let content = (await fs.readFile(__dirname + "/../frontend/css/style.css")).toString();
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/css");
    response.write(content);
    response.end();
}

async function staticQueueListScriptJS(response) {
    let content = (await fs.readFile(__dirname + "/../frontend/js/queueListScript.js")).toString();
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/javascript");
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

async function login_get(request, response, error) {
    response.statusCode = error == null ? 200 : 401;
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
    let post_body = await receive_body(request);

    /* Decode the key value pairs from the url encoding */
    let post_parameters = parseURLEncoded(post_body);

    /* Make sure that we got the right parameters */
    if (!(typeof post_parameters["username"] == "string" && typeof post_parameters["password"] == "string")) {
        login_get(request, response, "You didnt enter username and/or password");
        return;
    }

    /* Find the user if it exists */
    let user = await db_get(db, "SELECT id, password, salt, storeId, superuser FROM user WHERE username=?", post_parameters["username"]);

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
            request.session.storeId = user.storeId;
            response.setHeader('Location','/admin?storeid=' + user.storeId.toString());
            
        } else {
            request.session.storeId = user.storeId;
            response.setHeader('Location','/store?storeid=' + user.storeId.toString());
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

async function adminGet(request, response) {
    let wantedStoreId = assertAdminAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }

    let store = await db_get(db, "SELECT * FROM store WHERE id=?", [wantedStoreId]);
    if (store == undefined) {
        throw new Error(`Expected store with id ${wantedStoreId} to exist`);
    }

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html");
    console.log(request.session.storeId)
    response.write(`
<!DOCTYPE html>
<html>
    <head>
        <title>Store admin for ${store.name}</title>
    </head>
    <body>
        <h1>Hello ${request.user.name} these are your links</h1>
        <ul>
            <li><a href="/admin/queues?storeid=${store.id}">Manage queues</a></li>
            <li><a href="/admin/settings?storeid=${store.id}">Change settings</a></li>
            <li><a href="/admin/package_form?storeid=${store.id}">Create package manually</a></li>
            <li><a href="/admin/employees?storeid=${store.id}">Manage employees</a></li>
            <li><a href="/admin/package_form?storeid=${store.id}">Add package manually</a></li>
        </ul>
    </body>
</html>
`)
    response.end();
}

async function queueList(request, response) {
    let wantedStoreId = assertAdminAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }

    let store = await db_get(db, "SELECT * FROM store WHERE id=?", [wantedStoreId]);
    if (store == undefined) {
        throw new Error(`Expected store with id ${wantedStoreId} to exist`);
    }

    let queues = await db_all(db, "SELECT * FROM queue WHERE storeId=?", [store.id]);

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.write(`
<!DOCTYPE html>
<html>
    <head>
        <title>Queue list for ${store.name}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/openlayers/openlayers.github.io@master/en/v6.5.0/css/ol.css" type="text/css">
        <script src="https://cdn.jsdelivr.net/gh/openlayers/openlayers.github.io@master/en/v6.5.0/build/ol.js"></script>
        <link rel="stylesheet" href="/static/style.css">
        <style>
            .map {
                height: 400px;
                width: 500px;
            }
        </style>
    </head>
    <body>
        <a href="/admin?storeid=${store.id}">Go back to dashboard</a>
        <h1>List of queues for ${store.name}</h1>
        <table>
            <thead>
                <tr>
                    <th>id</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                    <th>size</th>
                </tr>
            </thead>
            <tbody>
                ${queues.map((queue) => `<tr>
                    <td>${queue.id}</td>
                    <td>${queue.latitude}</td>
                    <td>${queue.longitude}</td>
                    <td>${queue.size}</td>
                    <td>
                        <form action="/admin/queues/remove" method="POST">
                            <input type="hidden" name="storeid" value="${store.id}">
                            <input type="hidden" name="queueid" value="${queue.id}">
                            <input type="submit" value="Remove">
                        </form>
                    </td>
                </tr>`).join("\n")}
            </tbody>
        </table>
        <h2>add another queue</h2>
        <form action="/admin/queues/add", method="POST">
            <div id="queue-placement-map" class="map"></div>
            <label for="size">Queue capacity: </label>
            <input type="number" name="size" required><br>
            
            <input id="latitude-input" type="hidden" name="latitude">
            <input id="longitude-input" type="hidden" name="longitude">
            <input type="hidden" name="storeid" value="${store.id}">
            <input type="submit" value="Add">
        </form>
        <script type="text/javascript">
            var queues = ${JSON.stringify(queues)};
        </script>
        <script type="text/javascript" src="/static/queueListScript.js"></script>
    </body>
</html>
`);
    response.end();
}

async function queueRemove(request, response) {
    let post_data = await receive_body(request);
    let post_parameters = parseURLEncoded(post_data);
    
    let wantedStoreId = assertAdminAccess(request, post_parameters, response);
    if (wantedStoreId == null) {
        return;
    }

    if (!is_string_int(post_parameters.queueid)) {
        invalidParameters(response, "queueid malformed", `/admin/queues?storeid=${wantedStoreId}`, "Back to queue list");
        return;
    }
    let wantedQueueId = Number(post_parameters.queueid);

    await db_run(db, "DELETE FROM queue WHERE id=? and storeId=?", [wantedQueueId, wantedStoreId]);

    response.statusCode = 302;
    response.setHeader("Location", "/admin/queues?storeid=" + wantedStoreId.toString());
    response.end();
}

async function queueAdd(request, response) {
    let post_data = await receive_body(request);
    let post_parameters = parseURLEncoded(post_data);

    let wantedStoreId = assertAdminAccess(request, post_parameters, response);
    if (wantedStoreId == null) {
        return;
    }

    if (
        !is_string_int(post_parameters.size) || 
        !is_string_number(post_parameters.latitude) ||
        !is_string_number(post_parameters.longitude)
    ){
        invalidParameters(response, "size, latitude or longitude malformed", `/admin/queues?storeid=${wantedStoreId}`, "Back to queue list");
        return;
    }

    let wantedSize = Number(post_parameters.size);
    let wantedLatitude = Number(post_parameters.latitude);
    let wantedLongitude = Number(post_parameters.longitude);

    db_run(db, "INSERT INTO queue (latitude, longitude, size, storeId) VALUES (?, ?, ?, ?)", [wantedLatitude, wantedLongitude, wantedSize, wantedStoreId]);

    response.statusCode = 302;
    response.setHeader("Location", "/admin/queues?storeid=" + wantedStoreId.toString());
    response.end();
}

async function main() {
    const server = http.createServer(requestHandler);

    db = new sqlite3.Database(__dirname + "/../databasen.sqlite3");
    
    
    let database_creation_command = (await fs.readFile(__dirname + "/database_creation.sql")).toString();
    
    userMiddleware = createUserMiddleware(db);
    
    console.log("Configuring database");

    /* Execute the database creation commands */
    await db_exec(db, database_creation_command);

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

function add_employee(request, response, error){
    if (request.user === null || request.user.superuser == 0){
        adminNoAccess(request, response);
    }
    else{
        response.statusCode = 200;

        // Måde at vise fejl til brugeren
        request.session.display_error ? error = request.session.last_error : error = "";
        request.session.display_error = false;

        response.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Adding new employee </title>
            </head>
            <body>
                ${error ? `<p>${error}</p>` : ""}
                <a href="/admin?storeid=${request.user.storeId}"> Go to admin startpage </a> <br>
                <h> Adding new employee to the store <h>
                
                <form action="/admin/employees/add" method="POST">
                <label for="username">Username:      </label>
                <input type="text" name="username" placeholder="username" required><br>

                <label for="name"> Employee name: </label>
                <input type="text" name="employee_name" placeholder="Employee name" required><br> <br>

                <label for="password"> Password:     </label>
                <input type="password" name="password" placeholder="password" id="password" onchange='check_pass();' required> <br>

                <label for="confirm_password"> Confirm password: </label>
                <input type="password" name="confirm_password" placeholder="password" id="confirm_password" onchange='check_pass();' required> <br>

                <p id="matching_passwords" style="color:red" hidden> The passwords do not match </p>
                



                <label for="superuser"> Is the account an admin account: </label>
                <div id="wrapper">
    
                <p>
                <input type="radio" name="superuser" checked>Yes</input>
                </p>
                <p>
                <input type="radio" name="superuser">No</input>
                </p>
                </div>
                <br>
            

                <input type="submit" id="submit" value="Create user" disabled>
            </form>
            <script>
            function check_pass() {
                if (document.getElementById('password').value ==
                        document.getElementById('confirm_password').value) {
                    document.getElementById('submit').disabled = false;
                    document.getElementById('matching_passwords').hidden = true;
                } else {
                    document.getElementById('submit').disabled = true;
                    document.getElementById('matching_passwords').hidden = false;
                    
                }
            }
            </script>
            </body>
        </html>
        `);
        response.end();
    }
    

}
async function add_employee_post(request, response){
    if (request.user === null || request.user.superuser == 0){ 
        console.log("hej");
        adminNoAccess(request, response); 
    }

    else{
        let post_body = await new Promise((resolve, reject) => {
            let body = ''
            request.on('data', function(data) {
              body += data;
            })
            request.on('end', function() {
              resolve(body);
            })
        });
        console.log('Body: ' + post_body);
    
        let post_parameters = {};
    
        /* Decode the key value pairs from the url encoding */
        post_body.split("&").map((v) => {
            let split = v.split("=");
            post_parameters[decodeURIComponent(split[0])] = decodeURIComponent(split[1]);
        });
    
        /*  Dårlig måde aat håndtere fejl*/
        if (!(typeof post_parameters["username"] == "string" && typeof post_parameters["password"] == "string" && typeof post_parameters["employee_name"] == "string")) { 
            response.statusCode = 400;
            response.write("Some of the input is wrong");
            response.end();
            return;
        }
    
        /* Find the user if it exists */
        let username_unique = await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT id FROM user WHERE username=?", [post_parameters["username"]], (err, row) => {
                    if (err) {
                        resolve(null);
                    } else {
                        if (row == undefined) {
                            resolve(true);
                        } else {
                            request.session.last_error = "Username already exists";                            
                            resolve(false);
                        }
                    }
                })
            });
        });
    
        let employee_name_unique = await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT id FROM user WHERE name=?", [post_parameters["employee_name"]], (err, row) => {
                    if (err) {
                        resolve(null);
                    } else {
                        if (row == undefined) {
                            resolve(true);
                        } else {                            
                            session.last_error = "User with employee name already exists";
                            resolve(false);
                        }
                    }
                })
            });
        });
        console.log(post_parameters["password"]);
        if (username_unique && employee_name_unique) {
            request.session.last_error = "User succesfully added to database";
            let salt = crypto.randomBytes(16).toString(HASHING_HASH_ENCODING);
            let hashed = await new Promise((resolve, reject) => {
                crypto.pbkdf2(post_parameters["password"], salt, HASHING_ITERATIONS, HASHING_KEYLEN, HASHING_ALGO, (err, derivedKey) => {
                    if (err) {
                        reject(err);
                    }
                    resolve(derivedKey);
                });
            });
            
            db.run("INSERT INTO user (name, username, superuser, storeid, password, salt) VALUES (?, ?, ?, ?, ?, ?)", [[post_parameters["employee_name"]],[post_parameters["username"]], [post_parameters["superuser"]] == "on" ? true : false, request.user.storeId, hashed.toString(HASHING_HASH_ENCODING), salt]);
            }
            console.log("Bruger indsat i databasen");

            request.session.display_error = true;
            response.statusCode = 302;
            response.setHeader('Location','/admin/employees/add?storeid=' + request.session.storeId);
            response.end()
    }
}


async function remove_employee(request,response, error){
    if (request.user === null || request.user.superuser == 0 || request.query.storeid != request.user.storeId){
        adminNoAccess(request, response);
    }
    else{
        let username_list = await new Promise((resolve, reject) => {
            let sql = `SELECT DISTINCT Username username FROM user WHERE storeId=${request.user.storeId} ORDER BY username`;
            let a = [0];
            i = 0;
            
            db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                }
                rows.forEach((row) => {
                    b = row.username;
                    a[i] = b;
                    i++;

                });
                resolve (a);
            });
            
        });
        let html_table = "";
        for (i = 0; i < username_list.length; i++){
            html_table += `<tr> <th> ${username_list[i]} </th> </tr> <br>\n`
        }

        // Måde at vise fejl til brugeren
        request.session.display_error ? error = request.session.last_error : error = "";
        request.session.display_error = false;

        response.statusCode = 200;

        response.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Removing an employee </title>
            </head>
            <body>
                ${error ? `<p>${error}</p>` : ""}
                <a href="/admin"> Go to admin startpage </a> <br>
                <h> Removing employee from the store <h>
                
                <form action="/admin/employees/remove" method="POST">
                
                <label for="name">Write the username:     </label>
                <input type="text" placeholder="username" name="username" required><br>               

                <input type="submit" value="Delete user" onclick="return confirm('Are you sure?')" />
            </form>
            <b> Here is a table of the current employee accounts: <br> ${html_table} </b>
            </body>
        </html>
        `);
        
        response.end();
        }
}

async function remove_employee_post(request, response){
    if (request.user === null || request.user.superuser == 0){
        adminNoAccess(request, response);
    }
    else{
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

        post_body.split("&").map((v) => {
            let split = v.split("=");
            post_parameters[decodeURIComponent(split[0])] = decodeURIComponent(split[1]);
        });
       
        let user = await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT id, password, salt, superuser FROM user WHERE username=? AND storeId=?", [post_parameters["username"],request.user.storeId], (err, row) => {
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
        if (user == null){
            request.session.last_error = "Bruger ikke fundet";
            
        }
        else{
            request.session.last_error = "Bruger slettet";
            db.run("DELETE FROM user WHERE username=? AND storeId=?", [post_parameters["username"], request.user.storeId]);
        }
        

        request.session.display_error = true;
        response.statusCode = 302;
        response.setHeader('Location','/admin/employees/remove?storeid=' + request.session.storeId);
        response.end()
    }
}

main();