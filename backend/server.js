const http = require("http");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises");
const crypto = require("crypto");

const {isStringInt, isStringNumber, receiveBody, parseURLEncoded, assertAdminAccess, assertEmployeeAccess, setupEmail, sendEmail} = require("./helpers");
const {queryMiddleware, sessionMiddleware, createUserMiddleware} = require("./middleware");
const {adminNoAccess, invalidParameters} = require("./generic-responses");
const {dbAll, dbGet, dbRun, dbExec} = require("./db-helpers");
const {renderAdmin, renderQueueList, renderPackageForm, manageEmployees, employeeListPage, employeeListRemPage, addEmployeePage, renderStoreMenu, renderPackageList, renderSettings} = require("./render-functions");


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
                case "/admin/settings":
                    settingsGet(request, response);
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
                case "/static/css/style.css":
                    serveFile(response, __dirname + "/../frontend/css/style.css", "text/css");
                    //staticStyleCss(response);
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
    creationDate = new Date();
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

    db.run(query, [guid, storeId, bookedTimeId, verificationCode, customerEmail, customerName, externalOrderId, creationDate]);

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

async function settingsGet(request, response) {
    let wantedStoreId = assertAdminAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }

    let store = await storeIdToStore(wantedStoreId);
    if (store == undefined) {
        throw new Error(`Expected store with id ${wantedStoreId} to exist`);
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.write(renderSettings(store));
    response.end();
}

async function packageFormGet(request, response) {
    let wantedStoreId = assertAdminAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }

    let store = await storeIdToStore(wantedStoreId);
    if (store == undefined) {
        throw new Error(`Expected store with id ${wantedStoreId} to exist`);
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.write(renderPackageForm(store));
    response.end();
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
        <link rel="stylesheet" href="/static/css/style.css">
        <title>login</title>
        <style>
            .container {
                display: flex;
                align-items: center;
                position: relative;
                margin-bottom: 1em;
            }
            #togglePassword {
                position: absolute;
                right: 10px;
            }
        </style>
    </head>

    <body>
        ${error ? `<p>${error}</p>` : ""}
        <form action="/login" method="POST">
            <label for="username">Username: </label>
            <input type="text" name="username" placeholder="username" required><br>
            <label for="password"> Password:     </label>
                <div class="container">
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
    response.write(renderStoreMenu(store, request));
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

        let store = await storeIdToStore(request.user.storeId);

        response.statusCode = 200;

        response.write(renderPackageList(store, packageTable));
        
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
    response.write(renderAdmin(request, store));
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
    response.write(renderQueueList(store, queues));
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
            <p>verificationCode: ${package.verificationCode}</p>
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

async function addEmployee(request, response){
    let wantedStoreId = assertAdminAccess(request, request.query, response);

    if (wantedStoreId == null) {
        return;  
    }

        response.statusCode = 200;

        // Måde at vise fejl til brugeren
        request.session.displayError ? error = request.session.lastError : error = "";
        request.session.displayError = false;

        let store = await storeIdToStore(wantedStoreId);
        response.write(addEmployeePage(store, error));
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

    let store = await storeIdToStore(wantedStoreId);

    response.write(employeeListRemPage(store, error, htmlTable));
    
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

async function employeesDashboard(request, response){
    let wantedStoreId = assertAdminAccess(request, request.query, response);

    if (wantedStoreId == null) {
        return;  
    }

    let store = await storeIdToStore(wantedStoreId);
    
    response.write(manageEmployees(store, request));
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

        let store = await storeIdToStore(wantedStoreId);

        response.write(employeeListPage(store, htmlTable));
        
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
                <h2>Do you want the following time slot?</h2>
                <p id="selectedTime" class="sTime"> </p>
                <form action="/package/confirm" method="GET">
                    <input type="submit" class="submitbtn" value="Submit" style="font-size:20px;"/>
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

           document.getElementById("selectedTime").innerHTML = x;
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