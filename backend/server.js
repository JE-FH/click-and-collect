const http = require("http");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises");
const crypto = require("crypto");

const {is_string_int, is_string_number, receive_body, parseURLEncoded, assertAdminAccess} = require("./helpers");
const {queryMiddleware, sessionMiddleware, createUserMiddleware} = require("./middleware");
const {adminNoAccess, invalidParameters} = require("./generic-responses");
const {db_all, db_get, db_run, db_exec} = require("./db-helpers");


const port = 8000;
const hostname = '127.0.0.1';

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

                case "/admin/queues/remove":
                    queueRemove(request, response);
                    break;
                case "/admin/queues/add":
                    queueAdd(request, response);
                    break;
            }
            break;
        }
        case "GET": {
            switch(request.path) {
                case "/api/add_package":
                    add_package();
                    break;
                case "/": // Når man går direkte ind på "hjemmesiden"   
                case "/login":
                    login_get(request, response);
                    break;
                case "/admin/employees/add":
                    add_employee(request, response, "");
                    break;
                case "/admin/employees/remove":
                    remove_employee(request,response, "");
                break;
                case "/admin/queues":
                    queueList(request, response);
                    break;
                case "/admin":
                    admin_get(request, response);
                    break;
                case "/store":
                    store_get(request, response);
                    break;
                case "/admin/employees":
                    employees_dashboard(request, response);
                    break;
                case "/admin/employees/employee_list":
                    employee_list(request, response);
                    break;
                case "/static/style.css":
                    staticStyleCss(response);
                    break;
                case "/static/queueListScript.js":
                    staticQueueListScriptJS(response);
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

async function staticStyleCss(response) {
    let content = (await fs.readFile(__dirname + "/../frontend/css/style.css")).toString();
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/css");
    response.write(content);
    response.end();
}

async function staticQueueListScriptJS(response) {
    let content = (await fs.readFile(__dirname + "/../frontend/js/queueListScript.js")).toString();
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/javascript");
    response.write(content);
    response.end();
}

/* Request handler for any endpoint that isn't explicitally handled */
function defaultResponse(response) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain');
    response.write("Page not found");
    response.end();
   
}

/* Example of a HTTP request case */
function add_package() {
    console.log('No API');
    response.setHeader('Content-Type', 'text/plain');
    response.write(' ');
    response.end("\n");
    response.statusCode = 404;
}



async function login_get(request, response, error) {
    response.statusCode = error == null ? 200 : 401;
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
        resolve(receive_body(request));
    });

    post_parameters = parseURLEncoded(post_body);

    /* Make sure that we got the right parameters */
    if (!(typeof post_parameters["username"] == "string" && typeof post_parameters["password"] == "string")) {
        login_get(request, response, "You didnt enter username and/or password");
        return;
    }

    /* Find the user if it exists */
    let user = await db_get(db, "SELECT id, password, salt, storeId, superuser FROM user WHERE username=?", post_parameters["username"]);

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
        
        //same same but different
        request.session.user_id = user.id;
        request.session.storeId = user.storeId;
        if (user.superuser == true) { //det gør en forskel af ukendte årsager at sige == true
            response.setHeader('Location','/admin?storeid=' + user.storeId.toString());
            
        } else {
            response.setHeader('Location','/store?storeid=' + user.storeId.toString());
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
async function store_get(request, response){
    if (request.user === null || request.user.storeId != request.query.storeid){
        no_access(request, response);
    }
    else{
        let wantedStoreId = Number(request.query.storeid);
    let store = await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.get("SELECT * FROM store WHERE id=?", [wantedStoreId], (err, row) => {
                if (err) {
                    reject(err)
                } else {
                    if (row == undefined) {
                        reject(`Expected store with id ${wantedStoreId} to exist`);
                    } else {
                        resolve(row);
                    }
                }
            })
        });
    });

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html");
    response.write(`
<!DOCTYPE html>
<html>
    <head>
        <title> Store page for ${store.name}</title>
    </head>
    <body>
        <h1>Hello ${request.user.name} these are your links</h1>
        <ul>
            <li> You can do nothing ;)</li>
        </ul>
    </body>
</html>
`)
    response.end();
    }
    
}
async function admin_get(request, response) {
    let wantedStoreId = assertAdminAccess(request, request.query, response);
    if (wantedStoreId == null) {
        return;
    }

    let store = await db_get(db, "SELECT * FROM store WHERE id=?", [wantedStoreId]);
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
        <h1>Hello ${request.user.name} these are your links</h1>
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

    let store = await db_get(db, "SELECT * FROM store WHERE id=?", [wantedStoreId]);
    if (store == undefined) {
        throw new Error(`Expected store with id ${wantedStoreId} to exist`);
    }

    let queues = await db_all(db, "SELECT * FROM queue WHERE storeId=?", [store.id]);

    let wantedStoreId = Number(request.query.storeid);

    if (request.user.storeId != wantedStoreId) {
        response.statusCode = 401;
        response.write("You dont have access to this store");
        response.end();
        return;
    }

    let store = await new Promise((resolve, reject) => {
        db.get("SELECT * FROM store WHERE id=?", [wantedStoreId], (err, row) => {
            if (err) {
                reject(err)
            } else {
                if (row == undefined) {
                    reject(`Expected store with id ${wantedStoreId} to exist`);
                } else {
                    resolve(row);
                }
            }
        });
    });
    request.session.store_name = store.name;
    let queues = await new Promise((resolve, reject) => {
        db.all("SELECT * FROM queue WHERE storeId=?", [store.id], (err, rows) => {
            if (err) {
                reject(err)
            } else {
                resolve(rows);
            }
        });
    });
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
        <script type="text/javascript" src="/static/queueListScript.js"></script>
    </body>
</html>
`);
    response.end();
}

async function queueRemove(request, response) {
    let post_data = await receive_body(request);
    let post_parameters = parseURLEncoded(post_data);
    
    let wantedStoreId = assertAdminAccess(request, post_parameters, response);
    if (wantedStoreId == null) {
        return;
    }

    if (!is_string_int(post_parameters.queueid)) {
        invalidParameters(response, "queueid malformed", `/admin/queues?storeid=${wantedStoreId}`, "Back to queue list");
        return;
    }
    let wantedQueueId = Number(post_parameters.queueid);

    await db_run(db, "DELETE FROM queue WHERE id=? and storeId=?", [wantedQueueId, wantedStoreId]);

    response.statusCode = 302;
    response.setHeader("Location", "/admin/queues?storeid=" + wantedStoreId.toString());
    response.end();
}

async function queueAdd(request, response) {
    let post_data = await receive_body(request);
    let post_parameters = parseURLEncoded(post_data);

    let wantedStoreId = assertAdminAccess(request, post_parameters, response);
    if (wantedStoreId == null) {
        return;
    }

    if (
        !is_string_int(post_parameters.size) || 
        !is_string_number(post_parameters.latitude) ||
        !is_string_number(post_parameters.longitude)
    ){
        invalidParameters(response, "size, latitude or longitude malformed", `/admin/queues?storeid=${wantedStoreId}`, "Back to queue list");
        return;
    }

    let wantedSize = Number(post_parameters.size);
    let wantedLatitude = Number(post_parameters.latitude);
    let wantedLongitude = Number(post_parameters.longitude);

    db_run(db, "INSERT INTO queue (latitude, longitude, size, storeId) VALUES (?, ?, ?, ?)", [wantedLatitude, wantedLongitude, wantedSize, wantedStoreId]);

    response.statusCode = 302;
    response.setHeader("Location", "/admin/queues?storeid=" + wantedStoreId.toString());
    response.end();
}

async function main() {
    const server = http.createServer(requestHandler);

    db = new sqlite3.Database(__dirname + "/../databasen.sqlite3");
    
    
    let database_creation_command = (await fs.readFile(__dirname + "/database_creation.sql")).toString();
    
    userMiddleware = createUserMiddleware(db);
    
    console.log("Configuring database");

    /* Execute the database creation commands */
    await db_exec(db, database_creation_command);

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
function no_access(request, response){
    response.statusCode = 401;
    response.write(`
    <!DOCTYPE html>
    <html>
        <head>
            <title>You are not logged in</title>
        </head>

        <body>
            You need to be logged in as a store employee to access this site.
            <br>
            <a href="/login"> Go to login site</a>
        </body>
    </html>
    `);
    response.end();
}

function admin_no_access(request, response){
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

function add_employee(request, response){
    if (request.user === null || request.user.superuser == 0 || request.query.storeid != request.user.storeId){
        admin_no_access(request, response);
    }
    else{
        response.statusCode = 200;

        // Måde at vise fejl til brugeren
        request.session.display_error ? error = request.session.last_error : error = "";
        request.session.display_error = false;

        response.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Adding new employee </title>
            </head>
            <body>
                ${error ? `<p>${error}</p>` : ""}
                <a href="/admin?storeid=${request.user.storeId}"> Go to admin startpage </a> <br>
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
                <input type="radio" value="true" name="superuser" checked>Yes</input>
                </p>
                <p>
                <input type="radio" value="false" name="superuser">No</input>
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
        admin_no_access(request, response); 
    }
    
    else{
        let post_body = await new Promise((resolve, reject) => {
            resolve(receive_body(request));
        });
        
        post_parameters = parseURLEncoded(post_body);
        console.log(post_parameters);
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
                            request.session.last_error = "Username already exists";                            
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
                            request.session.last_error = "User with employee name already exists";
                            resolve(false);
                        }
                    }
                })
            });
        });
        if (username_unique && employee_name_unique) {
            request.session.last_error = "User succesfully added to database";
            let salt = crypto.randomBytes(16).toString(HASHING_HASH_ENCODING);
            let hashed = await new Promise((resolve, reject) => {
                crypto.pbkdf2(post_parameters["password"], salt, HASHING_ITERATIONS, HASHING_KEYLEN, HASHING_ALGO, (err, derivedKey) => {
                    if (err) {
                        reject(err);
                    }
                    resolve(derivedKey);
                });
            });
            console.log("Bruger indsat i databasen");
            db.run("INSERT INTO user (name, username, superuser, storeid, password, salt) VALUES (?, ?, ?, ?, ?, ?)", [[post_parameters["employee_name"]],[post_parameters["username"]], [post_parameters["superuser"]], request.user.storeId, hashed.toString(HASHING_HASH_ENCODING), salt]);
            }
            

            request.session.display_error = true;
            response.statusCode = 302;
            response.setHeader('Location','/admin/employees/add?storeid=' + request.session.storeId);
            response.end()
    }
}


async function remove_employee(request,response, error){
    if (request.user === null || request.user.superuser == 0 || request.query.storeid != request.user.storeId){
        admin_no_access(request, response);
    }
    else{
        let username_list = await new Promise((resolve, reject) => {
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
        let html_table = "";
        for (i = 0; i < username_list.length; i++){
            html_table += `<tr> <th> ${username_list[i]} </th> </tr> <br>\n`
        }

        // Måde at vise fejl til brugeren
        request.session.display_error ? error = request.session.last_error : error = "";
        request.session.display_error = false;

        response.statusCode = 200;

        response.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Removing an employee </title>
            </head>
            <body>
                ${error ? `<p>${error}</p>` : ""}
                <a href="/admin?storeid=${request.user.storeId}"> Go to admin startpage </a> <br>
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
        admin_no_access(request, response);
    }
    else{
        let post_body = await new Promise((resolve, reject) => {
            resolve(receive_body(request));
        });
        console.log('Body: ' + post_body);
        
        post_parameters = parseURLEncoded(post_body);
       
        let user = await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT id, password, salt, superuser FROM user WHERE username=? AND storeId=?", [post_parameters["username"],request.user.storeId], (err, row) => {
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
            request.session.last_error = "Bruger ikke fundet";
            
        }
        else{
            request.session.last_error = "Bruger slettet";
            db.run("DELETE FROM user WHERE username=? AND storeId=?", [post_parameters["username"], request.user.storeId]);
        }
        

        request.session.display_error = true;
        response.statusCode = 302;
        response.setHeader('Location','/admin/employees/remove?storeid=' + request.session.storeId);
        response.end()
    }
}

function employees_dashboard(request, response){
    if (request.user === null || request.user.superuser == 0 || request.query.storeid != request.user.storeId){
        admin_no_access(request, response);
    }
    else{
        response.write(`<!DOCTYPE html>
        <html>
            <head>
                <title>Store admin for ${request.session.store_name}</title>
            </head>
            <body>
                <h1>Hello ${request.user.name} these are your links</h1>
                <ul>
                    <li><a href="/admin/employees/employee_list?storeid=${request.session.storeId}">View a list of employees</a></li>
                    <li><a href="/admin/employees/remove?storeid=${request.session.storeId}">Remove employees</a></li>
                    <li><a href="/admin/employees/add?storeid=${request.session.storeId}">Add employees</a></li>
                    <li><a href="/admin?storeid=${request.session.storeId}">Back to the homepage</a></li>
                </ul>
            </body>
        </html>
        `)
    response.end();
    }
    
}

/* Hjælpefunktion til at finde username, name, id og superuser til employee list
   clunky med den er funktionel ;)
*/
async function find_x_in_user(find, storeId){
    let x_list = await new Promise((resolve, reject) => {
        let sql = `SELECT ${find} FROM user WHERE storeId=${storeId} ORDER BY id`;
        let a = [0];
        i = 0;
        
        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            }
            rows.forEach((row) => {
                username = row.username;
                user_name = row.name;
                id = row.id
                superuser = row.superuser;
                b = username || user_name || id || superuser;
                a[i] = b;
                i++;
            });
            resolve (a);
        });
    });
    return x_list;
}

async function employee_list(request, response){
    if (request.user === null || request.user.superuser == 0 || request.query.storeid != request.user.storeId){
        admin_no_access(request, response);
    }
    else{
        let username_list = await new Promise((resolve, reject) => {
            resolve(find_x_in_user("username",request.user.storeId));
        });
        let name_list = await new Promise((resolve, reject) => {
            resolve(find_x_in_user("name",request.user.storeId));
        });
        let id_list = await new Promise((resolve, reject) => {
            resolve(find_x_in_user("id",request.user.storeId));
        });
        let superuser_list = await new Promise((resolve, reject) => {
            resolve(find_x_in_user("superuser",request.user.storeId));
        });
        
        let html_table = await new Promise((resolve, reject) => {
        let html_table = `<table style="width=100%" border="1px">
        <tr> <th> Id </th> <th>Username</th> <th> Employee name </th> <th> Is the account a superuser </th>  </tr> <br>\n`;
        for (i = 0; i < username_list.length; i++){
            is_superuser = superuser_list[i] ? "yes" : "no";
            html_table += `<tr> <td style="font-weight:normal" style="text-align:center" style="font-weight:normal"> ${id_list[i]} </td> <td style="font-weight:normal" style="text-align:center"> ${username_list[i]} </td> <td style="font-weight:normal" style="text-align:center"> ${name_list[i]} </td> <td style="font-weight:normal" style="text-align:center"> ${is_superuser}  </td>  </tr> <br>\n`;
        }
        html_table += `</table>`
        resolve(html_table);
        });

        response.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Employee list </title>
            </head>
            <body>
                <a href="/admin?storeid=${request.user.storeId}"> Go to admin startpage </a> <br>
                <h> Employee list <h> <br>
                <b> Here is a table of the current employee accounts: <br> ${html_table} </b>
            </body>
        </html>
        `);
        
        response.end();
    }
}
main();