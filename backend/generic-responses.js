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

exports.employeeNoAccess = function adminNoAccess(request, response){
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
 * @param {string} error_message 
 * @param {string} redirection 
 * @param {string} redirect_text 
 */
exports.invalidParameters = function invalidParameters(response, error_message, redirection, redirect_text){
    response.statusCode = 400;
    response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>Invalid request</title>
        </head>

        <body>
            You submitted an invalid request, ${error_message}
            <br>
            <a href="${redirection}">Go to ${redirect_text}</a>
        </body>
    </html>
    `);
    response.end();
};