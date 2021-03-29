const http = require("http");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises");

const port = 8000;
const hostname = '127.0.0.1';

function requestHandler(request, response) {
    console.log("Received " + request.method + " " + request.url);

    switch(request.method) {
        case "POST": {
            switch(request.url) {
                default:
                    defaultResponse(response);
                    break;
                case "/login":
                    login_post(request, response);
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

async function login_get(request, response) {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.write(`
<!DOCTYPE html>
<html>
    <head>
        <title>login</title>
    </head>

    <body>
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

async function login_post(request, response) {
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
    
    console.log(post_parameters);

    if (!(typeof post_parameters["username"] == "string" && typeof post_parameters["password"] == "string")) {
        response.statusCode = 400;
        response.write("du har glemt at skrive username eller password");
        response.end();
        return;
    }

    await new Promise((resolve, reject) => {
        
    });

}


async function main() {
    const server = http.createServer(requestHandler);

    let db = new sqlite3.Database(__dirname + "/../databasen.sqlite3");

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

main();