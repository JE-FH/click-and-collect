const {adminNoAccess, invalidParameters} = require("./generic-responses");

/**
 * Checks if a string can be converted to a whole number safely
 * @param {string} str 
 * @returns {boolean}
 */
exports.is_string_int = function is_string_int(str) {
    let conversion_attempt = Number(str);
    return typeof(str) == "string" && !Number.isNaN(conversion_attempt) && Number.isInteger(conversion_attempt);
}

/**
 * Checks if a string can be converted to a number safely
 * @param {string} str 
 * @returns {boolean}
 */
exports.is_string_number = function is_string_number(str) {
    let conversion_attempt = Number(str);
    return typeof(str) == "string" && !Number.isNaN(conversion_attempt);
}

/**
 * Receives the body of a post request
 * @param {http.ClientRequest} request 
 * @returns {Promise<string>}
 */
exports.receive_body = async function receive_body(request) {
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
    if (request.user == null || request.superuser == 0) {
        adminNoAccess(request, response);
        return null;
    }

    if (!exports.is_string_int(storeIdContainer.storeid)) {
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