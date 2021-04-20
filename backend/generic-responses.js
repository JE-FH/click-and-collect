exports.adminNoAccess = function adminNoAccess(request, response){
    response.statusCode = 401;
    response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>You are not logged in</title>
            <link rel="stylesheet" href="/static/css/style.css">
        </head>

        <body>
            <div class="main-body" style="margin-top: 2em;">
                You need to be logged in as store admin to access this site or you dont have access to the requested store.
                <br>
                <br>
                <a class="knap" href="/login"> Go to login site</a>
            </div>
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
            <link rel="stylesheet" href="/static/css/style.css">
        </head>

        <body>
            <div class="main-body" style="margin-top: 2em;">
                You need to be logged in as to access this site or you dont have access to the requested store.
                <br>
                <br>
                <a class="knap" href="/login"> Go to login page</a>
            </div>
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
            <div class="main-body">
                You submitted an invalid request, ${errorMessage}
                <br>
                <a href="${redirection}">Go to ${redirectText}</a>
            </div>
        </body>
    </html>
    `);
    response.end();
};