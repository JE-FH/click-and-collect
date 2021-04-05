exports.adminNoAccess = function adminNoAccess(request, response){
    response.statusCode = 401;
    response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>You are not logged in</title>
        </head>

        <body>
            You need to be logged in as store admin to access this site or you dont have access to the requested store.
            <br>
            <a href="/login"> Go to login site</a>
        </body>
    </html>
    `);
    response.end();
};

exports.employeeNoAccess = function employeeNoAccess(request, response){
    response.statusCode = 401;
    response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>You are not logged in</title>
        </head>

        <body>
            You need to be logged in as to access this site or you dont have access to the requested store.
            <br>
            <a href="/login"> Go to login page</a>
        </body>
    </html>
    `);
    response.end();
};

/**
 * 
 * @param {http.ServerResponse} response 
 * @param {string} errorMessage 
 * @param {string} redirection 
 * @param {string} redirectText 
 */
exports.invalidParameters = function invalidParameters(response, errorMessage, redirection, redirectText){
    response.statusCode = 400;
    response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>Invalid request</title>
        </head>

        <body>
            You submitted an invalid request, ${errorMessage}
            <br>
            <a href="${redirection}">Go to ${redirectText}</a>
        </body>
    </html>
    `);
    response.end();
};