const http = require("http");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises");
const crypto = require("crypto");
const cookie = require('cookie');


const port = 8000;
const hostname = '127.0.0.1';

let db;

async function requestHandler(request, response) {
    console.log("Received " + request.method + " " + request.url);
    
    cookieMiddleware(request, response);
    await userMiddleware(request, response);


    switch(request.method) {
        case "POST": {
            switch(request.url) {
                default:
                    defaultResponse(response);
                    break;
                case "/login":
                    login_post(request, response);
                    break;
                case "/admin/employees/add":
                    add_employee_post(request, response);
                    break;
                case "/admin/employees/remove":
                    remove_employee_post(request,response);
                break;

            }
            break;
        }
        case "GET": {
            switch(request.url) {
                case "/api/add_package":
                    add_package();
                    break;
                case "/login":
                    login_get(request, response);
                    break;
                case "/admin":
                    admin_dashboard(request, response);
                    break;
                case "/admin/employees/add":
                    add_employee(request, response, "");
                    break;
                case "/admin/employees/remove":
                    remove_employee(request,response, "");
                break;
                default:
                    defaultResponse(response);
                    break;
            }
            break;
        }
        default:
            defaultResponse(response);
            break;
    }
}


/* Request handler for any endpoint that isn't explicitally handled */
function defaultResponse(response) {
    console.log("Nothing is here (jk)");
    response.setHeader('Content-Type', 'text/plain');
    response.write(' ');
    response.end("\n");
    response.statusCode = 404;
}

/* Example of a HTTP request case */
function add_package() {
    console.log('No API');
    response.setHeader('Content-Type', 'text/plain');
    response.write(' ');
    response.end("\n");
    response.statusCode = 404;
}


/* cant contain ( ) < > @ , ; : \ " / [ ] ? = { } per https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie */
const COOKIES_SESSION_ID = "sessid";
/* Seconds until the cookie expires */
const COOKIES_EXPIRE_TIME = 60*60*24; /*24 hours*/
/* This is where all the session data is stored */
let sessionStore = new Map();

function cookieMiddleware(req, res) {
    /* Check if the user has any cookies set in the header */
    if (typeof(req.headers["cookie"]) == "string") {
        let cookies = cookie.parse(req.headers["cookie"]);
        /* Check if the user has the specific cookie where we store session id */
        if (typeof(cookies[COOKIES_SESSION_ID]) == "string") {
            /* Check if that session exists in our session store */
            let store = sessionStore.get(cookies[COOKIES_SESSION_ID]);
            if (store != null) {
                /* Check if the cookie has expired, getTime() returns time in milliseconds*/
                if (new Date().getTime() > store.create_time.getTime() + COOKIES_EXPIRE_TIME * 1000) {
                    sessionStore.delete(cookies[COOKIES_SESSION_ID]);
                } else {
                    req.session = store.data;
                    return;
                }
            }
        }
    }

    /* Client doesnt have a valid session id, so we create one */
    let id = crypto.randomBytes(16).toString(HASHING_HASH_ENCODING);

    if (sessionStore.has(id)) {
        /* session id is already used which has around 1 in 3e+38 chance of happening */
        throw new Error("Super duper unlucky, lets just throw an error");
    }

    /* We add a create time so that we can expire old sessions */
    sessionStore.set(id, {create_time: new Date(), data: {}});

    req.session = sessionStore.get(id).data;

    /* Set the session cookie */
    res.setHeader("Set-Cookie", `${COOKIES_SESSION_ID}=${id};path=/`);
}

/*
 * Checks if the client is logged in and sets req.user to the user object if so
 * to check if the client is logged in, just check if the user object is null
 */
async function userMiddleware(req, res) {
    req.user = null;
    if (typeof(req.session.user_id) == "number") {
        let user = await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT * FROM user WHERE id=?", [req.session.user_id], (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                })
            });
        });
        req.user = user;
    }
}

async function login_get(request, response, error) {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.write(`
<!DOCTYPE html>
<html>
    <head>
        <title>login</title>
    </head>

    <body>
        ${error ? `<p>${error}</p>` : ""}
        <form action="/login" method="POST">
            <label for="username">Username: </label>
            <input type="text" name="username" placeholder="username" required><br>
            <label for="password">Password: </label>
            <input type="password" name="password" placeholder="password" required><br>
            <input type="submit" value="login">
        </form>
    </body>
</html>
`);
    response.end();
}

const HASHING_ITERATIONS = 100000;
const HASHING_KEYLEN = 64;
const HASHING_ALGO = "sha512";
const HASHING_HASH_ENCODING = "hex";
async function login_post(request, response) {
    /* Read the post body */
    let post_body = await new Promise((resolve, reject) => {
        let body = ''
        request.on('data', function(data) {
          body += data;
        })
        request.on('end', function() {
          resolve(body);
        })
    });
    console.log('Body: ' + post_body);

    let post_parameters = {};

    /* Decode the key value pairs from the url encoding */
    post_body.split("&").map((v) => {
        let split = v.split("=");
        post_parameters[decodeURIComponent(split[0])] = decodeURIComponent(split[1]);
    });

    /* Make sure that we got the right parameters */
    if (!(typeof post_parameters["username"] == "string" && typeof post_parameters["password"] == "string")) {
        response.statusCode = 400;
        response.write("du har glemt at skrive username eller password");
        response.end();
        return;
    }

    /* Find the user if it exists */
    let user = await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.get("SELECT id, password, salt, storeId, superuser FROM user WHERE username=?", [post_parameters["username"]], (err, row) => {
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

    if (user == null) {
        /* Wrong username */
        login_get(request, response, "Wrong username")
        return;
    }

    /* Create a hash from the given password */
    let hashed = await new Promise((resolve, reject) => {
        crypto.pbkdf2(post_parameters["password"], user.salt, HASHING_ITERATIONS, HASHING_KEYLEN, HASHING_ALGO, (err, derivedKey) => {
            if (err) {
                reject(err);
            }
            resolve(derivedKey);
        });
    });
    
    /* Compare the stored password and the given password using function that protects against timing attacks*/
    if (crypto.timingSafeEqual(Buffer.from(user.password, HASHING_HASH_ENCODING), hashed)) {
        response.statusCode=302;
        
        request.session.user_id = user.id;

        if (user.superuser) {
            response.setHeader('Location','/admin');
            response.end();
        } else {
            response.setHeader('Location','/store');
            response.end();
        }
        response.end();

        //TODO: set session state when we have session middleware or something like that
        return;
    } else {
        /* Wrong password */
        login_get(request, response, "Wrong password");
        return;
    }

}


async function main() {
    const server = http.createServer(requestHandler);

    db = new sqlite3.Database(__dirname + "/../databasen.sqlite3");

    let database_creation_command = (await fs.readFile(__dirname + "/database_creation.sql")).toString();
    
    console.log("Configuring database");

    /* Create a promise that should be resolved when the command has been executed */
    await new Promise((resolve, reject) => {
        /* db.serialize makes every command execute in the correct order */
        db.serialize(() => {
            /* db.exec executes all the statements in the given string */
            db.exec(database_creation_command, (err) => {
                if (err) {
                    /* There was an error, call reject */
                    reject(err);
                } else {
                    /* There was no error, call resolve */
                    resolve();
                }
            })
        });
    })

    console.log("Database correctly configured");


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


function admin_dashboard(request, response){
    if (request.user === null || request.user.superuser == 0){
        adminNoAccess(request, response);
    } 
    else {
        response.statusCode = 302;
        response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>Dashboard</title>
        </head>

        <body>
            <a href="/admin/employees/add"> Add new employee </a> <br>
            <a href="/admin/employees/remove"> Remove employee </a>
        </body>
    </html>
    `);
        response.end();
    }

}

function adminNoAccess(request, response){
    response.statusCode = 401;
    response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>You are not logged in</title>
        </head>

        <body>
            You need to be logged in as store admin to access this site.
            <br>
            <a href="/login"> Go to login site</a>
        </body>
    </html>
    `);
    response.end();
}

function add_employee(request, response, error){
    if (request.user === null || request.user.superuser == 0){
        adminNoAccess(request, response);
    }
    else{
        response.statusCode = 200;
        response.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Adding new employee </title>
            </head>
            <body>
                ${error ? `<p>${error}</p>` : ""}
                <a href="/admin"> Go to admin startpage </a> <br>
                <h> Adding new employee to the store <h>
                
                <form action="/admin/employees/add" method="POST">
                <label for="username">Username:      </label>
                <input type="text" name="username" placeholder="username" required><br>

                <label for="name"> Employee name: </label>
                <input type="text" name="employee_name" placeholder="Employee name" required><br> <br>

                <label for="password"> Password:     </label>
                <input type="password" name="password" placeholder="password" id="password" onchange='check_pass();' required> <br>

                <label for="confirm_password"> Confirm password: </label>
                <input type="password" name="confirm_password" placeholder="password" id="confirm_password" onchange='check_pass();' required> <br>

                <p id="matching_passwords" style="color:red" hidden> The passwords do not match </p>
                



                <label for="superuser"> Is the account an admin account: </label>
                <div id="wrapper">
    
                <p>
                <input type="radio" name="superuser" checked>Yes</input>
                </p>
                <p>
                <input type="radio" name="superuser">No</input>
                </p>
                </div>
                <br>
            

                <input type="submit" id="submit" value="Create user" disabled>
            </form>
            <script>
            function check_pass() {
                if (document.getElementById('password').value ==
                        document.getElementById('confirm_password').value) {
                    document.getElementById('submit').disabled = false;
                    document.getElementById('matching_passwords').hidden = true;
                } else {
                    document.getElementById('submit').disabled = true;
                    document.getElementById('matching_passwords').hidden = false;
                    
                }
            }
            </script>
            </body>
        </html>
        `);
        response.end();
    }
    

}
async function add_employee_post(request, response){
    if (request.user === null || request.user.superuser == 0){
        adminNoAccess(request, response);
    }
    else{
        let post_body = await new Promise((resolve, reject) => {
            let body = ''
            request.on('data', function(data) {
              body += data;
            })
            request.on('end', function() {
              resolve(body);
            })
        });
        console.log('Body: ' + post_body);
    
        let post_parameters = {};
    
        /* Decode the key value pairs from the url encoding */
        post_body.split("&").map((v) => {
            let split = v.split("=");
            post_parameters[decodeURIComponent(split[0])] = decodeURIComponent(split[1]);
        });
    
        /*  Dårlig måde aat håndtere fejl*/
        if (!(typeof post_parameters["username"] == "string" && typeof post_parameters["password"] == "string" && typeof post_parameters["employee_name"] == "string")) { 
            response.statusCode = 400;
            response.write("Some of the input is wrong");
            response.end();
            return;
        }
    
        /* Find the user if it exists */
        let username_unique = await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT id FROM user WHERE username=?", [post_parameters["username"]], (err, row) => {
                    if (err) {
                        resolve(null);
                    } else {
                        if (row == undefined) {
                            resolve(true);
                        } else {
                            add_employee(request, response, "Username already exists")
                            resolve(false);
                        }
                    }
                })
            });
        });
    
        let employee_name_unique = await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT id FROM user WHERE name=?", [post_parameters["employee_name"]], (err, row) => {
                    if (err) {
                        resolve(null);
                    } else {
                        if (row == undefined) {
                            resolve(true);
                        } else {
                            add_employee(request, response, "User with employee name already exists");
                            resolve(false);
                            return;
                        }
                    }
                })
            });
        });
        console.log(post_parameters["password"]);
        if (username_unique && employee_name_unique) {
            let salt = crypto.randomBytes(16).toString(HASHING_HASH_ENCODING);
            let hashed = await new Promise((resolve, reject) => {
                crypto.pbkdf2(post_parameters["password"], salt, HASHING_ITERATIONS, HASHING_KEYLEN, HASHING_ALGO, (err, derivedKey) => {
                    if (err) {
                        reject(err);
                    }
                    resolve(derivedKey);
                });
            });
            
            db.run("INSERT INTO user (name, username, superuser, storeid, password, salt) VALUES (?, ?, ?, ?, ?, ?)", [[post_parameters["employee_name"]],[post_parameters["username"]], [post_parameters["superuser"]] == "on" ? true : false, request.user.storeId, hashed.toString(HASHING_HASH_ENCODING), salt]);
            }
            console.log("Bruger indsat i databasen");
            add_employee(request, response, "User succesfully added to database");
    }
}


async function remove_employee(request,response, error){
    if (request.user === null || request.user.superuser == 0){
        adminNoAccess(request, response);
    }
    else{

        let username_list = await new Promise((resolve, reject) => {
            let sql = "SELECT DISTINCT Username username FROM user ORDER BY username";
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
        let html_table = "";
        for (i = 0; i < username_list.length; i++){
            html_table += `<tr> <th> ${username_list[i]} </th> </tr> <br>\n`
        }

        console.log(html_table);

        response.statusCode = 200;

        response.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Removing an employee </title>
            </head>
            <body>
                ${error ? `<p>${error}</p>` : ""}
                <a href="/admin"> Go to admin startpage </a> <br>
                <h> Removing employee from the store <h>
                
                <form action="/admin/employees/remove" method="POST">
                
                <label for="name">Write the username:     </label>
                <input type="text" placeholder="username" name="username" required><br>               

                <input type="submit" value="Delete user" onclick="return confirm('Are you sure?')" />
            </form>
            <b> Here is a table of the current employee accounts: <br> ${html_table} </b>
            </body>
        </html>
        `);
        
        response.end();
        }
}

async function remove_employee_post(request, response){
    if (request.user === null || request.user.superuser == 0){
        adminNoAccess(request, response);
    }
    else{
        let post_body = await new Promise((resolve, reject) => {
            let body = ''
            request.on('data', function(data) {
              body += data;
            })
            request.on('end', function() {
              resolve(body);
            })
        });
        console.log('Body: ' + post_body);
        
        let post_parameters = {};

        post_body.split("&").map((v) => {
            let split = v.split("=");
            post_parameters[decodeURIComponent(split[0])] = decodeURIComponent(split[1]);
        });

        let user = await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT id, password, salt, storeId, superuser FROM user WHERE username=?", [post_parameters["username"]], (err, row) => {
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
            error = "Bruger ikke fundet";
        }
        else{
            error = "Bruger slettet";
        }
        db.run("DELETE FROM user WHERE username=?", [post_parameters["username"]]);
        console.log(user);
        remove_employee(request, response, error);
    }
}

main();