const http = require("http");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises");
const crypto = require("crypto");
const moment = require("moment");
const {isStringInt, isStringNumber, receiveBody, parseURLEncoded, assertAdminAccess, assertEmployeeAccess, setupEmail, sendEmail} = require("./helpers");
const {queryMiddleware, sessionMiddleware, createUserMiddleware} = require("./middleware");
const {adminNoAccess, invalidParameters} = require("./generic-responses");
const {dbAll, dbGet, dbRun, dbExec} = require("./db-helpers");
const { Console } = require("console");


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
                    defaultResponse(request, response);
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
                case "/store/package/confirm":
                    packageStoreConfirm(request, response);
                    break;
                case "/store/package/undeliver":
                    packageStoreUnconfirm(request, response);
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
                case "/store/package":
                    packageStoreView(request, response);
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
                    defaultResponse(request, response);
                    break;
            }
            break;
        }
        default:
            defaultResponse(request, response);
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
function defaultResponse(request, response) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/html');
    let userId = null;
    if (request.user != null){
        userId = request.user.storeId;
    }
    
    console.log(userId);

    response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>404 page not found</title>
        </head>
        <body>
            <b> Webpage can not be found. <br></b>
            <a href="/login">Go to login page </a> <br>
            <a href="/store?storeid=${userId}"> Go to employee dashboard</a> <br>
            <a href="/admin?storeid=${userId}"> Go to admin dashboard</a> <br>

        </body>
    </html>
    `);
    response.end();
   
}

async function loginGet(request, response, error) {
    response.statusCode = error == null ? 200 : 401;
    response.setHeader('Content-Type', 'text/html');
    response.write(`
<!DOCTYPE html>
<html>
    <head>
        <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.13.0/css/all.min.css">
        <title>login</title>
        <style>
                    .container i {
                        margin-left: -30px;
                        cursor: pointer;
                    }
                </style>
    </head>

    <body>
        ${error ? `<p>${error}</p>` : ""}
        <form action="/login" method="POST">
            <label for="username">Username: </label>
            <input type="text" name="username" placeholder="username" required><br>
            <div class="container">
                    <label for="password"> Password:     </label>
                    <input type="password" name="password" placeholder="password" id="password" required>
                    <i class="fas fa-eye" id="togglePassword"> </i>
                </div>
            <input type="submit" value="login">
        </form>

        <script>
            // Eye toggle for password
            const togglePassword = document.querySelector('#togglePassword');
            const password = document.querySelector('#password');

            togglePassword.addEventListener('click', function (e) {
                const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
                password.setAttribute('type', type);
                this.classList.toggle('fa-eye-slash');
            });
    
        </script>

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

    let store = await dbGet(db, "SELECT * FROM store WHERE id=?", [wantedStoreId]);
    if (store == undefined) {
        throw new Error(`Expected store with id ${wantedStoreId} to exist`);
    }

    let superuser = request.user.superuser;
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
            <h1>Menu for ${request.user.name}:</h1>
            <ul>
                ${superuser ? `<li> <a href="/admin?storeid=${wantedStoreId}"> Back to admin page </a> </li>` : ""}
                <li><a href="/store/packages?storeid=${wantedStoreId}">Package overview</a></li>
                <li><a href="/store/scan?storeid=${wantedStoreId}">Scan package</a></li>
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
        if (packages.length == 1 && packages.id == undefined){

        }
        else{
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
        }}
        packageTable += `</table>`

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
        <h1> Admin menu for ${request.user.name}: </h1>
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
            <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.13.0/css/all.min.css">
            <style>
                .hidden {
                    display: none;
                }
            </style>
        </head>
        <body>
            <h1>Scan a package</h1>
            <a href="/store?storeid=${request.user.storeId}"> Go to employee startpage </a> <br>
            <p id="loading-placeholder">Trying to open camera...</p>
            <div id="controls-container" class="hidden">
                <video id="scanner-content" disablepictureinpicture playsinline></video><br>
                <button id="start-scanner-btn">Start scanner</button>
                <button id="stop-scanner-btn">Stop scanner</button><br>
                <h2>Package details</h2>
                <form action="/store/package" method="GET">
                    <label for="validationKey">Validation key, automatically set when a qr code is scanned. Press the lock to manually input package: </label><br>
                    <input id="validation-key-input" type="text" name="validationKey" disabled="true" value="">
                    <i class="fas fa-unlock" onclick="toggleValidationInput()"> </i> <br>
                    <input type="hidden" value="${wantedStoreId}" name="storeid">
                    <input type="submit" value="Go to package"><br>
                </form>
            </div>

            <!-- Burde måske samles i en script -->
            <script src="/static/js/external/qr-scanner.umd.min.js"></script>
            <script src="/static/js/qrScannerScript.js"></script>
            <script>
                function toggleValidationInput(){
                    elm = document.getElementById('validation-key-input');
                    elm.disabled ? elm.disabled = false : elm.disabled = true;
                }
            </script>
        </body>
    </html>
    `)
    response.end();
}

async function packageStoreView(request, response) {
    let wantedStoreId = assertEmployeeAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }
    if (typeof(request.query.validationKey) != "string") {
        invalidParameters(response, "validationKey was not set", `/store/scan?storeid=${wantedStoreId}`, "package scanner");
        return;
    }

    let package = await dbGet(db, "SELECT * FROM package WHERE verificationCode=? AND storeId=?", [request.query.validationKey, wantedStoreId]);
    if (package == null) {
        invalidParameters(response, "package with given validationKey does not exist", `/store/scan?storeid=${wantedStoreId}`, "package scanner");
        return;
    }

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html");
    response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>Package overview</title>
        </head>
        <body>
            <a href="/store/scan?storeid=${wantedStoreId}">Back to scanner</a>
            <h1>Package overview</h1>
            <h2>Details</h2>
            <p>status: ${package.delivered == 0 ? "NOT DELIVERED" : "DELIVERED"}
            <p>guid: ${package.guid}</p>
            <p>bookedTimeId: ${package.bookedTimeId}</p>
            <p>verification code: ${package.verificationCode}</p>
            <p>customerEmail: ${package.customerEmail}</p>
            <p>customerName: ${package.customerName}</p>
            <p>externalOrderId: ${package.externalOrderId}</p>
            <p>creationDate: ${package.creationDate}</p>
            <h2>Actions</h2>
            <form action="/store/package/${package.delivered == 0 ? "confirm" : "undeliver"}" method="POST">
                <input type="hidden" value="${wantedStoreId}" name="storeid">
                <input type="hidden" value="${package.id}" name="packageid">
                <input type="submit" value="${package.delivered == 0 ? "Confirm delivery" : "Mark as not delivered"}">
            </form>
        </body>
    </html>
    `)
    response.end();
}

async function packageStoreConfirm(request, response) {
    let post_data = parseURLEncoded(await receiveBody(request));
    
    let wantedStoreId = assertEmployeeAccess(request, post_data, response);
    if (wantedStoreId == null) {
        return;
    }

    if (!isStringInt(post_data.packageid)) {
        invalidParameters(response, "packageid was not set", `/store?storeid=${wantedStoreId}`, "store dashboard");
        return;
    }

    let actual_package_id = Number(post_data.packageid);

    let package = await dbGet(db, "SELECT * FROM package WHERE id=? AND storeId=? AND delivered=0", [actual_package_id, wantedStoreId]);
    if (package == null) {
        invalidParameters(response, "packageid was not valid", `/store/scan?queryid=${wantedStoreId}`, "package scanner");
        return;
    }

    await dbRun(db, "UPDATE package SET delivered=1 WHERE id=? AND storeId=? AND delivered=0", [actual_package_id, wantedStoreId]);

    response.statusCode = 302;
    response.setHeader("Location", `/store/package?storeid=${wantedStoreId.toString()}&validationKey=${package.verificationCode}`);
    response.end();
}

async function packageStoreUnconfirm(request, response) {
    let post_data = parseURLEncoded(await receiveBody(request));
    
    let wantedStoreId = assertEmployeeAccess(request, post_data, response);
    if (wantedStoreId == null) {
        return;
    }

    if (!isStringInt(post_data.packageid)) {
        invalidParameters(response, "packageid was not set", `/store?storeid=${wantedStoreId}`, "store dashboard");
        return;
    }

    let actual_package_id = Number(post_data.packageid);

    let package = await dbGet(db, "SELECT * FROM package WHERE id=? AND storeId=? AND delivered=1", [actual_package_id, wantedStoreId]);
    if (package == null) {
        invalidParameters(response, "packageid was not valid", `/store/scan?queryid=${wantedStoreId}`, "package scanner");
        return;
    }

    await dbRun(db, "UPDATE package SET delivered=0 WHERE id=? AND storeId=? AND delivered=1", [actual_package_id, wantedStoreId]);

    response.statusCode = 302;
    response.setHeader("Location", `/store/package?storeid=${wantedStoreId.toString()}&validationKey=${package.verificationCode}`);
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
                <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.13.0/css/all.min.css">
                
                <style>
                    .container i {
                        margin-left: -30px;
                        cursor: pointer;
                    }
                </style>
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
                <div class="container">
                    <label for="password"> Password:     </label>
                    <input type="password" name="password" placeholder="password" id="password" onchange='checkPass();' minlength="8" required>

                    <i class="fas fa-eye" id="togglePassword"> </i>
                </div>
                
                <div class="container">
                    <label for="confirmPassword"> Confirm password: </label>
                    <input type="password" name="confirmPassword" placeholder="password" id="confirmPassword" onchange='checkPass();' required>
                    
                    <i class="fas fa-eye" id="toggleConfirmPassword"> </i>
                </div>
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
            
           // Eye toggle for password
            const togglePassword = document.querySelector('#togglePassword');
            const password = document.querySelector('#password');

            togglePassword.addEventListener('click', function (e) {
                const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
                password.setAttribute('type', type);
                this.classList.toggle('fa-eye-slash');
            });
            

            // Eye toggle for confirmPassword
            const toggleConfirmPassword = document.querySelector('#toggleConfirmPassword');
            const ConfirmPassword = document.querySelector('#confirmPassword');

            toggleConfirmPassword.addEventListener('click', function (e) {
                const type = confirmPassword.getAttribute('type') === 'password' ? 'text' : 'password';
                confirmPassword.setAttribute('type', type);
                this.classList.toggle('fa-eye-slash');
            });
            
            
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

    if (usernameUnique) {
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
            db.get("SELECT username, id, password, salt, superuser FROM user WHERE username=? AND storeId=?", [postParameters["username"],request.user.storeId], (err, row) => {
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
        request.session.lastError = "User not found";
    }
    else if(user.username == request.user.username){
        request.session.lastError = "You can't delete your own user";
    }
    else{
        request.session.lastError = "User deleted";
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
                <h1>Manage employees </h1>
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
                resolve (a);
            });
        });
        
        let htmlTable = await new Promise((resolve, reject) => {
        let htmlTable = `<table style="width=100%" border="1px">
        <tr> <th> Id </th> <th>Username</th> <th> Employee name </th> <th> Is the account a superuser </th>  </tr> <br>\n`;
        for (i = 0; i < userList.length; i++){
            let isSuperuser = userList[i][3] == 1 ? "yes" : "no";
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


async function getTime(request, response) {
    if (typeof(request.query.guid) != "string") {
        invalidParameters(response, "The link was invalid, if you believe this is a mistake, contact the store you ordered your item at");
        return;
    }

    let target_package = await dbGet(db, "SELECT * FROM package WHERE guid=?", [request.query.guid]);
    if (target_package == null) {
        invalidParameters(response, "The link was invalid, if you believe this is a mistake, contact the store you ordered your item at");
        return;
    }

    if (target_package.bookedTimeId != null || target_package.delivered == 1) {
        time_booked_page(request, response, target_package);
        return;
    }

    let now = moment();
    let selected_year = now.isoWeekYear();
    let selected_week = now.isoWeek();
    let starting_point = moment(now);

    if (typeof(request.query.year) == "string") {
        let parsed_year = Number(request.query.year);                                     //Just some limits that should avoid some edge cases
        if (!Number.isNaN(parsed_year) && Number.isInteger(parsed_year) && parsed_year >= now.year() - 5 && parsed_year < now.year() + 5) {
            selected_year = parsed_year;
        }
    }

    if (typeof(request.query.week) == "string") {
        let parsed_week = Number(request.query.week);
        if (!Number.isNaN(parsed_week) && Number.isInteger(parsed_week) && parsed_week >= 0) {
            let lowerBound = moment(starting_point).startOf("year").startOf("isoWeek");
            let upperBound = moment(starting_point).endOf("year").endOf("isoWeek"); 
            let proposed_date = moment(starting_point).isoWeek(parsed_week);
            if (proposed_date.isAfter(upperBound) || proposed_date.isBefore(lowerBound) || parsed_week == 0) {
                if (proposed_date.isAfter(upperBound)) {
                    response.statusCode = 302;
                    response.setHeader("Location", `/package?week=1&year=${selected_year+1}`);
                    response.end();
                    return;
                } else {
                    response.statusCode = 302;
                    response.setHeader("Location", `/package?week=${moment().isoWeekYear(selected_year).isoWeeksInYear()}&year=${selected_year-1}`);
                    response.end();
                    return;
                }
            } else {
                selected_week = proposed_date.isoWeek();
            }
        }
    }

    let selected_week_day = moment().isoWeekYear(selected_year).isoWeek(selected_week);
    let lower = moment(selected_week_day).startOf("isoWeek");
    let upper = moment(selected_week_day).endOf("isoWeek");
    console.log(`Selected time range ${lower} - ${upper}`);
    
    /* Collects the data from the database */
    let result = dbAll(`WITH valid_timeslots (id, storeId, startTime, endTime, queueId) as (
        select t.id as timeSlotId, t.storeId, t.startTime, t.endTime, t.queueId
        from timeSlot t
        left outer join package p on t.id = p.bookedTimeId
        left outer join queue q on t.queueId = q.id
        where t.startTime >= datetime(?) AND t.startTime <= datetime(?) AND t.storeId=?
        GROUP BY t.id, p.bookedTimeId
        having  q."size" > count(p.id)
        )
        SELECT 
            id, 
            startTime, 
            endTime, 
            strftime("%H:%M:%S", startTime) as time_format, 
            group_concat(startTime || "," || endTime || "," || id, ";") as timeSlotDataStr
        FROM valid_timeslots
        GROUP BY time_format
        ORDER BY time_format ASC`, [lower.format("YYYY-MM-DDTHH:mm:ss"), upper.format("YYYY-MM-DDTHH:mm:ss"), target_package.storeId]);

        result.forEach(row => {
            row.timeSlotData = [];
            let split = row.timeSlotDataStr.split(";");
            split.forEach(x => {
                let split2 = x.split(",");
                if (split2.length != 3) {
                    throw new Error("Database returned invalid data");
                }
                row.timeSlotData.push({
                    id: Number(split2[2]),
                    startTime: new Date(split2[0]),
                    endTime: new Date(split2[1])
                });
            });
        });
        /* middle part of the html */
        let rowsHTML = ``;
        /* Checks if there are data to be found, if not it will be logged*/
        if (result.length > 0) {
            /* Runs through the (result) which is the collected data */
            for (let row of result) {
                rowsHTML += `<tr>`;
                /* Goes through the days of the week */
                for (let i = 0; i < 7; i++) {
                    let found = row.timeSlotData.find((x) => {
                        return ((x.startTime.getDay() + 6) % 7) == i
                    });
                    if (found != null) {                     //Adding 5 minute so the user has time to click it
                        rowsHTML += `<td><button ${new Date().getTime() + 1000 * 60 * 5 < found.endTime.getTime() ? "" : "disabled"} data-id="${found.id}">${format_date_as_time(found.startTime)} - ${format_date_as_time(found.endTime)}</button></td>`
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
            h2 {
                text-align: center;
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

            .submitbtn {
                position: relative;
                left: 47%;
                cursor: pointer;
            }
            .sTime {
                text-align: center;
            }


            </style>

            <body> 
                <form action="/package">
                    <input type="hidden" name="week" value="${selected_week - 1}">
                    <input type="hidden" name="year" value="${selected_year}">
                    <input type="hidden" name="guid" value="${target_package.guid}">
                    <input type="submit" value="Previous week">
                </form>
                <h1>Week ${selected_week_day.isoWeek() }</h1>
                <form action="/package">
                    <input type="hidden" name="week" value="${selected_week + 1}">
                    <input type="hidden" name="year" value="${selected_year}">
                    <input type="hidden" name="guid" value="${target_package.guid}">
                    <input type="submit" value="Next week">
                </form>
            
                <div class="time">
                <table>
                <thead>
                    <tr>
                        ${(Array(7).fill().map((_, i) => {
                            let thing = moment(lower).isoWeekday(i + 1);
                            return `<th>${thing.format("dddd")}<br>${thing.format("DD/MM/YYYY")}</th>`;
                        })).join("\n")}
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
                <h2>Do you want the following time slot?</h2>
                <p id="selectedTime" class="sTime"> </p>
                <form action="/package/confirm" method="POST">
                    <input id="selected-time-id" type="hidden" value="" name="selectedTimeId">
                    <input type="submit" class="submitbtn" value="Submit" style="font-size:20px;"/>
                </form>
                
            </div>
        </div>

        <script>
        var modal = document.getElementById("myModal");
        var btn = document.getElementById("myBtn");
        var span = document.getElementsByClassName("close")[0];
        
        var elements= document.querySelectorAll("button[data-id]");
        for(var i = 0; i < elements.length; i++){
        (elements)[i].addEventListener("click", function(){
           modal.style.display = "block";

           
           var dataId = this.getAttribute('data-id');

           var x = this.innerHTML;

           document.getElementById("selectedTime").innerHTML = x;
           document.getElementById("selected-time-id").value = dataId;
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

}

async function time_booked_page(request, response, package) {
    let bookedTimeSlot = null;
    if (package.bookedTimeId != null) {
        bookedTimeSlot = await dbGet(db, "SELECT * FROM timeSlot where id=?", [package.bookedTimeId]);
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.write(`<!DOCTYPE html>
        <html>
            <head>
                <title>Package status</title>
            </head>
            <body>
                <h1>Hey ${package.customerName == null ? "" : package.customerName}</h1>
                <p>You already selected a timeslot for this package, here is the information about your pacakge</p>
                <p>booked time period: ${bookedTimeSlot.startTime} - ${bookedTimeSlot.endTime}</p>
                <p>verificationCode: ${package.verificationCode}</p>
                <h2>Actions</h2>
                ${package.delivered == 0 ? `
                <p>If you cant pickup the package at the booked time, you can cancel the booked time and book a new time which fits better</p> 
                <form action="/package/cancel" method="POST">
                    <input type="hidden" value="${package.guid}" name="guid">
                    <input type="submit" value="Cancel the booked time">
                </form>` : ""}
            </body>
        </html>
    `);

    response.end();
}

/* Helping function to the function getTime*/
function format_date_as_time(date) {
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}


main();