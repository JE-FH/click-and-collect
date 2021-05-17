const http = require("http");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises");
const crypto = require("crypto");
const moment = require("moment");
const {toISODateTimeString, formatMomentAsISO, isStringInt, isStringNumber, receiveBody, parseURLEncoded, assertAdminAccess, assertEmployeeAccess, setupEmail, sendEmail, sanitizeFullName, sanitizeEmailAddress, fromISOToDate, fromISOToHHMM, deleteTimeslotsWithId, readyStateToReadableString, ReadyState, ErrorType} = require("./helpers");
const {queryMiddleware, sessionMiddleware, createUserMiddleware} = require("./middleware");
const {adminNoAccess, invalidParameters, invalidCustomerParameters} = require("./generic-responses");
const {dbAll, dbGet, dbRun, dbExec} = require("./db-helpers");
const {renderAdmin, renderQueueList, renderMissedTimeSlot, renderPackageForm, manageEmployees, employeeListPage, addEmployeePage, renderStoreMenu, renderPackageList, renderSettings, renderStoreScan, renderPackageOverview, render404, renderLogin, render500, renderEditEmployee, renderTimeSlots, renderTimeSlotStatus, renderUnpackedPackages, renderOrderProcessingMail} = require("./render-functions");
const QRCode = require("qrcode");
const {RequestHandler} = require("./request-handler");
const { createTimeSlots } = require("./timeslot-creator");
const config = require(__dirname + "/../server.config.js");

let db;

async function sendReminders() {
    let unbookedPackages = await getUnbookedPackages();
    for (let package of unbookedPackages) {
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
    
    let lateTime = moment().subtract(15, "minute");
    
    let latePackages = await dbAll(db, "SELECT p.*, s.name as storeName FROM package p LEFT JOIN timeSlot t ON t.id = p.bookedTimeId LEFT JOIN store s ON s.id = p.storeId WHERE t.endTime < ? AND p.readyState=?", [formatMomentAsISO(lateTime), ReadyState.NotDelivered]);
    if (latePackages.length > 0){
        await dbRun(db, `UPDATE package SET bookedTimeId=NULL WHERE id IN (${(new Array(latePackages.length)).fill("?").join(",")})`, latePackages.map((p) => p.id));
        await Promise.all(latePackages.map(async (package) => {
            console.log(`Package with id: ${package.id} was not picked up at timeslot id: ${package.bookedTimeId}.`);
            store = await storeIdToStore(package.storeId);
            let link = `${config.base_host_address}/package?guid=${package.guid}`;
            await sendEmail(
                package.customerEmail, package.customerName, 
                `${package.storeName}: You have missed the pickup time for your package!`, 
                `Hello ${package.customerName},` +
                `\nYou have missed the time slot you chose for picking up your package.\r\n` +
                "Please go to this link and pick another time to pick up your package\r\n" +
                `${link}`,
                renderMissedTimeSlot(store, package, link)
            );
        }));
    }
    
}

/* Sends a reminder to the customer associated with the package if it is more than 3 days old and isn't booked for pickup yet */
async function sendReminder(package) {
    const msPerDay = 86400000;
    const days = 3;

    let now = new Date().getTime();
    let then = new Date(package.creationDate).getTime();
    let creationDelta = now - then;
    
    if(creationDelta >= msPerDay*days) {
        let store = await storeIdToStore(package.storeId);
        console.log(`Sending reminder to: ` + package.customerEmail + ` (${Math.floor(creationDelta / msPerDay)} days has passed)`);
        await sendEmail(package.customerEmail, package.customerName, "Reminder: no time slot booked", `Hello ${package.customerName},
    you have not yet chosen a time slot for your package from ${store.name} with the id: ${package.id}.
    You can use the following link to choose a time slot: ${config.base_host_address}/package?guid=${package.guid}`, await reminderHTML(package));
        /* Increment package.remindersSent in database */
        await dbRun(db, "UPDATE package SET remindersSent=1 WHERE id=?", [package.id]);
    } else {
        return;
    }
}

/* Sends a reminder to the store owner associated with the package if it is more than 14 days old and isn't booked for pickup yet */
async function remindStoreOwner(package) {
    const msPerDay = 86400000;
    const days = 14;

    let now = new Date().getTime();
    let then = new Date(package.creationDate).getTime();
    
    let creationDelta = now - then;    

    if(creationDelta >= msPerDay*days) {
        let store = await storeIdToStore(package.storeId);
        console.log('Sending reminder to store owner: ' + store.storeEmail + ` (${Math.floor(creationDelta / msPerDay)} days has passed - order: ` + package.externalOrderId + ')');
        await sendEmail(store.storeEmail, store.name, "Reminder: no time slot booked", `Hello ${store.name},
The order with the following id: ${package.externalOrderId} had their package ready to collect since ${fromISOToDate(package.creationDate)} but has still not chosen a time slot.
Here is the order and customer information:
Customer name: ${package.customerName}
Customer email: ${package.customerEmail}
We will not contact you regarding this order again.`, await reminderStoreHTML(package));
        /* Increment package.remindersSent in database */
        await dbRun(db, "UPDATE package SET remindersSent=2 WHERE id=?", [package.id]);
    } else {
        return;
    }
}

async function reminderStoreHTML(package) {
    let store = await storeIdToStore(package.storeId);
    return `
        <html>
            <head>
                <meta charset="UTF-8">
            </head>
            <body>
                <h1>Unbooked time slot</h1>
                <p> Hello ${store.name},</p>
                <p>The order with the following id: ${package.externalOrderId} had their package ready to collect since ${fromISOToDate(package.creationDate)} but has still not chosen a time slot.</p>
                <p>Here is the customer's information:</p>
                <p>Customer name: ${package.customerName}</p>
                <p> Customer email: ${package.customerEmail} </p>
                <p> We will not contact you regarding this order again. </p>
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
                <p>Hello ${package.customerName}, you still have not picked a time slot for picking up your order from ${store.name}.</p>
                <p>Follow this link to book a time slot:</p>
                <a target="_blank" href="${config.base_host_address}/package?guid=${package.guid}">${config.base_host_address}/package?guid=${package.guid}</a>
            </body>
        </html>
    `
}

async function getUnbookedPackages() {
    let packages = await dbAll(db, "SELECT * FROM package WHERE bookedTimeId IS NULL", []);
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
            await addPackage(store.id, body.customerEmail, body.customerName, body.orderId);
            response.statusCode = 200;
            response.end();
        }
        else{
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
    let store = await dbGet(db, "SELECT * FROM store WHERE apiKey=?", [apiKey]);
    return store;
}

/* Returns the associated store from a given store id */
async function storeIdToStore(storeId) {
    let store = await dbGet(db, "SELECT * FROM store WHERE id=?", [storeId]);
    return store;
}

/* Returns true if the API POST body is valid. Further checks could be added. */
function isApiPostValid(body) {
    if(body == null) {
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

    await addPackage(request.user.storeId, body.customerEmail, body.customerName, body.externalOrderId);
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
    let query = 'INSERT INTO package (guid, storeId, bookedTimeId, verificationCode, customerEmail, customerName, externalOrderId, creationDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';

    await dbRun(db, query, [guid, storeId, bookedTimeId, verificationCode, customerEmail, customerName, externalOrderId, creationDate.format("YYYY-MM-DDTHH:mm:ss")]);

    let store = await storeIdToStore(storeId);

    await sendEmail(
        customerEmail, customerName, 
        `${store.name}: Order for your package has been received`, 
        `You have ordered a package from ${store.name} and it is currently being processed and packed\r\n` + 
        "you will recieve an email when the order is packed and then you will be able to select a timeslot",
        renderOrderProcessingMail(store, {customerName: customerName}, creationDate)
    );
}

function generateVerification() {
    const length = 8;
    let result = [];
    let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    for(let i = 0; i < length; i++) {
        result.push(chars[crypto.randomInt(0, chars.length)]);
    }

    return result.join('');
}

/* Email template for reminders */
async function renderMailTemplate(name, store, guid, timestamp) {
    return `
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <title>Choose pickup</title>
            </head>
            <body>
                <h1>Package is ready</h1>
                <p>Hello ${name}. You have ordered items from ${store.name}.</p>
                <p>The package has now been processed and packed.
                Now you have to select a timeslot where you can pick up the package<p>
                <h2>Your unique link:</h2>
                <a target="_blank" href="${config.base_host_address}/package?guid=${guid}">${config.base_host_address}/package?guid=${guid}</a>
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

async function loginGet(request, response) {
    let error = request.session.status;
    response.statusCode = error == null ? 200 : 401;
    response.setHeader('Content-Type', 'text/html');
    response.write(renderLogin(request));
    request.session.status = null;
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
        request.session.status = {
            type: ErrorType.Error,
            text: "You didn't enter username and/or password"
        };
        response.setHeader('Location', '/login');
        response.statusCode = 302;
        response.end();
        return;
    }
    postParameters["username"] = postParameters["username"].toLowerCase();
    /* Find the user if it exists */
    let user = await dbGet(db, "SELECT id, password, salt, storeId, superuser FROM user WHERE username=?", postParameters["username"]);

    if (user == null) {
        /* Wrong username */
        request.session.status = {
            type: ErrorType.Error,
            text: "Wrong username"
        };
        request.session.username = postParameters["username"];
        response.setHeader('Location', '/login');
        response.statusCode = 302;
        response.end();
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

        if (user.superuser == 1) { 
            response.setHeader('Location','/admin?storeid=' + user.storeId.toString());
            
        } else {
            response.setHeader('Location','/store?storeid=' + user.storeId.toString());
        }
        response.end();
    } else {
        /* Wrong password */
        request.session.status = {
            type: ErrorType.Error,
            text: "Wrong password"
        };
        request.session.username = postParameters["username"];
        response.setHeader('Location', '/login');
        response.statusCode = 302;
        response.end();
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
    } else {
        let nonDeliveredPackagesWithTime = await dbAll(db,
            `SELECT * FROM package p 
            LEFT JOIN timeSlot t ON t.id = p.bookedTimeId 
            WHERE p.storeId=? AND p.readyState=? AND bookedTimeId is not NULL 
            ORDER BY t.startTime`,
            [wantedStoreId, ReadyState.NotDelivered]
        );
        let nonDeliveredPackagesWithoutTime = await dbAll(db,
            `SELECT * FROM package 
            WHERE storeId=? AND readyState=? AND bookedTimeId is NULL 
            ORDER BY creationDate`, 
            [wantedStoreId, ReadyState.NotDelivered]
        );
        let nonDeliveredPackages = nonDeliveredPackagesWithTime.concat(nonDeliveredPackagesWithoutTime);
        
        // Medtager ikke pakker der blev leveret for mere end en uge siden.
        let deliveredPackagesWithTime = await dbAll(db,
            `SELECT * FROM package p 
            LEFT JOIN timeSlot t ON t.id = p.bookedTimeId 
            WHERE p.storeId=? AND t.endTime >=? AND p.readyState=? AND bookedTimeId is not NULL 
            ORDER BY t.startTime`,
            [wantedStoreId, formatMomentAsISO(moment().subtract(7, 'days')), ReadyState.Delivered]
        );
        let deliveredPackagesWithoutTime = await dbAll(db,
            `SELECT * FROM package 
            WHERE storeId=? AND creationDate >=? AND readyState=? AND bookedTimeId is NULL 
            ORDER BY creationDate`, 
            [wantedStoreId, formatMomentAsISO(moment().subtract(10, 'days')), ReadyState.Delivered]
        );
        let deliveredPackages = deliveredPackagesWithTime.concat(deliveredPackagesWithoutTime);
        
        let nonDeliveredPackageTable = `<div id="nonDeliveredPackages" class="packages">
        <p>Number of undelivered packages: ${nonDeliveredPackages.length}</p>`;
        
        for (i = 0; i < nonDeliveredPackages.length; i++){
           
            let timeSlot = await dbGet(db, "SELECT * FROM timeslot WHERE storeId=? AND id=?", [nonDeliveredPackages[i].storeId,nonDeliveredPackages[i].bookedTimeId]); 

            if (timeSlot != null){
                queueName = await dbGet(db, "SELECT queueName FROM queue WHERE storeId=? AND id=?", [timeSlot.storeId, timeSlot.queueId]);
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

        let deliveredPackageTable = `<div id="deliveredPackages" style="display: none" class="packages">
        <p>Number of delivered packages: ${deliveredPackages.length}</p>`;

        for (i = 0; i < deliveredPackages.length; i++){
            let timeSlot = await dbGet(db, "SELECT * FROM timeslot WHERE storeId=? AND id=?", [deliveredPackages[i].storeId, deliveredPackages[i].bookedTimeId]);
            
            if (timeSlot != null){
                queueName = await dbGet(db, "SELECT queueName FROM queue WHERE storeId=? AND id=?", [timeSlot.storeId, timeSlot.queueId]);
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

async function unpackedPackageList(request, response) {
    let wantedStoreId = assertEmployeeAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }
    
    let unpackaged_packages = await dbAll(db, "SELECT * FROM package WHERE storeId=? AND readyState=?", [wantedStoreId, ReadyState.NotPackedYet]);

    let store = await dbGet(db, "select * from store where id=?", [wantedStoreId]);

    response.statusCode = 200;
    response.write(renderUnpackedPackages(store, unpackaged_packages, request));
    response.end();
}

async function markPackageAsPacked(request, response) {
    let postData = parseURLEncoded(await receiveBody(request));
    let wantedStoreId = assertEmployeeAccess(request, postData, response);
    if (wantedStoreId == null) {
        return;
    }

    if (postData.packageid == null || !isStringInt(postData.packageid)) {
        invalidParameters(response, "packageid was malformed", `/store/unpacked_packages?storeid=${wantedStoreId}`, "unpacked packages list");
        return;
    }

    let packageId = Number(postData.packageid);

    let package = await dbGet(db, "SELECT * FROM package WHERE id=? AND storeId=? LIMIT 1", [packageId, wantedStoreId]);
    if (package == null) {
        invalidParameters(response, "packageid was malformed", `/store/unpacked_packages?storeid=${wantedStoreId}`, "unpacked packages list");
        return;
    }

    let store = await dbGet(db, "SELECT * FROM store WHERE id=? LIMIT 1", [wantedStoreId]);
    if (store == null) {
        throw new Error("storeid should not be null here");
    }
    let now = moment();
    await dbRun(db, "UPDATE package SET readyState=?  WHERE id=? AND storeId=?", [ReadyState.NotDelivered, packageId, wantedStoreId]);
    await dbRun(db, "UPDATE package SET creationDate=? WHERE id=? AND storeId=?", [formatMomentAsISO(now), packageId, wantedStoreId]);
    await sendEmail(
        package.customerEmail, package.customerName, 
        `${store.name}: Choose a pickup time slot`, 
        `Your package is ready to be collected. Choose a time slot at this link: ${config.base_host_address}/package?guid=${package.guid}`, 
        await renderMailTemplate(package.customerName, store, package.guid, package.creationDate)
    );

    response.statusCode = 302;
    response.setHeader("Location", `/store/unpacked_packages?storeid=${wantedStoreId}`);
    response.end();
}

async function packageListPost(request,response){
    let postParameters = await receiveBody(request);
    postParameters = parseURLEncoded(postParameters);

    let wantedStoreId = assertEmployeeAccess(request, postParameters, response);
    if (wantedStoreId == null) {
        return;
    }else{
        let nonDeliveredPackagesWithTime = await dbAll(db, 
            `SELECT * FROM package p 
            LEFT JOIN timeSlot t ON t.id = p.bookedTimeId 
            WHERE p.storeId=? AND p.readyState=? AND customerName like ? AND bookedTimeId is not NULL 
            ORDER BY t.startTime`,
            [wantedStoreId, ReadyState.NotDelivered, '%' + postParameters.customerName + '%']
        );
        let nonDeliveredPackagesWithoutTime = await dbAll(db,
            `SELECT * FROM package 
            WHERE storeId=? AND readyState=? AND bookedTimeId is NULL AND customerName like ? 
            ORDER BY creationDate`, 
            [wantedStoreId, ReadyState.NotDelivered, '%' + postParameters.customerName + '%']
        );
        let nonDeliveredPackages = nonDeliveredPackagesWithTime.concat(nonDeliveredPackagesWithoutTime);

        // Medtager pakker der blev leveret for mere end en uge siden.
        let deliveredPackagesWithTime = await dbAll(db,
            `SELECT * FROM package p 
            LEFT JOIN timeSlot t ON t.id = p.bookedTimeId 
            WHERE p.storeId=? AND p.readyState=? AND customerName like ? AND bookedTimeId is not NULL 
            ORDER BY t.startTime IS NULL, t.startTime`,
            [wantedStoreId, ReadyState.Delivered, '%' + postParameters.customerName + '%']
        );
        let deliveredPackagesWithoutTime = await dbAll(db,
            `SELECT * FROM package 
            WHERE storeId=? AND readyState=? AND bookedTimeId is NULL AND customerName like ? 
            ORDER BY creationDate`, 
            [wantedStoreId, ReadyState.Delivered, '%' + postParameters.customerName + '%']
        );
        let deliveredPackages = deliveredPackagesWithTime.concat(deliveredPackagesWithoutTime);
        
        let nonDeliveredPackageTable = `<div id="nonDeliveredPackages" class="packages">
        <p>Number of undelivered packages: ${nonDeliveredPackages.length}</p>`;
                            
        for (i = 0; i < nonDeliveredPackages.length; i++){
           
            let timeSlot = await dbGet(db, "SELECT * FROM timeslot WHERE storeId=? AND id=?", [nonDeliveredPackages[i].storeId,nonDeliveredPackages[i].bookedTimeId]);
            
            if (timeSlot != null){
                queueName = await dbGet(db, "SELECT queueName FROM queue WHERE storeId=? AND id=?", [timeSlot.storeId, timeSlot.queueId]);
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
            let timeSlot = await dbGet(db, "SELECT * FROM timeslot WHERE storeId=? AND id=?", [deliveredPackages[i].storeId, deliveredPackages[i].bookedTimeId]);
            
            if (timeSlot != null){
                queueName = await dbGet(db, "SELECT queueName FROM queue WHERE storeId=? AND id=?", [timeSlot.storeId, timeSlot.queueId]);
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

        response.write(renderPackageList(store, nonDeliveredPackageTable, deliveredPackageTable, request));
        
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

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.write(renderQueueList(request, store, queues));
    request.session.status = null;
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

    deleteTimeslotsWithId(db, config.base_host_address, wantedQueueId, wantedStoreId)

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
        postParameters.latitude == 0 ||
        postParameters.longitude == 0 ||
        typeof(postParameters.queueName) != "string"
    ){
        //invalidParameters(response, "size, latitude, longitude or name malformed", `/admin/queues?storeid=${wantedStoreId}`, "Back to queue list");
        request.session.status = {
            type: ErrorType.Error,
            text: "Error. Did you enter a queue position?"
        }
        response.statusCode = 302;
        response.setHeader("Location", "/admin/queues?storeid=" + wantedStoreId.toString());
        response.end();
        return;
    }

    let wantedSize = Number(postParameters.size);
    let wantedLatitude = Number(postParameters.latitude);
    let wantedLongitude = Number(postParameters.longitude);
    let wantedName = postParameters.queueName;

    await dbRun(db, "INSERT INTO queue (latitude, longitude, size, storeId, queueName) VALUES (?, ?, ?, ?, ?)", [wantedLatitude, wantedLongitude, wantedSize, wantedStoreId, wantedName]);

    request.session.status = {
        type: ErrorType.Success,
        text: "Succes! Added new queue"
    }
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
    response.write(renderStoreScan(store, request));
    request.session.statusText = null;
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
    response.write(renderPackageOverview(store, package, request));
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

    let package = await dbGet(db, "SELECT * FROM package WHERE id=? AND storeId=? AND readyState!=?", [actual_package_id, wantedStoreId, ReadyState.Delivered]);
    if (package == null) {
        invalidParameters(response, "packageid was not valid", `/store/scan?queryid=${wantedStoreId}`, "package scanner");
        return;
    }

    await dbRun(db, "UPDATE package SET readyState=? WHERE id=? AND storeId=? AND readyState!=?", [ReadyState.Delivered, actual_package_id, wantedStoreId, ReadyState.Delivered]);

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

    let package = await dbGet(db, "SELECT * FROM package WHERE id=? AND storeId=? AND readyState=?", [actual_package_id, wantedStoreId, ReadyState.Delivered]);
    if (package == null) {
        invalidParameters(response, "packageid was not valid", `/store/scan?queryid=${wantedStoreId}`, "package scanner");
        return;
    }

    await dbRun(db, "UPDATE package SET readyState=? WHERE id=? AND storeId=? AND readyState=?", [ReadyState.NotDelivered, actual_package_id, wantedStoreId, ReadyState.Delivered]);

    response.statusCode = 302;
    response.setHeader("Location", `/store/package?storeid=${wantedStoreId.toString()}&validationKey=${package.verificationCode}`);
    response.end();
}

async function sendReminderInterval() {
    try {
        await sendReminders();
    } catch (e) {
        console.log("Send reminders error");
        console.log(e);
    }
}

async function timeSlotCreatorInterval() {
    try {
        await createTimeSlots(db);
    } catch (e) {
        console.log("Error while creating timeslots");
        console.log(e);
    }
}

//if use_this_db is defined then it also implies that we are testing
exports.main = async function main(use_this_db) {
    /*First we check the config file*/
    if (typeof(config.port) != "number" || !Number.isInteger(config.port) || config.port < 1 || config.port > 65353) {
        console.log("Configured port number is invalid, it needs to be an integer between 1-65353");
        return;
    }

    if (typeof(config.hostname) != "string") {
        console.log("Configured hostname needs to be a string");
        return;
    }

    if (typeof(config.base_host_address) != "string") {
        console.log("Configured base_host_address needs to be a string");
        return;
    }


    db = use_this_db ?? (new sqlite3.Database(__dirname + "/../databasen.sqlite3"));

    let databaseCreationCommand = (await fs.readFile(__dirname + "/database_creation.sql")).toString();

    console.log("Configuring database");
    
    /* Execute the database creation commands */
    await dbExec(db, databaseCreationCommand);

    console.log("Database correctly configured");

    await setupEmail();
    
    sendReminderInterval();
    /* Sends reminders to customers who hasn't booked a time slot. Checks every 10 minutes. */
    setInterval(sendReminderInterval, 600000);

    timeSlotCreatorInterval();
    /* Creates timeslots every 10 minutes */
    setInterval(timeSlotCreatorInterval, 1000 * 60 * 10);

    let requestHandler = new RequestHandler(defaultResponse, errorResponse);
    /*If we are running tests, then we dont want this output*/
    if (use_this_db == null) {
        /* Logging middleware */
        requestHandler.addMiddleware((req, _) => {
            console.log(`${req.socket.remoteAddress}\t${moment().format("YYYY-MM-DD HH:mm:ss ZZ")}\t${req.method} ${req.url}`)}
        );
    }

    requestHandler.addMiddleware(sessionMiddleware);
    requestHandler.addMiddleware(createUserMiddleware(db));
    requestHandler.addMiddleware(queryMiddleware);

    requestHandler.addEndpoint("GET", "/", loginGet);
    requestHandler.addEndpoint("GET", "/login", loginGet);
    requestHandler.addEndpoint("GET", "/admin/employees/add", addEmployee);
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
    requestHandler.addEndpoint("GET", "/store/unpacked_packages", unpackedPackageList);
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
    requestHandler.addEndpoint("GET", "/static/js/settingsScript.js", (response) => 
        serveFile(response, __dirname + "/../frontend/js/settingsScript.js", "text/javascript")
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
    requestHandler.addEndpoint("POST", "/store/package/ready_for_delivery", markPackageAsPacked);

    const server = http.createServer((request, response) => requestHandler.handleRequest(request, response));

    /* Starts the server */
    server.listen(config.port, config.hostname, () => {
        console.log("Server listening on " + config.hostname + ":" + config.port);
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

    return requestHandler;
}

async function addEmployee(request, response){
    let wantedStoreId = assertAdminAccess(request, request.query, response);

    if (wantedStoreId == null) {
        return;  
    }

        let store = await storeIdToStore(wantedStoreId);

        response.write(addEmployeePage(store, request));
        response.statusCode = 200;
        request.session.status = null;
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
    postParameters["username"] = postParameters["username"].toLowerCase();
    /* Find the user if it exists */
    let usernameUnique = (await dbGet(db, "SELECT id FROM user WHERE username=?", [postParameters["username"]])) == null;
    
    if (usernameUnique) {
        request.session.status = {
            type: ErrorType.Success,
            text: "User successfully added to database"
        }
        let salt = crypto.randomBytes(16).toString(HASHING_HASH_ENCODING);
        let hashed = await new Promise((resolve, reject) => {
            crypto.pbkdf2(postParameters["password"], salt, HASHING_ITERATIONS, HASHING_KEYLEN, HASHING_ALGO, (err, derivedKey) => {
                if (err) {
                    reject(err);
                }
                resolve(derivedKey);
            });
        });
        dbRun(db, "INSERT INTO user (name, username, superuser, storeid, password, salt) VALUES (?, ?, ?, ?, ?, ?)", [[postParameters["employeeName"]],[postParameters["username"]], [postParameters["superuser"]], request.user.storeId, hashed.toString(HASHING_HASH_ENCODING), salt]);
    } else {
        request.session.status = {
            type: ErrorType.Error,
            text: "Username already exists"
        }
    }

    request.session.displayError = true;
    response.statusCode = 302;
    response.setHeader('Location','/admin/employees/add?storeid=' + wantedStoreId);
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
        response.setHeader('Location','/admin/employees/employee_list?storeid=' + wantedStoreId);
        response.end();
        return;
    }

    let store = await storeIdToStore(wantedStoreId);

    response.statusCode = 200;

    response.write(renderEditEmployee(store, request));
    request.session.status = null;
    response.end();
}

async function editEmployeePost(request, response){
    let postBody = await receiveBody(request);
    
    postParameters = parseURLEncoded(postBody);
    postParameters["superuser"] = Number(postParameters["superuser"]);
    let wantedStoreId = assertAdminAccess(request, postParameters, response);

    if (wantedStoreId == null) {
        return;  
    } if (typeof(postParameters["password"]) != "string" || typeof(postParameters["username"]) != "string"
        || typeof(postParameters["employeeName"]) != "string" || typeof(postParameters["id"]) != "string" || typeof(postParameters["superuser"]) != "number")
        {
        request.session.status = {
            type: ErrorType.Error,
            text: "Some input data was invalid"
        }
        response.statusCode = 302;
        response.setHeader('Location','/admin/employees/employee_list?storeid=' + wantedStoreId);
        response.end();
        return;
    }
    postParameters["username"] = postParameters["username"].toLowerCase();
    /* Find the user if it exists */
    let usernameUnique = 
        (await dbGet(db, "SELECT id FROM user WHERE username=? AND id!=? AND storeId=?", [postParameters["username"], postParameters["id"],wantedStoreId])) == null;

    // Giver true hvis den bruger der bliver edited er den sidste superuser
    let lastAdminCheck = 
        (await dbGet(db, "SELECT id FROM user WHERE superuser=1 AND id!=? AND storeId=?", [postParameters["id"], wantedStoreId])) == null;

    let user = await dbGet(db, "SELECT * FROM user WHERE id=? AND storeId=?", [postParameters["id"], wantedStoreId]); 
    if (user == null) {
        request.session.status = {
            type: ErrorType.Error,
            text: "User you are trying to edit doesn't exist"
        }
        response.statusCode = 302;
        response.setHeader('Location','/admin/employees/employee_list?storeid=' + wantedStoreId);
        response.end();
        return;
    }

    changeInPassword = postParameters["password"] != "password";
    changeInUsername = postParameters["username"].trim() != user.username.trim();
    changeInName = postParameters["employeeName"] != user.name;
    changeInSuperuser = postParameters["superuser"] != user.superuser;

    if (changeInSuperuser || changeInUsername || changeInName || changeInPassword) {
        if (!(lastAdminCheck && changeInSuperuser)){
            if (usernameUnique) {
                if (changeInPassword) {
                    let hashed = await new Promise((resolve, reject) => {
                        crypto.pbkdf2(postParameters["password"], user.salt, HASHING_ITERATIONS, HASHING_KEYLEN, HASHING_ALGO, (err, derivedKey) => {
                            if (err) {
                                reject(err);
                            }
                            resolve(derivedKey);
                        });
                    });
                    await dbRun(db, `update user set password=? where id=? AND storeId=?`, [hashed.toString(HASHING_HASH_ENCODING),user.id, wantedStoreId]);
                }
                if (changeInUsername) {
                    await dbRun(db, `update user set username=? where id=? AND storeId=?`, [postParameters["username"], user.id,wantedStoreId]);
                }
                if (changeInName) {
                    await dbRun(db, `update user set name=? where id=? AND storeId=?`, [postParameters["employeeName"], user.id, wantedStoreId]);
                }
                if (changeInSuperuser) {
                    await dbRun(db, `update user set superuser=? where id=? AND storeId=?`, [postParameters["superuser"], user.id, wantedStoreId]);
                }
                if (changeInUsername || changeInName || changeInPassword || changeInSuperuser){
                    request.session.status = {
                        type: ErrorType.Success,
                        text: "User was edited"
                    }
                } else{
                    request.session.status = {
                        type: ErrorType.Success,
                        text: "No changes were made"
                    }
                }
            } else {
                request.session.status = {
                    type: ErrorType.Error,
                    text: "Username already exists"
                }
            }
        } else{
            request.session.status = {
                type: ErrorType.Error,
                text: "You can not remove the last superuser"
            }
        }
    } else {
        request.session.status = {
            type: ErrorType.Success,
            text: "Nothing was changed"
        }
    }
    response.statusCode = 302;
    response.setHeader('Location','/admin/employees/employee_list?storeid=' + wantedStoreId);
    response.end()
}


async function removeEmployeePost(request, response){
    let postBody = await receiveBody(request);
    postParameters = parseURLEncoded(postBody);
    let wantedStoreId = assertAdminAccess(request, postParameters, response);

    if (wantedStoreId == null) {
        return;  
    }
    postParameters["username"] = postParameters["username"].toLowerCase();
    let user = await dbGet(db, "SELECT * FROM user WHERE username=? AND storeId=?", [postParameters["username"],request.user.storeId]);

    if (user == null){ 
        request.session.status = {
            type: ErrorType.Error,
            text: "User not found"
        }
    } else if (user.username == request.user.username) {
        request.session.status = {
            type: ErrorType.Error,
            text: "You can't delete your own user"
        }
    } else {
        request.session.status = {
            type: ErrorType.Success,
            text: "User deleted"
        }
        await dbRun(db, "DELETE FROM user WHERE username=? AND storeId=?", [postParameters["username"], request.user.storeId]);
    }
    
    response.statusCode = 302;
    response.setHeader('Location','/admin/employees/employee_list?storeid=' + wantedStoreId);
    response.end()
}

async function employeesDashboard(request, response){
    let wantedStoreId = assertAdminAccess(request, request.query, response);

    if (wantedStoreId == null) {
        return;  
    }

    let store = await storeIdToStore(wantedStoreId);
    
    response.write(manageEmployees(store.name, request));
    response.end();
    
}

async function employeeList(request, response){
    let wantedStoreId = assertAdminAccess(request, request.query, response);

    if (wantedStoreId == null) {
        return;  
    }
    let userList = await dbAll(db, "SELECT id, username, name, superuser FROM user WHERE storeId=? ORDER BY id", [wantedStoreId]);

    let store = await storeIdToStore(wantedStoreId);

    response.statusCode = 200;
    response.write(employeeListPage(store, userList, request));
    request.session.status = null;

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

    if (targetPackage.readyState == ReadyState.NotPackedYet) {
        //Skal nok laves om til en bedre error side
        invalidParameters(response, "Your package is not ready to be picked up yet");
        return;
    }

    if (targetPackage.bookedTimeId != null || targetPackage.readyState == ReadyState.Delivered) {
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
    
    if (targetPackage.readyState == ReadyState.Delivered || targetPackage.bookedTimeSlot != null) {
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
    
    if (targetPackage.readyState == ReadyState.Delivered) {
        invalidParameters(response, "This package was already delivered", `/package?guid=${postData.guid}`, "package status");
        return;
    }

    await dbRun(db, "update package set bookedTimeId=NULL where id = ?", [targetPackage.id]);

    response.statusCode = 302;
    response.setHeader('Location', `/package?guid=${targetPackage.guid}`);
    response.end();
}

async function sendPickupDocumentation(package, timeSlotDetails) {
    //let qrCode = await QRCode.toDataURL(package.verificationCode);

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
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(package.verificationCode)}" style="display: block;max-width: 100vh;height: auto;max-height: 100vh;"/>
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

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.write(renderSettings(store, request, DAYS_OF_WEEK, parsedOpeningTime));
    request.session.status = null;
    response.end();
}
//Mangler at tjekke hvornår de begynder
const CLOSED_TIMESLOT_SELECTION = query = `SELECT id, strftime("%w", startTime) as week_day, time(startTime) as sTime, time(endTime) as eTime FROM timeSlot WHERE startTime > ? AND
(${DAYS_OF_WEEK.map((day, i) => {
    return `(week_day == "${i}" AND (sTime < ? OR eTime > ?))`;
}).join(" OR\n")})`;

async function settingsPost(request, response) {
    let postBody = parseURLEncoded(await receiveBody(request));
    let wantedStoreId = assertAdminAccess(request, postBody, response);
    if (wantedStoreId == null) {
        return;
    }

    for (day of DAYS_OF_WEEK) {
        if (postBody[`${day}`] != undefined) {
            if (postBody[`${day}`]){
                openTime = closeTime = postBody[`${day}-open`];
            }
        } else {
            openTime = postBody[`${day}-open`];
            closeTime = postBody[`${day}-close`];
        }

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
        if (postBody[`${day}`] != undefined) {
            if (postBody[`${day}`]){
                open = close = postBody[`${day}-open`];
            }
        } else {
            open = postBody[`${day}-open`];
            close = postBody[`${day}-close`];
        }

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
        let yep = await dbAll(db, CLOSED_TIMESLOT_SELECTION, [toISODateTimeString(now)].concat(DAYS_OF_WEEK.map((day) => {
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
    request.session.status = {
        type: ErrorType.Success,
        text: "New opening time was successfully set"
    }
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
