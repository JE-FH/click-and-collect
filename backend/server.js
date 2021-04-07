const http = require("http");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises");
const crypto = require("crypto");

const {isStringInt, isStringNumber, receiveBody, parseURLEncoded, assertAdminAccess, assertEmployeeAccess, setupEmail, sendEmail} = require("./helpers");
const {queryMiddleware, sessionMiddleware, createUserMiddleware} = require("./middleware");
const {adminNoAccess, invalidParameters} = require("./generic-responses");
const {dbAll, dbGet, dbRun, dbExec} = require("./db-helpers");


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
                    loginPost(request, response);
                    break;
                case "/api/add_package":
                    apiPost(request, response);
                    break;
                case "/package_form_handler":
                    packageFormHandler(request, response);
                    break;
                case "/admin/employees/add":
                    addEmployeePost(request, response);
                    break;
                case "/admin/employees/remove":
                    removeEmployeePost(request,response);
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
                case "/": // Når man går direkte ind på "hjemmesiden"   
                case "/login":
                    loginGet(request, response);
                    break;
                case "/admin/employees/add":
                    addEmployee(request, response, "");
                    break;
                case "/admin/employees/remove":
                    removeEmployee(request,response, "");
                    break;
                case "/admin/queues":
                    queueList(request, response);
                    break;
                case "/admin":
                    adminGet(request, response);
                    break;
                case "/admin/employees":
                    employeesDashboard(request, response);
                    break;
                case "/admin/employees/employee_list":
                    employeeList(request, response);
                    break;
                case "/admin/package_form":
                    packageFormGet(request, response);
                    break;
                case "/static/style.css":
                    staticStyleCss(response);
                    break;
                case "/store":
                    storeMenu(request, response);
                    break;
                case "/store/packages":
                    packageList(request, response, "");
                    break;
                case "/static/js/queueListScript.js":
                    serveFile(response, __dirname + "/../frontend/js/queueListScript.js", "text/javascript");
                    break;
                case "/package":
                    getTime(request, response);
                    break;
                case "/store/scan":
                    storeScan(request, response);
                    break;
                case "/static/js/qrScannerScript.js":
                    serveFile(response, __dirname + "/../frontend/js/qrScannerScript.js", "text/javascript");
                    break;
                case "/static/js/external/qr-scanner.umd.min.js":
                    serveFile(response, __dirname + "/../frontend/js/external/qr-scanner.umd.min.js", "text/javascript");
                    break;
                case "/static/js/external/qr-scanner-worker.min.js":
                    serveFile(response, __dirname + "/../frontend/js/external/qr-scanner-worker.min.js", "text/javascript");
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

async function serveFile(response, filename, contentType) {
    let content = (await fs.readFile(filename)).toString();
    response.statusCode = 200;
    response.setHeader("Content-Type", contentType);
    response.write(content);
    response.end();
}

/* Request handler for the /api/addPackage endpoint */
async function apiPost(request, response) {
    let body = await receiveBody(request);
    body = parseURLEncoded(body);
    if(isApiPostValid(body)) {
        let store = await apiKeyToStore(body.apiKey);
        if (store != null){
            console.log('Valid post body');
            addPackage(store.id, body.customerEmail, body.customerName, body.orderId);
            //console.log(store);
            response.statusCode = 200;
            response.end();
        }
        else{
            console.log("No store has a matching API key.")
            response.statusCode = 400;
            response.end()
        }
    } else {
        response.statusCode = 400;
        response.end()
    }
}

/* Returns the associated store from a given API key */
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

/* Returns the associated store from a given store id */
async function storeIdToStore(storeId) {
    let store = await new Promise((resolve, reject) => {
        db.get("SELECT * FROM store WHERE id=?", [storeId], (err, row) => {
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
    if(body == null) {
        console.log('POST body is undefined');
        return false;
    } else {
        return true;
    }
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

    let body = await receiveBody(request);
    body = parseURLEncoded(body);
    addPackage(4563, body.customerEmail, body.customerName, body.externalOrderId);
    response.statusCode = 302;
    response.setHeader('Location', request.headers['referer']);
    response.end();
}

/* Adds a package to the 'package' table in the database */
async function addPackage(storeId, customerEmail, customerName, externalOrderId) {
    let guid, bookedTimeId, creationDate, verificationCode;
    guid = crypto.randomBytes(8).toString("hex");
    bookedTimeId = null;
    creationDate = new Date();
    verificationCode = crypto.randomBytes(16).toString("hex");
    let existingOrder = await new Promise((resolve, reject) => {
        db.get("SELECT * FROM package WHERE externalOrderId=?", [externalOrderId], (err, row) => {
            if(err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    }) /* Vi tjekker om en pakke med samme ordre id eksisterer og gør ikke så meget ved det*/
    if (existingOrder != null){
        console.log(`An order with this id already exists: ${externalOrderId}`);
    }
    let query = 'INSERT INTO package (guid, storeId, bookedTimeId, verificationCode, customerEmail, customerName, externalOrderId, creationDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';

    db.run(query, [guid, storeId, bookedTimeId, verificationCode, customerEmail, customerName, externalOrderId, creationDate]);

    console.log('Package added for: ' + customerName);

    let store = await storeIdToStore(storeId);
    

    await sendEmail(customerEmail, customerName, `${store.name}: Choose a pickup time slot`, `Link: http://127.0.0.1:8000/package/${guid}/select_time`, await renderMailTemplate(customerName, store, guid, creationDate));
}

async function renderMailTemplate(name, store, uid, timestamp) {
    return `
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <title>Choose pickup</title>
            </head>
            <body>
                <h1>Pick a time slot</h1>
                <p>Hello ${name}. You have ordered items from ${store.name}.</p>
                <p>Order received ${timestamp}.</p>
                <h2>Your link:</h2>
                <p>http://127.0.0.1:8000/package/${uid}/select_time</p>
            </body>
        </html>
    `;
}

function packageFormGet(request, response) {
    let wantedStoreId = assertAdminAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }

    response.setHeader('Content-Type', 'text/html');
    response.write(renderPackageForm(request.query.storeid));
    response.end();
    response.statusCode = 200;
}

function renderPackageForm(storeid) {
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
                <a href="/admin?storeid=${storeid}"> Go to admin startpage </a> <br>
                <h1>Add package</h1>
                <form action="/package_form_handler?storeid=${storeid}" method="POST">
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

/* Request handler for any endpoint that isn't explicitally handled */
function defaultResponse(response) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain');
    response.write("Page not found");
    response.end();
   
}

async function loginGet(request, response, error) {
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
async function loginPost(request, response) {
    /* Read the post body */
    let postBody = await receiveBody(request);

    postParameters = parseURLEncoded(postBody);

    /* Make sure that we got the right parameters */
    if (!(typeof postParameters["username"] == "string" && typeof postParameters["password"] == "string")) {
        loginGet(request, response, "You didn't enter username and/or password");
        return;
    }

    /* Find the user if it exists */
    let user = await dbGet(db, "SELECT id, password, salt, storeId, superuser FROM user WHERE username=?", postParameters["username"]);

    if (user == null) {
        /* Wrong username */
        loginGet(request, response, "Wrong username")
        return;
    }

    /* Create a hash from the given password */
    let hashed = await new Promise((resolve, reject) => {
        crypto.pbkdf2(postParameters["password"], user.salt, HASHING_ITERATIONS, HASHING_KEYLEN, HASHING_ALGO, (err, derivedKey) => {
            if (err) {
                reject(err);
            }
            resolve(derivedKey);
        });
    });
    
    /* Compare the stored password and the given password using function that protects against timing attacks*/
    if (crypto.timingSafeEqual(Buffer.from(user.password, HASHING_HASH_ENCODING), hashed)) {
        response.statusCode=302;
        
        //same same but different
        request.session.userId = user.id;
        request.session.storeId = user.storeId;
        if (user.superuser) { 
            response.setHeader('Location','/admin?storeid=' + user.storeId.toString());
            
        } else {
            response.setHeader('Location','/store?storeid=' + user.storeId.toString());
        }
        response.end();

        //TODO: set session state when we have session middleware or something like that
        return;
    } else {
        /* Wrong password */
        loginGet(request, response, "Wrong password");
        return;
    }

}

async function storeMenu(request, response){

    let wantedStoreId = assertEmployeeAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }

    let storeId = await dbGet(db, "SELECT * FROM store WHERE id=?", [wantedStoreId]);
    if (storeId == undefined) {
        throw new Error(`Expected store with id ${wantedStoreId} to exist`);
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

    /* Print the menu site and the buttons redirecting to their respective endpoints */
    /* TODO - more buttons */
    
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
            <ul>
                <li><a href="/store/packages?storeid=${store.id}">Package overview</a></li>
                <li><a href="/store/scan?storeid=${store.id}">Scan package</a></li>
            </ul>
        </body>
    </html>
    `)
    response.end();
}

async function packageList(request,response, error){
   
    let wantedStoreId = assertEmployeeAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }

    let storeId = await dbGet(db, "SELECT * FROM store WHERE id=?", [wantedStoreId]);
    if (storeId == undefined) {
        throw new Error(`Expected store with id ${wantedStoreId} to exist`);
    }

    else{
        let packages = await new Promise((resolve, reject) => {
            let sql = `SELECT * FROM package WHERE storeId=${request.user.storeId} ORDER BY id`;
            let a = [0];
            i = 0;
            
            if(sql == null || sql == undefined){
                resolve(a);
            }

            db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                }

                rows.forEach((row) => {
                    b = row;
                    a[i] = b;
                    i++;

                });
                resolve (a);
            });
            
        });

        let packageTable = `<table>
                            <tr>
                                <th>Package ID</th>
                                <th>Customer's name</th>
                                <th>Customer's e-mail address</th>
                                <th>Booked time</th>
                                <th>Verification code</th>
                                <th>Order id</th>
                                <th>Time of order</th>
                            </tr>`
        for (i = 0; i < packages.length; i++){
            packageTable += `
                            <tr>
                                <td>${packages[i].id}</td>
                                <td>${packages[i].customerName}</td>
                                <td>${packages[i].customerEmail}</td>
                                <td>${packages[i].bookedTimeId}</td>
                                <td>${packages[i].verificationCode}</td>
                                <td>${packages[i].externalOrderId}</td>
                                <td>${packages[i].creationDate}</td>
                            </tr>
            `
        }
        packageTable += `</table>`

        // Måde at vise fejl til brugeren
        request.session.display_error ? error = request.session.last_error : error = "";
        request.session.display_error = false;

        response.statusCode = 200;

        response.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Package overview</title>
            </head>
            <body>
                <a href="/store?storeid=${wantedStoreId}"> Return to store menu </a> <br>
                <h> Package overview <h>
            </form>
            <br>
            <b> List of current packages: </b>
            <br> 
            ${packageTable} 
            </body>
        </html>
        `);
        
        response.end();
        }
}

async function adminGet(request, response) {
    let wantedStoreId = assertAdminAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }

    let store = await dbGet(db, "SELECT * FROM store WHERE id=?", [wantedStoreId]);
    if (store == undefined) {
        throw new Error(`Expected store with id ${wantedStoreId} to exist`);
    }

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html");
    response.write(`
<!DOCTYPE html>
<html>
    <head>
        <title>Store admin for ${store.name}</title>
    </head>
    <body>
        <h1>Hello ${request.user.name} these are your links</h1>
        <ul>
        <li><a href="/store?storeid=${store.id}"> Go to standard employee dashboard</a></li>
            <li><a href="/admin/queues?storeid=${store.id}">Manage queues</a></li>
            <li><a href="/admin/settings?storeid=${store.id}">Change settings</a></li>
            <li><a href="/admin/package_form?storeid=${store.id}">Create package manually</a></li>
            <li><a href="/admin/employees?storeid=${store.id}">Manage employees</a></li>
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

    let store = await dbGet(db, "SELECT * FROM store WHERE id=?", [wantedStoreId]);
    if (store == undefined) {
        throw new Error(`Expected store with id ${wantedStoreId} to exist`);
    }

    let queues = await dbAll(db, "SELECT * FROM queue WHERE storeId=?", [store.id]);

    request.session.storeName = store.name;

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
        <script type="text/javascript" src="/static/js/queueListScript.js"></script>
    </body>
</html>
`);
    response.end();
}

async function queueRemove(request, response) {
    let postData = await receiveBody(request);
    let postParameters = parseURLEncoded(postData);
    
    let wantedStoreId = assertAdminAccess(request, postParameters, response);
    if (wantedStoreId == null) {
        return;
    }

    if (!isStringInt(postParameters.queueid)) {
        invalidParameters(response, "queueid malformed", `/admin/queues?storeid=${wantedStoreId}`, "Back to queue list");
        return;
    }
    let wantedQueueId = Number(postParameters.queueid);

    await dbRun(db, "DELETE FROM queue WHERE id=? and storeId=?", [wantedQueueId, wantedStoreId]);

    response.statusCode = 302;
    response.setHeader("Location", "/admin/queues?storeid=" + wantedStoreId.toString());
    response.end();
}

async function queueAdd(request, response) {
    let postData = await receiveBody(request);
    let postParameters = parseURLEncoded(postData);

    let wantedStoreId = assertAdminAccess(request, postParameters, response);
    if (wantedStoreId == null) {
        return;
    }

    if (
        !isStringInt(postParameters.size) || 
        !isStringNumber(postParameters.latitude) ||
        !isStringNumber(postParameters.longitude)
    ){
        invalidParameters(response, "size, latitude or longitude malformed", `/admin/queues?storeid=${wantedStoreId}`, "Back to queue list");
        return;
    }

    let wantedSize = Number(postParameters.size);
    let wantedLatitude = Number(postParameters.latitude);
    let wantedLongitude = Number(postParameters.longitude);

    dbRun(db, "INSERT INTO queue (latitude, longitude, size, storeId) VALUES (?, ?, ?, ?)", [wantedLatitude, wantedLongitude, wantedSize, wantedStoreId]);

    response.statusCode = 302;
    response.setHeader("Location", "/admin/queues?storeid=" + wantedStoreId.toString());
    response.end();
}


async function storeScan(request, response) {
    let wantedStoreId = assertEmployeeAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }
    
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html");
    response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>scanner</title>
            <style>
                .hidden {
                    display: none;
                }
            </style>
        </head>
        <body>
            <h1>Scan a package</h1>
            <p id="loading-placeholder">Trying to open camera...</p>
            <div id="controls-container" class="hidden">
                <video id="scanner-content" disablepictureinpicture playsinline></video><br>
                <button id="start-scanner-btn">Start scanner</button>
                <button id="stop-scanner-btn">Stop scanner</button><br>
                <h2>Package details</h2>
                <form action="/store/package" method="GET">
                    <label for="validationKey">Validation key (when a qr code is found the key be set here): </label><br>
                    <input id="validation-key-input" type="text" name="validationKey" value=""><br>
                    <input type="hidden" value="${wantedStoreId}" name="storeid">
                    <input type="submit" value="Go to package"><br>
                </form>
            </div>
            <script src="/static/js/external/qr-scanner.umd.min.js"></script>
            <script src="/static/js/qrScannerScript.js"></script>
        </body>
    </html>
    `)
    response.end();
}

async function main() {
    const server = http.createServer(requestHandler);

    db = new sqlite3.Database(__dirname + "/../databasen.sqlite3");

    let databaseCreationCommand = (await fs.readFile(__dirname + "/database_creation.sql")).toString();

    console.log("Configuring database");
    
    /* Execute the database creation commands */
    await dbExec(db, databaseCreationCommand);

    console.log("Database correctly configured");

    userMiddleware = createUserMiddleware(db);

    await setupEmail();

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

function addEmployee(request, response){
    let wantedStoreId = assertAdminAccess(request, request.query, response);

    if (wantedStoreId == null) {
        return;  
    }

        response.statusCode = 200;

        // Måde at vise fejl til brugeren
        request.session.displayError ? error = request.session.lastError : error = "";
        request.session.displayError = false;

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
                <input type="text" name="employeeName" placeholder="Employee name" required><br> <br>

                <label for="password"> Password:     </label>
                <input type="password" name="password" placeholder="password" id="password" onchange='checkPass();' required> <br>

                <label for="confirmPassword"> Confirm password: </label>
                <input type="password" name="confirmPassword" placeholder="password" id="confirmPassword" onchange='checkPass();' required> <br>
                <input type="hidden" value="${wantedStoreId}" name="storeid">    
                <p id="matchingPasswords" style="color:red" hidden> The passwords do not match </p>
                



                <label for="superuser"> Is the account an admin account: </label>
                <div id="wrapper">
    
                <p>
                <input type="radio" value="1" name="superuser" checked>Yes</input>
                </p>
                <p>
                <input type="radio" value="0" name="superuser">No</input>
                </p>
                </div>
                <br>
            

                <input type="submit" id="submit" value="Create user" disabled>
            </form>
            <script>
            function checkPass() {
                if (document.getElementById('password').value ==
                        document.getElementById('confirmPassword').value) {
                    document.getElementById('submit').disabled = false;
                    document.getElementById('matchingPasswords').hidden = true;
                } else {
                    document.getElementById('submit').disabled = true;
                    document.getElementById('matchingPasswords').hidden = false;
                    
                }
            }
            </script>
            </body>
        </html>
        `);
        response.end();
}
    

async function addEmployeePost(request, response){
    let postBody = await receiveBody(request);
    
    postParameters = parseURLEncoded(postBody);

    let wantedStoreId = assertAdminAccess(request, postParameters, response);

    if (wantedStoreId == null) {
        return;  
    }

    
    console.log(postParameters);
    /*  Dårlig måde aat håndtere fejl*/
    if (!(typeof postParameters["username"] == "string" && typeof postParameters["password"] == "string" && typeof postParameters["employeeName"] == "string")) { 
        response.statusCode = 400;
        response.write("Some of the input is wrong");
        response.end();
        return;
    }

    /* Find the user if it exists */
    let usernameUnique = await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.get("SELECT id FROM user WHERE username=?", [postParameters["username"]], (err, row) => {
                if (err) {
                    resolve(null);
                } else {
                    if (row == undefined) {
                        resolve(true);
                    } else {
                        request.session.lastError = "Username already exists";                            
                        resolve(false);
                    }
                }
            })
        });
    });

    let employeeNameUnique = await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.get("SELECT id FROM user WHERE name=?", [postParameters["employeeName"]], (err, row) => {
                if (err) {
                    resolve(null);
                } else {
                    if (row == undefined) {
                        resolve(true);
                    } else {                            
                        request.session.lastError = "User with employee name already exists";
                        resolve(false);
                    }
                }
            })
        });
    });
    if (usernameUnique && employeeNameUnique) {
        request.session.lastError = "User succesfully added to database";
        let salt = crypto.randomBytes(16).toString(HASHING_HASH_ENCODING);
        let hashed = await new Promise((resolve, reject) => {
            crypto.pbkdf2(postParameters["password"], salt, HASHING_ITERATIONS, HASHING_KEYLEN, HASHING_ALGO, (err, derivedKey) => {
                if (err) {
                    reject(err);
                }
                resolve(derivedKey);
            });
        });
        console.log("Bruger indsat i databasen");
        db.run("INSERT INTO user (name, username, superuser, storeid, password, salt) VALUES (?, ?, ?, ?, ?, ?)", [[postParameters["employeeName"]],[postParameters["username"]], [postParameters["superuser"]], request.user.storeId, hashed.toString(HASHING_HASH_ENCODING), salt]);
        }
        

        request.session.displayError = true;
        response.statusCode = 302;
        response.setHeader('Location','/admin/employees/add?storeid=' + request.session.storeId);
        response.end()
}


async function removeEmployee(request,response, error){
    let wantedStoreId = assertAdminAccess(request, request.query, response);

    if (wantedStoreId == null) {
        return;  
    }
    let usernameList = await new Promise((resolve, reject) => {
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
    let htmlTable = "";
    for (i = 0; i < usernameList.length; i++){
        htmlTable += `<tr> <th> ${usernameList[i]} </th> </tr> <br>\n`
    }

    // Måde at vise fejl til brugeren
    request.session.displayError ? error = request.session.lastError : error = "";
    request.session.displayError = false;

    response.statusCode = 200;

    response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>Removing an employee </title>
        </head>
        <body>
            ${error ? `<p>${error}</p>` : ""}
            <a href="/admin?storeid=${wantedStoreId}"> Go to admin startpage </a> <br>
            <h> Removing employee from the store <h>
            
            <form action="/admin/employees/remove" method="POST">
            
            <label for="name">Write the username:     </label>
            <input type="text" placeholder="username" name="username" required><br>     
            <input type="hidden" value="${wantedStoreId}" name="storeid">          
            <input type="submit" value="Delete user" onclick="return confirm('Are you sure?')" />
        </form>
        <b> Here is a table of the current employee accounts: <br> ${htmlTable} </b>
        </body>
    </html>
    `);
    
    response.end();
}

async function removeEmployeePost(request, response){
    let postBody = await receiveBody(request);
    postParameters = parseURLEncoded(postBody);
    let wantedStoreId = assertAdminAccess(request, postParameters, response);

    if (wantedStoreId == null) {
        return;  
    }
    
    
    
    
    let user = await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.get("SELECT id, password, salt, superuser FROM user WHERE username=? AND storeId=?", [postParameters["username"],request.user.storeId], (err, row) => {
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
        request.session.lastError = "Bruger ikke fundet";
    }
    else{
        request.session.lastError = "Bruger slettet";
        db.run("DELETE FROM user WHERE username=? AND storeId=?", [postParameters["username"], request.user.storeId]);
    }
    

    request.session.displayError = true;
    response.statusCode = 302;
    response.setHeader('Location','/admin/employees/remove?storeid=' + request.session.storeId);
    response.end()
}

function employeesDashboard(request, response){
    let wantedStoreId = assertAdminAccess(request, request.query, response);

    if (wantedStoreId == null) {
        return;  
    }
        response.write(`<!DOCTYPE html>
        <html>
            <head>
                <title>Store admin for ${request.session.storeName}</title>
            </head>
            <body>
                <h1>Hello ${request.user.name} these are your links</h1>
                <ul>
                    <li><a href="/admin/employees/employee_list?storeid=${request.session.storeId}">View a list of employees</a></li>
                    <li><a href="/admin/employees/remove?storeid=${request.session.storeId}">Remove employees</a></li>
                    <li><a href="/admin/employees/add?storeid=${request.session.storeId}">Add employees</a></li>
                    <li><a href="/admin?storeid=${request.session.storeId}">Back to the homepage</a></li>
                </ul>
            </body>
        </html>
        `)
    response.end();
    
}

/* Hjælpefunktion til at finde username, name, id og superuser til employee list
   clunky med den er funktionel ;)
*/

async function employeeList(request, response){
    let wantedStoreId = assertAdminAccess(request, request.query, response);

    if (wantedStoreId == null) {
        return;  
    }
        let userList = await new Promise((resolve, reject) => {
            let sql = `SELECT * FROM user WHERE storeId=${request.session.storeId} ORDER BY id`;
            let a = [0];
            i = 0;
            
            db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                }
                rows.forEach((row) => {
                    b = [ row.id, row.username, row.name,  row.superuser];
                    a[i] = b;
                    i++;
                });
                console.log(a);
                resolve (a);
            });
        });
        
        let htmlTable = await new Promise((resolve, reject) => {
        let htmlTable = `<table style="width=100%" border="1px">
        <tr> <th> Id </th> <th>Username</th> <th> Employee name </th> <th> Is the account a superuser </th>  </tr> <br>\n`;
        for (i = 0; i < userList.length; i++){
            isSuperuser = userList[i][3] == 1 ? "yes" : "no";
            htmlTable += `<tr> <td style="font-weight:normal" style="text-align:center" style="font-weight:normal"> ${userList[i][0]} </td> <td style="font-weight:normal" style="text-align:center"> ${userList[i][1]} </td> <td style="font-weight:normal" style="text-align:center"> ${userList[i][2]} </td> <td style="font-weight:normal" style="text-align:center"> ${isSuperuser}  </td>  </tr> <br>\n`;
        }
        htmlTable += `</table>`
        resolve(htmlTable);
        });

        response.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Employee list </title>
            </head>
            <body>
                <a href="/admin?storeid=${request.user.storeId}"> Go to admin startpage </a> <br>
                <h> Employee list <h> <br>
                <b> Here is a table of the current employee accounts: <br> ${htmlTable} </b>
            </body>
        </html>
        `);
        
        response.end();
}


function getTime(request, response) {

    /* Collects the data from the database */
    db.all(`select 
    id, 
    startTime, 
    endTime, 
    strftime("%H:%M:%S", startTime) as time_format, 
    group_concat(startTime) as startTimes,
    group_concat(endTime) as endTimes,
    group_concat(id) as ids
    from timeSlot 
    where storeId=?
    GROUP BY time_format
    ORDER BY time_format ASC`, [4563], (err, result) => {

        /* middle part of the html */
        let rowsHTML = ``;
        /* Checks if there are data to be found, if not it will be logged*/
        if (result.length > 0) {
            
            /* Runs through the (result) which is the collected data */
            for (let row of result) {
                rowsHTML += `<tr onclick="myFunction(this)">`;
                let starttimes = row.startTimes.split(",").map(x => new Date(x));
                let endtimes = row.endTimes.split(",").map(x => new Date(x));
                let ids = row.ids.split(",");

                /* Goes through the days of the week */
                for (let i = 0; i < 7; i++) {
                    let foundIndex = starttimes.findIndex((x) => {
                        return ((x.getDay() + 6) % 7) == i
                    });
                    if (foundIndex != -1) {
                        rowsHTML += `<td data-id="${ids[foundIndex]}">${format_date_as_time(starttimes[foundIndex])} - ${format_date_as_time(endtimes[foundIndex])}</td>`
                    } else {
                        rowsHTML += `<td></td>`;
                    }
                }
                rowsHTML += "</tr>";
            }
        }
    
        
        /* First part of html */
        let html = `
        <!DOCTYPE HTML>
        <html>
            <head>
                <title>Timeslots</title>
                <meta charset="UTF-8">
            </head>
            <style>

            h1 {
                text-align: center;
                background-color: #E3BCBC;
                background-position: 50% top;
                padding: 50px;
                font-weight: normal;
            }
            table {
                border-collapse: collapse;
                width: 100%;
            }


            th, td {
                text-align: center;
                border-radius: 5px;
            }
            th {
                color: #666;
                text-align: center;
            }

            td {
                padding: 15px;
            }
            td:hover {background-color:#E3BCBC;}

            .modal {
                display: none; /* Hidden by default */
                position: fixed; /* Stay in place */
                z-index: 1; /* Sit on top */
                padding-top: 200px; /* Location of the box */
                left: 0;
                top: 0;
                width: 100%; /* Full width */
                height: 100%; /* Full height */
                overflow: auto; /* Enable scroll if needed */
                background-color: rgb(0,0,0); /* Fallback color */
                background-color: rgba(0,0,0,0.4); /* Black w/ opacity */
            }
            
            .modal-content {
                background-color: #fefefe;
                margin: auto;
                padding: 20px;
                border: 1px solid #888;
                width: 80%;
            }
            
            .close {
                color: #aaaaaa;
                float: right;
                font-size: 28px;
                font-weight: bold;
            }
            
            .close:hover,
            .close:focus {
              color: #000;
              text-decoration: none;
              cursor: pointer;
            }

            </style>

            <body> 

                <h1> Week x </h1>
            
                <div class="time">
                <table>
                <thead>
                    <tr>
                        <th>Monday</th>
                        <th>Tuesday</th>
                        <th>Wednesday</th>
                        <th>Thursday</th>
                        <th>Friday</th>
                        <th>Saturday</th>
                        <th>Sunday</th>
                    </tr>
                </thead>
            <tbody> 
                `
                
                
        /* Second part of html, right now there is an alert box when clicking on a td (timeslot)*/
        let html2 = `

        </div>

        <div id="myModal" class="modal">

            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>Press submit to accept the selected time slot</h2>
                <p id="test"> </p>
                <form action="/package/confirm" method="GET">
                    <input type="submit" value="Submit" style="font-size:20px;"/>
                </form>
                
            </div>
        </div>

        <script>
        var modal = document.getElementById("myModal");
        var btn = document.getElementById("myBtn");
        var span = document.getElementsByClassName("close")[0];
        
        var elements= document.getElementsByTagName('td');
        for(var i = 0; i < elements.length; i++){
        (elements)[i].addEventListener("click", function(){
           modal.style.display = "block";

           
           var dataId = this.getAttribute('data-id');

           var x = this.innerHTML;

           document.getElementById("test").innerHTML = x;
           console.log(dataId);
           console.log(this);

           if (this.innerHTML == "") {
               modal.style.display = "none";
           }
        });
        }
       
        span.onclick = function() {
        modal.style.display = "none";
        }

        window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
            }
        }
        </script>

        </body>

        </html>
        `

        /* Stacks the html parts */
        let page = html + rowsHTML+ html2;

        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html');
        response.write(page);

        response.end();
    
    });

}
/* Helping function to the function getTime*/
function format_date_as_time(date) {
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}


main();