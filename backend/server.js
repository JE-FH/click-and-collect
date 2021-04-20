const http = require("http");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises");
const crypto = require("crypto");
const moment = require("moment");
const {isStringInt, isStringNumber, receiveBody, parseURLEncoded, assertAdminAccess, assertEmployeeAccess, setupEmail, sendEmail, fromISOToDate, fromISOToHHMM } = require("./helpers");
const {queryMiddleware, sessionMiddleware, createUserMiddleware} = require("./middleware");
const {adminNoAccess, invalidParameters, invalidCustomerParameters} = require("./generic-responses");
const {dbAll, dbGet, dbRun, dbExec} = require("./db-helpers");
const QRCode = require("qrcode");


const port = 8000;
const hostname = '127.0.0.1';
const HOST = "http://127.0.0.1:8000";

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
                case "/admin/employees/edit":
                    editEmployeePost(request,response);
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
                case "/package/select_time":
                    selectTimeSlot(request, response);
                    break;
                case "/package/cancel":
                    cancelTimeSlot(request, response);
                    break;
            }
            break;
        }
        case "GET": {
            switch(request.path) {
                case "/":   
                case "/login":
                    loginGet(request, response);
                    break;
                case "/admin/employees/add":
                    addEmployee(request, response, "");
                    break;
                case "/admin/employees/edit":
                    editEmployee(request,response);
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
                    timeSlotSelector(request, response);
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
                case "/static/css/timeSlotSelection.css":
                    serveFile(response, __dirname + "/../frontend/css/timeSlotSelection.css", "text/css");
                    break;
                case "/static/js/timeSlotSelection.js":
                    serveFile(response, __dirname + "/../frontend/js/timeSlotSelection.js", "text/javascript");
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

async function sendReminders() {
    let unbookedPackages = await getUnbookedPackages();

    for await (let package of unbookedPackages) {
        switch(package.remindersSent) {
            case 0:
                await sendReminder(package);
                break;
            case 1:
                await remindStoreOwner(package);
                break;
            default:
                break;
        }
    }
}

/* Sends a reminder to the customer associated with the package if it is more than 3 days old and isn't booked for pickup yet */
async function sendReminder(package) {
    const msPerDay = 86400000;
    const days = 3;
    let now = new Date();
    let creationDelta = now-package.creationDate;

    if(creationDelta >= msPerDay*days) {
        console.log('Sending reminder to: ' + package.customerEmail + ' (3 days has passed)');
        sendEmail(package.customerEmail, package.customerName, "Reminder: no time slot booked", `Link: ${HOST}/package?guid=${package.guid}`, await reminderHTML(package));
        /* Increment package.remindersSent in database */
        db.run("UPDATE package SET remindersSent=1 WHERE id=?", [package.id]);
    } else {
        return;
    }
}

/* Sends a reminder to the store owner associated with the package if it is more than 14 days old and isn't booked for pickup yet */
async function remindStoreOwner(package) {
    const msPerDay = 86400000;
    const days = 14;
    let now = new Date();
    let creationDelta = now-package.creationDate;
    let store = await storeIdToStore(package.storeId);

    if(creationDelta >= msPerDay*days) {
        console.log('Sending reminder to store owner: ' + store.storeEmail + ' (14 days has passed - order: ' + package.externalOrderId + ')');
        sendEmail(store.storeEmail, store.name, "Reminder: no time slot booked", `Order: ${package.externalOrderId}`, await reminderStoreHTML(package));
        /* Increment package.remindersSent in database */
        db.run("UPDATE package SET remindersSent=2 WHERE id=?", [package.id]);
    } else {
        return;
    }
}

async function reminderStoreHTML(package) {
    return `
        <html>
            <head>
                <meta charset="UTF-8">
            </head>
            <body>
                <h1>Unbooked time slot</h1>
                <p>Order: ${package.externalOrderId}</p>
                <p>Customer info:<br>${package.customerName} (${package.customerEmail})</p>
                <p>Created: ${new Date(package.creationDate)}</p>
            </body>
        </html>
    `
}

async function reminderHTML(package) {
    let store = await storeIdToStore(package.storeId);

    return `
        <html>
            <head>
                <meta charset="UTF-8">
            </head>
            <body>
                <h1>Unbooked time slot</h1>
                <p>Hello ${package.customerName}, you still have not picked a time slot for picking up your order from ${store.name}</p>
                <p>Follow this link to book a time slot:</p>
                <a target="_blank" href="${HOST}/package?guid=${package.guid}">${HOST}/package?guid=${package.guid}</a>
            </body>
        </html>
    `
}

async function getUnbookedPackages() {
    let packages = await new Promise((resolve, reject) => {
       db.all("SELECT * FROM package WHERE bookedTimeId IS NULL", (err, rows) => {
           if(err) {
               reject(err);
           } else {
               resolve(rows);
           }
       }) 
    })

    return packages;
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
    creationDate = moment();
    verificationCode = generateVerification();
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

    db.run(query, [guid, storeId, bookedTimeId, verificationCode, customerEmail, customerName, externalOrderId, creationDate.format("YYYY-MM-DDTHH:mm:ss")]);

    console.log('Package added for: ' + customerName);

    let store = await storeIdToStore(storeId);

    await sendEmail(customerEmail, customerName, `${store.name}: Choose a pickup time slot`, `Link: ${HOST}/package?guid=${guid}`, await renderMailTemplate(customerName, store, guid, creationDate));
}

function generateVerification() {
    const length = 8;
    let result = [];
    let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    for(let i = 0; i < length; i++) {
        result.push(chars[crypto.randomInt(0, 36)]);
    }

    return result.join('');
}

/* Email template for reminders */
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
                <a target="_blank" href="${HOST}/package?guid=${uid}">${HOST}/package?guid=${uid}</a>
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

        if (user.superuser == 1) { 
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
                ${superuser == 1 ? `<li> <a href="/admin?storeid=${wantedStoreId}"> Back to admin page </a> </li>` : ""}
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
            let rv = [];
            db.all("SELECT * FROM package WHERE storeId=? ORDER BY id", [wantedStoreId], (err, rows) => {
                if (err) {
                    reject(err);
                }
                rows.forEach((row) => {
                    valueToAdd = row;
                    rv.push(valueToAdd);
                });
                resolve (rv);
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
        if (packages.length == 1 && packages[0].id == undefined){
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

    await dbRun(db, "DELETE FROM timeslot WHERE queueId=?", [wantedQueueId]);

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

    /* Sends reminders to customers who hasn't booked a time slot. Checks every 10 minutes. */
    setInterval(async () => {
        await sendReminders();
    }, 600000);

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
    postParameters["superuser"] = Number(postParameters["superuser"]);
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

async function editEmployee(request, response){
    let wantedStoreId = assertAdminAccess(request, request.query, response);

    if (wantedStoreId == null) {
        return;  
    }

    if (request.query.id == undefined){
        request.session.lastError = "You have to select a user to edit.";
        request.session.displayError = true;
        response.statusCode = 302;
        response.setHeader('Location','/admin/employees/employee_list?storeid=' + request.session.storeId);
        response.end();
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
            <title> Editing user: ${request.query.username} </title>
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
            <h> Editing user: ${request.query.username} <h>
            
            <form action="/admin/employees/edit" method="POST">
            <label for="username">Username:      </label>
            <input type="text" name="username" value="${request.query.username}" required><br>

            <label for="name"> Employee name: </label>
            <input type="text" name="employeeName" value="${request.query.name}" required><br> <br>
            <div class="container">
                <label for="password"> Password:     </label>
                <input type="password" name="password" value="password" id="password" onchange='checkPass();' minlength="8" required>

                <i class="fas fa-eye" id="togglePassword"> </i>
            </div>
            
            <div class="container">
                <label for="confirmPassword"> Confirm password: </label>
                <input type="password" name="confirmPassword" value="password" id="confirmPassword" onchange='checkPass();' required>
                
                <i class="fas fa-eye" id="toggleConfirmPassword"> </i>
            </div>
            <input type="hidden" value="${wantedStoreId}" name="storeid"> 
            <input type="hidden" value="${request.query.id}" name="id">   
            <p id="matchingPasswords" style="color:red" hidden> The passwords do not match </p>
            
            <label for="superuser"> Is the account an admin account: </label>
            <div id="wrapper">

            <p>
            <input type="radio" value="1" name="superuser" ${request.query.superuser == 1 ? "checked" :""}>Yes</input>
            </p>
            <p>
            <input type="radio" value="0" name="superuser" ${request.query.superuser == 1 ? "" :"checked"}>No</input>
            </p>
            </div>
            <br>
        
            <input type="submit" id="submit" value="Edit user">
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

async function editEmployeePost(request, response){
    let postBody = await receiveBody(request);
    
    postParameters = parseURLEncoded(postBody);
    postParameters["superuser"] = Number(postParameters["superuser"]);
    let wantedStoreId = assertAdminAccess(request, postParameters, response);

    if (wantedStoreId == null) {
        return;  
    }
    if (typeof(postParameters["password"]) != "string" || typeof(postParameters["username"]) != "string"
      || typeof(postParameters["employeeName"]) != "string" || typeof(postParameters["id"]) != "string" || typeof(postParameters["superuser"]) != "number")
      {
        request.session.lastError = "Some input data was invalid";
        request.session.displayError = true;
        response.statusCode = 302;
        response.setHeader('Location','/admin/employees/employee_list?storeid=' + request.session.storeId);
        response.end();
        return;
      }
    /* Find the user if it exists */
    let usernameUnique = await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.get("SELECT id FROM user WHERE username=? AND id!=?", [postParameters["username"],postParameters["id"]], (err, row) => {
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
    // Giver true hvis den bruger der bliver edited er den sidste superuser
    let lastAdminCheck = await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.get("SELECT id FROM user WHERE superuser=1 AND id!=?", [postParameters["id"]], (err, row) => {
                if (err) {
                    resolve(null);
                } else {
                    if (row == undefined) {
                        resolve(true);
                    } else {                        
                        resolve(false);
                    }
                }
            })
        });
    });

    let user = await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.get("SELECT * FROM user WHERE id=?", [postParameters["id"]], (err, row) => {
                if (err) {
                    resolve(null);
                } else {
                    if (row == undefined) {
                        request.session.lastError = "User you are trying to edit doesn't exist";
                        request.session.displayError = true;
                        response.statusCode = 302;
                        response.setHeader('Location','/admin/employees/employee_list?storeid=' + request.session.storeId);
                        response.end();
                        return;
                    } else {
                        resolve(row);
                    }
                }
            })
        });
    });
    changeInPassword = postParameters["password"] != "password";
    changeInUsername = postParameters["username"].trim() != user.username.trim();
    changeInName = postParameters["name"] != user.employeeName;
    changeInSuperuser = postParameters["superuser"] != user.superuser;

    if (changeInSuperuser || changeInUsername || changeInName || changeInPassword){
        if (!(lastAdminCheck && changeInSuperuser)){
            if (usernameUnique){    
    
                if (changeInPassword) {
                    let hashed = await new Promise((resolve, reject) => {
                        crypto.pbkdf2(postParameters["password"], user.salt, HASHING_ITERATIONS, HASHING_KEYLEN, HASHING_ALGO, (err, derivedKey) => {
                            if (err) {
                                reject(err);
                            }
                            resolve(derivedKey);
                        });
                    });
                    
                    db.run(`update user set password=? where id=?`,[hashed.toString(HASHING_HASH_ENCODING),user.id]);
                    }
                if (changeInUsername) {
                    db.run(`update user set username=? where id=?`, [postParameters["username"],user.id]);
                }
                if (changeInName) {
                    db.run(`update user set name=? where id=?`,[postParameters["employeeName"],user.id]);
                }
                if (changeInSuperuser) {
                    db.run(`update user set superuser=? where id=?`,[postParameters["superuser"],user.id]);
                }
                if (changeInUsername || changeInName || changeInPassword || changeInSuperuser){
                    request.session.lastError = `The user was edited.`;
                } else{
                    request.session.lastError = `No changes were made.`;
                }
            }
        } else{
            request.session.lastError = "You can not remove the last superuser.";
        }
    }
    else{
        request.session.lastError = "Nothing was changed.";
    }
    request.session.displayError = true;
    response.statusCode = 302;
    response.setHeader('Location','/admin/employees/employee_list?storeid=' + request.session.storeId);
    response.end()
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
    response.setHeader('Location','/admin/employees/employee_list?storeid=' + request.session.storeId);
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
                    <li><a href="/admin/employees/employee_list?storeid=${request.session.storeId}">View, edit and remove employee accounts</a></li>
                    <li><a href="/admin/employees/add?storeid=${request.session.storeId}">Add an employee account</a></li>
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
            let rv = [];
            
            db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                }
                rows.forEach((row) => {
                    valueToAdd = [ row.id, row.username, row.name,  row.superuser];
                    rv.push(valueToAdd);               
                });
                resolve (rv);
            });
        });

        let htmlTable = await new Promise((resolve, reject) => {
        let htmlTable = `<table style="width=100%" border="1px">
        <tr> <th> Id </th> <th>Username</th> <th> Employee name </th> <th> Is the account a superuser </th>  <th> Edit user </th> <th> Remove user </th> </tr> <br>\n`;
        for (i = 0; i < userList.length; i++){
            let isSuperuser = userList[i][3] == 1 ? "yes" : "no";
            htmlTable += `
            <tr> <td style="font-weight:normal" style="text-align:center" style="font-weight:normal">
             ${userList[i][0]} </td> <td style="font-weight:normal" style="text-align:center"> ${userList[i][1]} </td> <td style="font-weight:normal"
              style="text-align:center"> ${userList[i][2]} </td> <td style="font-weight:normal" style="text-align:center"> ${isSuperuser}  </td>
              
              <td> <form action="/admin/employees/edit" method="GET">
                <input type="hidden" value="${userList[i][0]}" name="id">   
                <input type="hidden" value="${userList[i][1]}" name="username">
                <input type="hidden" value="${userList[i][2]}" name="name">
                <input type="hidden" value="${userList[i][3]}" name="superuser">     
                
                <input type="hidden" value="${wantedStoreId}" name="storeid">   
                <input type="submit" value="Edit">
              
              </form> </td> 

              <td> <form action="/admin/employees/remove" method="POST">
                <input type="hidden" value="${userList[i][1]}" name="username">     
                <input type="hidden" value="${wantedStoreId}" name="storeid">   
                <input type="submit" value="Remove">
              
              </form> </td> 
               </tr> <br>\n`;
        }
        htmlTable += `</table>`
        resolve(htmlTable);
        });

        request.session.displayError ? error = request.session.lastError : error = "";
        request.session.displayError = false;

        response.statusCode = 200;
        response.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Employee list </title>
            </head>
            <body>
                ${error ? `<p>${error}</p>` : ""}
                <a href="/admin?storeid=${request.user.storeId}"> Go to admin startpage </a> <br>
                <h> Employee list <h> <br>
                <b> Here is a table of the current employee accounts: <br> ${htmlTable} </b>
            </body>
        </html>
        `);
        
        response.end();
}


async function timeSlotSelector(request, response) {
    if (typeof(request.query.guid) != "string") {
        invalidCustomerParameters(response, "The link is invalid, if you believe this is a mistake contact the store you ordered your item at.");
        return;
    }

    let targetPackage = await dbGet(db, "SELECT * FROM package WHERE guid=?", [request.query.guid]);
    if (targetPackage == null) {
        invalidCustomerParameters(response, "Your package could not be found, if you believe this is a mistake contact the store you ordered your item at.");
        return;
    }

    if (targetPackage.bookedTimeId != null || targetPackage.delivered == 1) {
        timeBookedPage(request, response, targetPackage);
        return;
    }

    let now = moment();
    let selectedYear = now.isoWeekYear();
    let selectedWeek = now.isoWeek();
    let startingPoint = moment(now);

    if (typeof(request.query.year) == "string") {
        let parsedYear = Number(request.query.year);                                     //Just some limits that should avoid some edge cases
        if (!Number.isNaN(parsedYear) && Number.isInteger(parsedYear) && parsedYear >= now.year() - 5 && parsedYear < now.year() + 5) {
            selectedYear = parsedYear;
        }
    }

    if (typeof(request.query.week) == "string") {
        let parsedWeek = Number(request.query.week);
        if (!Number.isNaN(parsedWeek) && Number.isInteger(parsedWeek) && parsedWeek >= 0) {
            let lowerBound = moment(startingPoint).startOf("year").startOf("isoWeek");
            let upperBound = moment(startingPoint).endOf("year").endOf("isoWeek"); 
            let proposedDate = moment(startingPoint).isoWeek(parsedWeek);
            if (proposedDate.isAfter(upperBound) || proposedDate.isBefore(lowerBound) || parsedWeek == 0) {
                if (proposedDate.isAfter(upperBound)) {
                    response.statusCode = 302;
                    response.setHeader("Location", `/package?guid=${request.query.guid}&week=1&year=${selectedYear+1}`);
                    response.end();
                    return;
                } else {
                    response.statusCode = 302;
                    response.setHeader("Location", `/package?guid=${request.query.guid}&week=${moment().isoWeekYear(selectedYear).isoWeeksInYear()}&year=${selectedYear-1}`);
                    response.end();
                    return;
                }
            } else {
                selectedWeek = proposedDate.isoWeek();
            }
        }
    }

    let selectedWeekDay = moment().isoWeekYear(selectedYear).isoWeek(selectedWeek);
    let lower = moment(selectedWeekDay).startOf("isoWeek");
    let upper = moment(selectedWeekDay).endOf("isoWeek");
    console.log(`Selected time range ${lower.format("YYYY-MM-DDTHH:mm:ss")} - ${upper.format("YYYY-MM-DDTHH:mm:ss")}`);
    
    /* Collects the data from the database */
    let result = await dbAll(db, `WITH valid_timeslots (id, storeId, startTime, endTime, queueId) as (
        select t.id as timeSlotId, t.storeId, t.startTime, t.endTime, t.queueId
        from timeSlot t
        left outer join package p on t.id = p.bookedTimeId
        left outer join queue q on t.queueId = q.id
        where t.startTime >= ? AND t.startTime <= ? AND t.storeId=?
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
        ORDER BY time_format ASC`, [lower.format("YYYY-MM-DDTHH:mm:ss"), upper.format("YYYY-MM-DDTHH:mm:ss"), targetPackage.storeId]);

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
        let page = `
        <!DOCTYPE HTML>
        <html>
            <head>
                <title>Timeslots</title>
                <meta charset="UTF-8">
                <link href="/static/css/timeSlotSelection.css" rel="stylesheet">
            </head>
            <body> 
                <form action="/package">
                    <input type="hidden" name="week" value="${selectedWeek - 1}">
                    <input type="hidden" name="year" value="${selectedYear}">
                    <input type="hidden" name="guid" value="${targetPackage.guid}">
                    <input type="submit" value="Previous week">
                </form>
                <h1>Week ${selectedWeekDay.isoWeek() }</h1>
                <form action="/package">
                    <input type="hidden" name="week" value="${selectedWeek + 1}">
                    <input type="hidden" name="year" value="${selectedYear}">
                    <input type="hidden" name="guid" value="${targetPackage.guid}">
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
                            ${rowsHTML}
                        </tbody>
                    </table>
                </div>

                <div id="myModal" class="modal">
                    <div class="modal-content">
                        <span class="close">&times;</span>
                        <h2>Do you want the following time slot?</h2>
                        <p id="selectedTime" class="sTime"> </p>
                        <form action="/package/select_time" method="POST">
                            <input name="guid" type="hidden" value="${targetPackage.guid}">
                            <input id="selected-time-id" type="hidden" value="" name="selectedTimeId">
                            <input type="submit" class="submitbtn" value="Submit" style="font-size:20px;">
                        </form>
                    </div>
                </div>
                <script src="/static/js/timeSlotSelection.js"></script>
            </body>
        </html>`

        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html');
        response.write(page);

        response.end();

}

async function timeBookedPage(request, response, package) {
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
                <p>You have selected a timeslot for this package, here is your package information:</p>
                <p>Booked time period: ${fromISOToDate(bookedTimeSlot.startTime)} from ${fromISOToHHMM(bookedTimeSlot.startTime)} to ${fromISOToHHMM(bookedTimeSlot.endTime)} </p>
                <p>Your booking is in queue number ${bookedTimeSlot.queueId}
                <h2>Actions</h2>
                ${package.delivered == 0 ? `
                <p>If you can not come at the booked time, you can cancel and book a new time:</p> 
                <form action="/package/cancel" method="POST">
                    <input type="hidden" value="${package.guid}" name="guid">
                    <input type="submit" value="Cancel the booked time">
                </form>` : ""}
            </body>
        </html>
    `);
    response.end();
}


async function selectTimeSlot(request, response) {
    let postData = parseURLEncoded(await receiveBody(request));
    if (typeof(postData.guid) != "string") {
        invalidParameters(response, "The link was invalid, if you believe this is a mistake, contact the store you ordered your item at");
        return;
    }

    let targetPackage = await dbGet(db, "SELECT * FROM package WHERE guid=?", [postData.guid]);
    if (targetPackage == null) {
        invalidParameters(response, "The link was invalid, if you believe this is a mistake, contact the store you ordered your item at");
        return;
    }
    
    if (targetPackage.delivered || targetPackage.bookedTimeSlot != null) {
        invalidParameters(response, "You already booked a time slot", `/package?guid=${postData.guid}`, "package status");
        return;
    }

    if (!isStringInt(postData.selectedTimeId)) {
        invalidParameters(response, "The selected time id was invalid or got taken before you, try again", `/package?guid=${postData.guid}`, "timeslot selector");
        return;
    }

    let parsedSelectedTimeId = Number(postData.selectedTimeId);

    let now = moment();

    let timeSlotDetails = await dbGet(db, `select 
    t.id as tid, COUNT(p.id) as bookCount, q."size" as maxSize, t.startTime as startTime, t.endTime as endTime, q.latitude as qlatitude, q.longitude as qlongitude, q.id as qid
    from timeSlot t
    left outer join package p on t.id = p.bookedTimeId
    left outer join queue q on t.queueId = q.id
    where t.id = ? AND t.storeId = ? AND t.endTime > datetime(?)`, [parsedSelectedTimeId, targetPackage.storeId, now.format("YYYY-MM-DDTHH:mm:ss")]);
    
    if (timeSlotDetails == null || timeSlotDetails.bookCount >= timeSlotDetails.maxSize) {
        invalidParameters(response, "The selected time id was invalid or got taken before you, try again", `/package?guid=${postData.guid}`, "timeslot selector");
        return;
    }

    await dbRun(db, `update package set bookedTimeId=? where id=?`, [timeSlotDetails.tid, targetPackage.id]);

    await sendPickupDocumentation(targetPackage, timeSlotDetails)

    response.statusCode = 302;
    response.setHeader('Location', `/package?guid=${targetPackage.guid}`);
    response.end();
}

async function cancelTimeSlot(request, response) {
    let postData = parseURLEncoded(await receiveBody(request));
    if (typeof(postData.guid) != "string") {
        invalidParameters(response, "The link was invalid, if you believe this is a mistake, contact the store you ordered your item at");
        return;
    }

    let targetPackage = await dbGet(db, "SELECT * FROM package WHERE guid=?", [postData.guid]);
    if (targetPackage == null) {
        invalidParameters(response, "The link was invalid, if you believe this is a mistake, contact the store you ordered your item at");
        return;
    }
    
    if (targetPackage.delivered == 1) {
        invalidParameters(response, "This package was already delivered", `/package?guid=${postData.guid}`, "package status");
        return;
    }

    await dbRun(db, "update package set bookedTimeId=NULL where id = ?", [targetPackage.id]);

    response.statusCode = 302;
    response.setHeader('Location', `/package?guid=${targetPackage.guid}`);
    response.end();
}

async function sendPickupDocumentation(package, timeSlotDetails) {
    let qrCode = await QRCode.toDataURL(package.verificationCode);

    let mapLink = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(timeSlotDetails.qlatitude)}&mlon=${encodeURIComponent(timeSlotDetails.qlongitude)}`;

    sendEmail(package.customerEmail, package.customerName ?? package.customerEmail, "Click&Collect pickup documentation", 
    `Hello ${package.customerName}
You have selected the following timeslot:
${fromISOToDate(timeSlotDetails.startTime)} from ${fromISOToHHMM(timeSlotDetails.startTime)} to ${fromISOToHHMM(timeSlotDetails.endTime)}
You have been put in queue ${timeSlotDetails.qid}.
The queue location can be seen using this link ${mapLink}.
Please use the following code to verify your identity at the pickup point:
${package.verificationCode}
`, `
        <!DOCTYPE html>
        <html>
            <head>
                <title>Test Email Sample</title>
                <meta http–equiv=“Content-Type” content=“text/html; charset=UTF-8” />
                <meta http–equiv=“X-UA-Compatible” content=“IE=edge” />
                <meta name=“viewport” content=“width=device-width, initial-scale=1.0 “ />
            </head>
            <body>
                <h1>Hello ${package.customerName ?? ""}</h1>
                <p>You have selected the following time slot:</p>
                <p>${fromISOToDate(timeSlotDetails.startTime)} from ${fromISOToHHMM(timeSlotDetails.startTime)} to ${fromISOToHHMM(timeSlotDetails.endTime)}</p>
                <p>You have been put in queue ${timeSlotDetails.qid} </p>
                <p>
                    The queue location can be seen 
                    <a href="${mapLink}">here</a>
                </p>
                <h2>Show the following qr code to the employee when you go to the pickup location</h2>
                <img src="${qrCode}" style="display: block;max-width: 100vh;height: auto;max-height: 100vh;width: 100%;"/>
                <p>If the image is not visible you can try to enable image displaying in your email client or use the following code instead of the qr code at the pickup location:</p>
                <code>${package.verificationCode}</code>
            </body>
        </html>
    `)
}

/* Helping function to the function getTime*/
function format_date_as_time(date) {
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}


main();