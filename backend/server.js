const http = require("http");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises");
const crypto = require("crypto");
const moment = require("moment");
const {toISODateTimeString, isStringInt, isStringNumber, receiveBody, parseURLEncoded, assertAdminAccess, assertEmployeeAccess, setupEmail, sendEmail, sanitizeFullName, sanitizeEmailAddress, formatMomentAsISO, fromISOToDate, fromISOToHHMM, deleteTimeslotsWithId, } = require("./helpers");
const {queryMiddleware, sessionMiddleware, createUserMiddleware} = require("./middleware");
const {adminNoAccess, invalidParameters, invalidCustomerParameters} = require("./generic-responses");
const {dbAll, dbGet, dbRun, dbExec} = require("./db-helpers");
const {renderAdmin, renderQueueList, renderPackageForm, manageEmployees, employeeListPage, addEmployeePage, renderStoreMenu, renderPackageList, renderSettings, renderStoreScan, renderPackageOverview, render404, renderLogin, render500, renderEditEmployee, renderTimeSlots, renderTimeSlotStatus} = require("./render-functions");
const QRCode = require("qrcode");
const {RequestHandler} = require("./request-handler");

const port = 8000;
const hostname = '127.0.0.1';
const HOST = "http://127.0.0.1:8000";

let db;

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
    addPackage(request.user.storeId, body.customerEmail, body.customerName, body.externalOrderId);
    request.session.statusMsg = "Package successfully added";
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

    db.run(query, [guid, storeId, bookedTimeId, verificationCode, sanitizeEmailAddress(customerEmail), sanitizeFullName(customerName), externalOrderId, creationDate.format("YYYY-MM-DDTHH:mm:ss")]);

    console.log('Package added for: ' + customerName);

    let store = await storeIdToStore(storeId);

    await sendEmail(sanitizeEmailAddress(customerEmail), sanitizeFullName(customerName), `${store.name}: Choose a pickup time slot`, `Link: ${HOST}/package?guid=${guid}`, await renderMailTemplate(sanitizeFullName(customerName), store, guid, creationDate));
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
    response.write(renderPackageForm(store, request));
    request.session.statusMsg = false;
    response.end();
}

/* Request handler for any endpoint that isn't explicitally handled */
function defaultResponse(request, response) {
    let userId = null;
    if (request.user != null){
        userId = request.user.storeId;
    }
    
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/html');
    response.write(render404(userId));
    response.end();
}

/* Request handler for when a server error occurs*/
function errorResponse(request, response, err) {
    console.log("Unhandled error occurred");
    console.log(err);
    
    response.statusCode = 500;
    response.setHeader('Content-Type', 'text/html');
    response.write(render500(request));
    response.end();
}

async function loginGet(request, response, error) {
    response.statusCode = error == null ? 200 : 401;
    response.setHeader('Content-Type', 'text/html');
    response.write(renderLogin(error));
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
    } else {
        /* Wrong password */
        loginGet(request, response, "Wrong password");
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

async function packageList(request,response){
    
    let wantedStoreId = assertEmployeeAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }
    else{

        let nonDeliveredPackagesWithTime = await dbAll(db,"SELECT * FROM package p LEFT JOIN timeSlot t ON t.id = p.bookedTimeId WHERE p.storeId=? AND p.delivered=0 and bookedTimeId is not NULL ORDER BY t.startTime IS NULL, t.startTime",[wantedStoreId]);
        let nonDeliveredPackagesWithoutTime = await dbAll(db,"SELECT * FROM package WHERE storeId=? AND delivered=0 AND bookedTimeId is NULL ORDER BY creationDate", [wantedStoreId]);
        let nonDeliveredPackages = nonDeliveredPackagesWithTime.concat(nonDeliveredPackagesWithoutTime);
        
        // Medtager ikke pakker der blev leveret for mere end en uge siden.
        let deliveredPackagesWithTime = await dbAll(db,"SELECT * FROM package p LEFT JOIN timeSlot t ON t.id = p.bookedTimeId WHERE p.storeId=? AND t.endTime >=? AND p.delivered=1 AND bookedTimeId is not NULL ORDER BY t.startTime IS NULL, t.startTime",[wantedStoreId, formatMomentAsISO(moment().subtract(7, 'days'))]);
        let deliveredPackagesWithoutTime = await dbAll(db,"SELECT * FROM package WHERE storeId=? AND creationDate >=? AND delivered=1 AND bookedTimeId is NULL ORDER BY creationDate", [wantedStoreId, formatMomentAsISO(moment().subtract(10, 'days'))]);
        let deliveredPackages = deliveredPackagesWithTime.concat(deliveredPackagesWithoutTime);
        
        let nonDeliveredPackageTable = `<div id="nonDeliveredPackages" class="packages">
        <p>Number of undelivered packages: ${nonDeliveredPackages.length}</p>`;
        
        //console.log(nonDeliveredPackagesWithoutTime);
        console.log(nonDeliveredPackages);
        for (i = 0; i < nonDeliveredPackages.length; i++){
           
            let timeSlot = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM timeslot WHERE storeId=? AND id=?", [nonDeliveredPackages[i].storeId,nonDeliveredPackages[i].bookedTimeId], (err, row) => {
                    if(err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                });
            })
            
            if (timeSlot != null){
                queueName = await new Promise((resolve, reject) => {
                    db.get("SELECT queueName FROM queue WHERE storeId=? AND id=?", [timeSlot.storeId, timeSlot.queueId], (err, row) => {
                        if(err) {
                            reject(err);
                        } else {
                            resolve(row);
                        }
                    });
                })
            } else{
                queueName = null;
            }
            //console.log(nonDeliveredPackages[i]);
            nonDeliveredPackageTable += `
                        <div class="package${timeSlot == null ? ' noTimeSlot' : ''}">
                            <h2>Order id: ${nonDeliveredPackages[i].externalOrderId}</h2>
                            <h3>Customer info:</h3>
                            <p>Name: ${nonDeliveredPackages[i].customerName}</p>
                            <p>Mail: ${nonDeliveredPackages[i].customerEmail}</p>
                            <h3>Creation date:</h3>
                            <p>${fromISOToDate(nonDeliveredPackages[i].creationDate)} ${fromISOToHHMM(nonDeliveredPackages[i].creationDate)} </p>
                            <h3> Booked time: </h3>
                            <p> ${timeSlot == null ? "No timeslot booked" : `${fromISOToDate(timeSlot.startTime)} from ${fromISOToHHMM(timeSlot.startTime)} to ${fromISOToHHMM(timeSlot.endTime)}`}
                            
                            ${timeSlot == null ? '' : `<h3> Queue: </h3>
                            ${queueName == null ? `` : `<p> Name: ${queueName.queueName} </p>`}
                            <p> Id: ${timeSlot.id}`}
                            <h3>Status:</h3>
                            <p style="color:red"> NOT DELIVERED </p>
                            <a href="/store/package?validationKey=${nonDeliveredPackages[i].verificationCode}&storeid=${nonDeliveredPackages[i].storeId}" class="knap">Actions</a>
                        </div>
        `;
        }
        nonDeliveredPackageTable += `</div>`

        let deliveredPackageTable = `<div id="deliveredPackages" style="display: none" class="packages">
        <p>Number of delivered packages: ${deliveredPackages.length}</p>`;

        for (i = 0; i < deliveredPackages.length; i++){
            let timeSlot = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM timeslot WHERE storeId=? AND id=?", [deliveredPackages[i].storeId, deliveredPackages[i].bookedTimeId], (err, row) => {
                    if(err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                });
            })
            
            if (timeSlot != null){
                queueName = await new Promise((resolve, reject) => {
                    db.get("SELECT queueName FROM queue WHERE storeId=? AND id=?", [timeSlot.storeId, timeSlot.queueId], (err, row) => {
                        if(err) {
                            reject(err);
                        } else {
                            resolve(row);
                        }
                    });
                })
            } else{
                queueName = null;
            }
            deliveredPackageTable += `
                <div class="package">
                    <h2>Order id: ${deliveredPackages[i].externalOrderId}</h2>
                    <h3>Customer info:</h3>
                    <p>Name: ${deliveredPackages[i].customerName}</p>
                    <p>Mail: ${deliveredPackages[i].customerEmail}</p>
                    <h3>Creation date:</h3>
                    <p>${fromISOToDate(deliveredPackages[i].creationDate)} ${fromISOToHHMM(deliveredPackages[i].creationDate)} </p>
                    <h3> Booked time: </h3>
                    <p> ${timeSlot == null ? "No timeslot booked" : `${fromISOToDate(timeSlot.startTime)} from ${fromISOToHHMM(timeSlot.startTime)} to ${fromISOToHHMM(timeSlot.endTime)}`}
                    
                    ${timeSlot == null ? '' : `<h3> Queue: </h3>
                    ${queueName == null ? `` : `<p> Name: ${queueName.queueName} </p>`}
                    <p> Id: ${timeSlot.id}`}
                    <h3>Status:</h3>
                    <p style="color:green"> DELIVERED </p>
                    <a href="/store/package?validationKey=${deliveredPackages[i].verificationCode}&storeid=${deliveredPackages[i].storeId}" class="knap">Actions</a>
                </div>
            `;
        }
        deliveredPackageTable += `</div>`

        let store = await storeIdToStore(request.user.storeId);

        response.statusCode = 200;

        response.write(renderPackageList(store, nonDeliveredPackageTable, deliveredPackageTable));
        
        response.end();
    }
}

async function packageListPost(request,response){
    let postParameters = await receiveBody(request);
    postParameters = parseURLEncoded(postParameters);

    let wantedStoreId = assertAdminAccess(request, postParameters, response);
    if (wantedStoreId == null) {
        return;
    }else{
        let nonDeliveredPackages = await dbAll(db,"SELECT * FROM package p LEFT JOIN timeSlot t ON t.id = p.bookedTimeId WHERE p.storeId=? AND p.delivered=0 AND customerName like ? ORDER BY t.startTime IS NULL, t.startTime",[wantedStoreId, '%' + postParameters.customerName + '%']);
        // Medtager pakker der blev leveret for mere end en uge siden.
        let deliveredPackages = await dbAll(db,"SELECT * FROM package p LEFT JOIN timeSlot t ON t.id = p.bookedTimeId WHERE p.storeId=? AND p.delivered=1 AND customerName like ? ORDER BY t.startTime IS NULL, t.startTime",[wantedStoreId, '%' + postParameters.customerName + '%']);

        
        let nonDeliveredPackageTable = `<div id="nonDeliveredPackages" class="packages">
        <p>Number of undelivered packages: ${nonDeliveredPackages.length}</p>`;
                            
        for (i = 0; i < nonDeliveredPackages.length; i++){
           
            let timeSlot = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM timeslot WHERE storeId=? AND id=?", [nonDeliveredPackages[i].storeId,nonDeliveredPackages[i].bookedTimeId], (err, row) => {
                    if(err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                });
            })
            
            if (timeSlot != null){
                queueName = await new Promise((resolve, reject) => {
                    db.get("SELECT queueName FROM queue WHERE storeId=? AND id=?", [timeSlot.storeId, timeSlot.queueId], (err, row) => {
                        if(err) {
                            reject(err);
                        } else {
                            resolve(row);
                        }
                    });
                })
            } else{
                queueName = null;
            }
            
            nonDeliveredPackageTable += `
                        <div class="package${timeSlot == null ? ' noTimeSlot' : ''}">
                            <h2>Order id: ${nonDeliveredPackages[i].externalOrderId}</h2>
                            <h3>Customer info:</h3>
                            <p>Name: ${nonDeliveredPackages[i].customerName}</p>
                            <p>Mail: ${nonDeliveredPackages[i].customerEmail}</p>
                            <h3>Creation date:</h3>
                            <p>${fromISOToDate(nonDeliveredPackages[i].creationDate)} ${fromISOToHHMM(nonDeliveredPackages[i].creationDate)} </p>
                            <h3> Booked time: </h3>
                            <p> ${timeSlot == null ? "No timeslot booked" : `${fromISOToDate(timeSlot.startTime)} from ${fromISOToHHMM(timeSlot.startTime)} to ${fromISOToHHMM(timeSlot.endTime)}`}
                            
                            ${timeSlot == null ? '' : `<h3> Queue: </h3>
                            ${queueName == null ? `` : `<p> Name: ${queueName.queueName} </p>`}
                            <p> Id: ${timeSlot.id}`}
                            <h3>Status:</h3>
                            <p style="color:red"> NOT DELIVERED </p>
                            <a href="/store/package?validationKey=${nonDeliveredPackages[i].verificationCode}&storeid=${nonDeliveredPackages[i].storeId}" class="knap">Actions</a>
                        </div>
        `;
        }
        nonDeliveredPackageTable += `</div>`

        let deliveredPackageTable = `<div id="deliveredPackages" class="packages">
        <p>Number of delivered packages: ${deliveredPackages.length}</p>`;

        for (i = 0; i < deliveredPackages.length; i++){
            let timeSlot = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM timeslot WHERE storeId=? AND id=?", [deliveredPackages[i].storeId, deliveredPackages[i].bookedTimeId], (err, row) => {
                    if(err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                });
            })
            
            if (timeSlot != null){
                queueName = await new Promise((resolve, reject) => {
                    db.get("SELECT queueName FROM queue WHERE storeId=? AND id=?", [timeSlot.storeId, timeSlot.queueId], (err, row) => {
                        if(err) {
                            reject(err);
                        } else {
                            resolve(row);
                        }
                    });
                })
            } else{
                queueName = null;
            }
            deliveredPackageTable += `
                <div class="package">
                    <h2>Order id: ${deliveredPackages[i].externalOrderId}</h2>
                    <h3>Customer info:</h3>
                    <p>Name: ${deliveredPackages[i].customerName}</p>
                    <p>Mail: ${deliveredPackages[i].customerEmail}</p>
                    <h3>Creation date:</h3>
                    <p>${fromISOToDate(deliveredPackages[i].creationDate)} ${fromISOToHHMM(deliveredPackages[i].creationDate)} </p>
                    <h3> Booked time: </h3>
                    <p> ${timeSlot == null ? "No timeslot booked" : `${fromISOToDate(timeSlot.startTime)} from ${fromISOToHHMM(timeSlot.startTime)} to ${fromISOToHHMM(timeSlot.endTime)}`}
                    
                    ${timeSlot == null ? '' : `<h3> Queue: </h3>
                    ${queueName == null ? `` : `<p> Name: ${queueName.queueName} </p>`}
                    <p> Id: ${timeSlot.id}`}
                    <h3>Status:</h3>
                    <p style="color:green"> DELIVERED </p>
                    <a href="/store/package?validationKey=${deliveredPackages[i].verificationCode}&storeid=${deliveredPackages[i].storeId}" class="knap">Actions</a>
                </div>
            `;
    }
        deliveredPackageTable += `</div>`

        let store = await storeIdToStore(request.user.storeId);

        response.statusCode = 200;

        response.write(renderPackageList(store, nonDeliveredPackageTable, deliveredPackageTable));
        
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

    deleteTimeslotsWithId(db, HOST, wantedQueueId, wantedStoreId)

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
        !isStringNumber(postParameters.longitude) ||
        typeof(postParameters.queueName) != "string"
    ){
        invalidParameters(response, "size, latitude, longitude or name malformed", `/admin/queues?storeid=${wantedStoreId}`, "Back to queue list");
        return;
    }

    let wantedSize = Number(postParameters.size);
    let wantedLatitude = Number(postParameters.latitude);
    let wantedLongitude = Number(postParameters.longitude);
    let wantedName = postParameters.queueName;

    dbRun(db, "INSERT INTO queue (latitude, longitude, size, storeId, queueName) VALUES (?, ?, ?, ?, ?)", [wantedLatitude, wantedLongitude, wantedSize, wantedStoreId, wantedName]);

    response.statusCode = 302;
    response.setHeader("Location", "/admin/queues?storeid=" + wantedStoreId.toString());
    response.end();
}


async function storeScan(request, response) {
    let wantedStoreId = assertEmployeeAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }

    let store = await storeIdToStore(wantedStoreId);
    
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html");
    response.write(renderStoreScan(store));
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

    let store = await storeIdToStore(wantedStoreId);

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html");
    response.write(renderPackageOverview(store, package));
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

    db = new sqlite3.Database(__dirname + "/../databasen.sqlite3");

    let databaseCreationCommand = (await fs.readFile(__dirname + "/database_creation.sql")).toString();

    console.log("Configuring database");
    
    /* Execute the database creation commands */
    await dbExec(db, databaseCreationCommand);

    console.log("Database correctly configured");

    await setupEmail();
    
    /* Sends reminders to customers who hasn't booked a time slot. Checks every 10 minutes. */
    setInterval(async () => {
        await sendReminders();
    }, 600000);

    let requestHandler = new RequestHandler(defaultResponse, errorResponse);

    /* Logging middleware */
    requestHandler.addMiddleware((req, _) => {
        console.log(`${req.socket.remoteAddress}\t${moment().format("YYYY-MM-DD HH:mm:ss ZZ")}\t${req.method} ${req.url}`)}
    );

    requestHandler.addMiddleware(sessionMiddleware);
    requestHandler.addMiddleware(createUserMiddleware(db));
    requestHandler.addMiddleware(queryMiddleware);

    requestHandler.addEndpoint("GET", "/", loginGet);
    requestHandler.addEndpoint("GET", "/login", loginGet);
    requestHandler.addEndpoint("GET", "/admin/employees/add", (req, res) => addEmployee(req, res, ""));
    requestHandler.addEndpoint("GET", "/admin/employees/edit", editEmployee);
    requestHandler.addEndpoint("GET", "/admin/queues", queueList);
    requestHandler.addEndpoint("GET", "/admin", adminGet);
    requestHandler.addEndpoint("GET", "/admin/employees", employeesDashboard);
    requestHandler.addEndpoint("GET", "/admin/employees/employee_list", employeeList);
    requestHandler.addEndpoint("GET", "/admin/package_form", packageFormGet);
    requestHandler.addEndpoint("GET", "/store", storeMenu);
    requestHandler.addEndpoint("GET", "/store/packages", packageList);
    requestHandler.addEndpoint("GET", "/store/package", packageStoreView);
    requestHandler.addEndpoint("GET", "/package", timeSlotSelector);
    requestHandler.addEndpoint("GET", "/store/scan", storeScan);
    requestHandler.addEndpoint("GET", "/admin/settings", openingTime);
    requestHandler.addEndpoint("GET", "/static/css/style.css", (response) => 
        serveFile(response, __dirname + "/../frontend/css/style.css", "text/css")
    );
    requestHandler.addEndpoint("GET", "/static/js/queueListScript.js", (response) => 
        serveFile(response, __dirname + "/../frontend/js/queueListScript.js", "text/javascript")
    );
    requestHandler.addEndpoint("GET", "/static/js/qrScannerScript.js", (response) => 
        serveFile(response, __dirname + "/../frontend/js/qrScannerScript.js", "text/javascript")
    );
    requestHandler.addEndpoint("GET", "/static/js/external/qr-scanner.umd.min.js", (response) => 
        serveFile(response, __dirname + "/../frontend/js/external/qr-scanner.umd.min.js", "text/javascript")
    );
    requestHandler.addEndpoint("GET", "/static/js/external/qr-scanner-worker.min.js", (response) => 
        serveFile(response, __dirname + "/../frontend/js/external/qr-scanner-worker.min.js", "text/javascript")
    );
    requestHandler.addEndpoint("GET", "/static/css/timeSlotSelection.css", (response) => 
        serveFile(response, __dirname + "/../frontend/css/timeSlotSelection.css", "text/css")
    );
    requestHandler.addEndpoint("GET", "/static/js/timeSlotSelection.js", (response) => 
        serveFile(response, __dirname + "/../frontend/js/timeSlotSelection.js", "text/javascript")
    );

    requestHandler.addEndpoint("POST", "/login", loginPost);
    requestHandler.addEndpoint("POST", "/api/add_package", apiPost);
    requestHandler.addEndpoint("POST", "/package_form_handler", packageFormHandler);
    requestHandler.addEndpoint("POST", "/admin/employees/add", addEmployeePost);
    requestHandler.addEndpoint("POST", "/admin/employees/remove", removeEmployeePost);
    requestHandler.addEndpoint("POST", "/admin/employees/edit", editEmployeePost);
    requestHandler.addEndpoint("POST", "/admin/queues/remove", queueRemove);
    requestHandler.addEndpoint("POST", "/store/package/confirm", packageStoreConfirm);
    requestHandler.addEndpoint("POST", "/store/package/undeliver", packageStoreUnconfirm);
    requestHandler.addEndpoint("POST", "/admin/queues/add", queueAdd);
    requestHandler.addEndpoint("POST", "/package/select_time", selectTimeSlot);
    requestHandler.addEndpoint("POST", "/package/cancel", cancelTimeSlot);
    requestHandler.addEndpoint("POST", "/store/packages", packageListPost);
    requestHandler.addEndpoint("POST", "/admin/settings", settingsPost);

    const server = http.createServer((request, response) => requestHandler.handleRequest(request, response));

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

    let store = await storeIdToStore(wantedStoreId);

    response.statusCode = 200;

    // Måde at vise fejl til brugeren
    request.session.displayError ? error = request.session.lastError : error = "";
    request.session.displayError = false;

    response.write(renderEditEmployee(store, request, error));
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
            db.get("SELECT id FROM user WHERE superuser=1 AND id!=? AND storeId=?", [postParameters["id"],wantedStoreId], (err, row) => {
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

        let store = await storeIdToStore(wantedStoreId);

        request.session.displayError ? error = request.session.lastError : error = "";
        request.session.displayError = false;

        response.statusCode = 200;
        response.write(employeeListPage(store, userList, error));
        
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
            startingPoint = startingPoint.year(selectedYear);
        }
    }

    if (typeof(request.query.week) == "string") {
        let parsedWeek = Number(request.query.week);
        if (!Number.isNaN(parsedWeek) && Number.isInteger(parsedWeek) && parsedWeek >= 0) {
            let lowerBound = moment(startingPoint).startOf("year").startOf("isoWeek");
            let upperBound = moment(startingPoint).endOf("year").endOf("isoWeek");
            let proposedDate = moment(startingPoint).year(selectedYear).isoWeek(parsedWeek);
            if (proposedDate.isAfter(upperBound) || proposedDate.isBefore(lowerBound) || parsedWeek == 0) {
                if (proposedDate.isAfter(upperBound)) {
                    response.statusCode = 302;
                    response.setHeader("Location", `/package?guid=${request.query.guid}&week=1&year=${selectedYear+1}`);
                    response.end();
                    return;
                } else {
                    response.statusCode = 302;
                    response.setHeader("Location", `/package?guid=${request.query.guid}&week=${moment().isoWeekYear(selectedYear-1).isoWeeksInYear()}&year=${selectedYear-1}`);
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

        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html');
        response.write(renderTimeSlots(selectedWeek, selectedYear, selectedWeekDay, targetPackage, lower, rowsHTML));

        response.end();

}

async function timeBookedPage(request, response, package) {
    let bookedTimeSlot = null;
    if (package.bookedTimeId != null) {
        bookedTimeSlot = await dbGet(db, "SELECT * FROM timeSlot where id=?", [package.bookedTimeId]);
    }
    let queueName = (await dbGet(db, "SELECT queueName FROM queue WHERE id = ? AND storeId = ?", [bookedTimeSlot.queueId, package.storeId])).queueName;
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.write(renderTimeSlotStatus(package, bookedTimeSlot, queueName));
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
    let queueName = (await dbGet(db, "SELECT queueName FROM queue WHERE id = ? AND storeId = ?", [timeSlotDetails.qid, package.storeId])).queueName;

    sendEmail(package.customerEmail, package.customerName ?? package.customerEmail, "Click&Collect pickup documentation", 
    `Hello ${package.customerName}
You have selected the following timeslot:
${fromISOToDate(timeSlotDetails.startTime)} from ${fromISOToHHMM(timeSlotDetails.startTime)} to ${fromISOToHHMM(timeSlotDetails.endTime)}
You have been put in queue ${queueName}.
The queue location can be seen using this link ${mapLink}.
Please use the following code to verify your identity at the pickup point:
${package.verificationCode}
`, `
        <!DOCTYPE html>
        <html>
            <head>
                <title>Pickup information</title>
                <meta http–equiv=“Content-Type” content=“text/html; charset=UTF-8” />
                <meta http–equiv=“X-UA-Compatible” content=“IE=edge” />
                <meta name=“viewport” content=“width=device-width, initial-scale=1.0 “ />
            </head>
            <body>
                <h1>Hello ${package.customerName ?? ""}</h1>
                <p>You have selected the following time slot:</p>
                <p>${fromISOToDate(timeSlotDetails.startTime)} from ${fromISOToHHMM(timeSlotDetails.startTime)} to ${fromISOToHHMM(timeSlotDetails.endTime)}</p>
                <p>You have been put in queue ${queueName} </p>
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
/*The ordering is important*/
const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

async function openingTime(request, response) {
    let wantedStoreId = assertAdminAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }

    let store = await dbGet(db, "SELECT * FROM store WHERE id=?", [wantedStoreId]);
    if (store == undefined) {
        throw new Error(`Expected store with id ${wantedStoreId} to exist`);
    }

    let parsedOpeningTime = JSON.parse(store.openingTime);

    let hasError = request.session.settingsError == null;

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.write(renderSettings(store, request, DAYS_OF_WEEK, parsedOpeningTime, hasError));
    request.session.settingsError = null;
    response.end();
}
//Mangler at tjekke hvornår de begynder
const CRAZY_QUERY = query = `SELECT id, strftime("%w", startTime) as week_day, time(startTime) as sTime, time(endTime) as eTime FROM timeSlot WHERE startTime > ? AND
(${DAYS_OF_WEEK.map((day, i) => {
    return `(week_day == "${i}" AND (sTime < ? OR eTime > ?))`;
}).join(" OR\n")})`;

async function settingsPost(request, response) {
    let postBody = parseURLEncoded(await receiveBody(request));

    let wantedStoreId = assertAdminAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }

    for (day of DAYS_OF_WEEK) {
        let openTime = postBody[`${day}-open`];
        let closeTime = postBody[`${day}-close`];
        if (!isValidTime(openTime) || !isValidTime(closeTime)) {
            request.session.settingsError = `time range for ${day} was invalid`;
            response.statusCode = 302
            response.setHeader("Location", "/admin/settings?storeid=" + wantedStoreId.toString());
            response.end();
            return;
        }
/*We compare the strings and it returns which character was largest at the mismatch, for the hh:mm:ss format this also show which time is first*/
        if (openTime > closeTime) {
            request.session.settingsError = `time range for ${day} was invalid, closing time has to be after or equal to the opening time`;
            response.statusCode = 302
            response.setHeader("Location", "/admin/settings?storeid=" + wantedStoreId.toString());
            response.end();
            return;
        }
    }

    let store = await dbGet(db, "SELECT * FROM store WHERE id=?", [wantedStoreId]);
    if (store == undefined) {
        throw new Error(`Expected store with id ${wantedStoreId} to exist`);
    }

    let newOpeningTime = {};
    for (day of DAYS_OF_WEEK) {
        let open = postBody[`${day}-open`];
        let close = postBody[`${day}-close`];

        if (open == close) {
            newOpeningTime[day] = [];
        } else {
            newOpeningTime[day] = [open, close];
        }
    }

    let now = moment();

    await dbRun(db, "UPDATE store SET openingTime=? WHERE id=?",[JSON.stringify(newOpeningTime), wantedStoreId]);

    if (postBody["delete-timeslots"] == "on") {
        /*Bruger ikke nogen bruger bestemte variabler så det her er okay*/
        let yep = await dbAll(db, CRAZY_QUERY, [toISODateTimeString(now)].concat(DAYS_OF_WEEK.map((day) => {
            if (newOpeningTime[day].length == 0) {
                return ["24:00:00", "00:00:00"];
            }
            return newOpeningTime[day]
        }).flat()));

        if (yep.length > 0) {
        let ids = yep.map((v) => v.id);
        await dbRun(db, `UPDATE package SET bookedTimeId=null WHERE bookedTimeId in (?${",?".repeat(ids.length - 1)})`, ids);
        await dbRun(db, `DELETE FROM timeSlot WHERE id in (?${",?".repeat(ids.length - 1)})`, ids);
        }
    }

    request.session.settingsError = "New opening time was successfully set";
    response.statusCode = 302
    response.setHeader("Location", "/admin/settings?storeid=" + wantedStoreId.toString());
    response.end();
}

function isValidTime(str) {
    if (typeof(str) != "string") {
        return false;
    }
    let match = str.match(/^([0-9]){2}:([0-9]){2}:([0-9]){2}$/);
    if (match == null) {
        return false;
    }

    if (!isStringInt(match[1]) || !isStringInt(match[2]) || !isStringInt(match[3])) {
        return false;
    }

    let match1 = Number(match[1]);
    let match2 = Number(match[2]);
    let match3 = Number(match[3]);

    if (match1 >= 24 || match1 < 0 || match2 >= 60 || match2 < 0 || match3 >= 60 || match3 < 0) {
        return false;
    }

    return true;
}


main();