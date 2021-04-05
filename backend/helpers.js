const nodemailer = require("nodemailer");
const {adminNoAccess, invalidParameters} = require("./generic-responses");
/**
 * Checks if a string can be converted to a whole number safely
 * @param {string} str 
 * @returns {boolean}
 */
exports.isStringInt = function isStringInt(str) {
    let conversionAttempt = Number(str);
    return typeof(str) == "string" && !Number.isNaN(conversionAttempt) && Number.isInteger(conversionAttempt);
}

/**
 * Checks if a string can be converted to a number safely
 * @param {string} str 
 * @returns {boolean}
 */
exports.isStringNumber = function isStringNumber(str) {
    let conversionAttempt = Number(str);
    return typeof(str) == "string" && !Number.isNaN(conversionAttempt);
}

/**
 * Receives the body of a post request
 * @param {http.ClientRequest} request 
 * @returns {Promise<string>}
 */
exports.receiveBody = async function receiveBody(request) {
    return await new Promise((resolve, reject) => {
        let body = ''
        request.on('data', function(data) {
          body += data;
        })
        request.on('end', function() {
          resolve(body);
        })
    });
}

/**
 * Parses a url encoded string
 * @param {string} data 
 * @returns {object}
 */
exports.parseURLEncoded = function parseURLEncoded(data) {
    let rv = {};
    data.split("&").map((v) => {
        let split = v.split("=");
        rv[decodeURIComponent(split[0])] = decodeURIComponent(split[1] ?? "");
    });
    return rv;
}


/**
 * Checks if the user in the request has superuser and access to the requested
 * store specified in the storeid. It also gives the correct error messages
 * if the user doesnt have access
 * @param {http.ClientRequest} request 
 * @param {object} storeIdContainer either request.query or the post data depending on the type of request
 * @param {http.ServerResponse} response 
 * @returns {number | null} the storeid that the user requests
 */
exports.assertAdminAccess = function assertAdminAccess(request, storeIdContainer, response) {
    if (request.user == null || request.user.superuser == 0) {
        adminNoAccess(request, response);
        console.log("Bruger findes ikke eller er ikke admin");
        return null;
    }

    if (!exports.isStringInt(storeIdContainer.storeid)) {
        console.log("Forkert query");
        invalidParameters(response, "storeid malformed")
        return null;
    }

    let wantedStoreId = Number(storeIdContainer.storeid);

    if (request.user.storeId != wantedStoreId) {
        console.log("Brugerkonto og query passer ikke");
        adminNoAccess(request, response);
        return null;
    }
    return wantedStoreId;
}

/**
 * Checks if the user in the request has employee access to the requested
 * store specified in the storeid. It also gives the correct error messages
 * if the user doesnt have access
 * @param {http.ClientRequest} request 
 * @param {object} storeIdContainer either request.query or the post data depending on the type of request
 * @param {http.ServerResponse} response 
 * @returns {number | null} the storeid that the user requests
 */
exports.assertEmployeeAccess = function assertAdminAccess(request, storeIdContainer, response) {
    if (request.user == null) {
        adminNoAccess(request, response);
        return null;
    }

    if (!exports.isStringInt(storeIdContainer.storeid)) {
        invalidParameters(response, "storeid malformed")
        return null;
    }

    let wantedStoreId = Number(storeIdContainer.storeid);

    if (request.user.storeId != wantedStoreId) {
        adminNoAccess(request, response);
        return null;
    }
    return wantedStoreId;
}


const EMAIL_FROM_NAME = "Click and collect Inc.";
let EMAIL_ADDRESS;

let mailTransporter;

exports.setupEmail = async function setupMail() {
    let test_account = await nodemailer.createTestAccount();
    mailTransporter = nodemailer.createTransport({
        host: test_account.smtp.host,
        port: test_account.smtp.port,
        secure: test_account.smtp.secure,
        auth: {
            user: test_account.user,
            pass: test_account.pass
        }
    });
    EMAIL_ADDRESS = test_account.user;
    console.log(`Fake email was setup, email is: ${EMAIL_ADDRESS}`);
}

/**
 * 
 * @param {string} recipientMail the email address the mail should be send to
 * @param {string} recipientName the name the email should be addressed to
 * @param {string} subjectLine the subject
 * @param {string} textContent the text representation of the mail
 * @param {string | null} htmlContent the html representation of the mail, if not set, only the text representation will be send
 */
exports.sendEmail = async function sendMail(recipientMail, recipientName, subjectLine, textContent, htmlContent) {
    if (mailTransporter == null) {
        throw new Error("setupMail was not called");
    }

    let message = {
        from: `${EMAIL_FROM_NAME} <${EMAIL_ADDRESS}>`,
        to: `${recipientName} <${recipientMail}>`,
        subject: subjectLine,
        text: textContent
    }
    if (htmlContent != null) {
        message["html"] = htmlContent;
    }

    let info = await mailTransporter.sendMail(message);

    console.log(`Fake mail was sent, preview can be seen here: ${nodemailer.getTestMessageUrl(info)}`);
}
