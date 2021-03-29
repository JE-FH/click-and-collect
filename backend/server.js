import http from 'http';

const port = 8000;
const hostname = '127.0.0.1';

const server = http.createServer(requestHandler);

function requestHandler(request, response) {
    console.log("Received " + request.method + " " + request.url);

    switch(request.method) {
        case "POST": {
            switch(request.url) {
                case '/checkoutdemo/formhandler':
                    checkoutdemoPost(request, response);
                    break;
                default:
                    defaultResponse(response);
                    break;
            }
            break;
        }
        case "GET": {
            switch(request.url) {
                case "/checkoutdemo":
                    checkoutdemoResponse(request, response);
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
    console.log("Nothing is here");
    response.setHeader('Content-Type', 'text/plain');
    response.write(' ');
    response.end("\n");
    response.statusCode = 404;
}

/* Request handler for /checkoutdemo */
function checkoutdemoResponse(request, response) {
    console.log('Demo...');
    response.setHeader('Content-Type', 'text/html');
    response.write(checkoutHTMLString());
    response.end("\n");
    response.statusCode = 200;
}

/* Request handler for form post on /checkoutdemo */
function checkoutdemoPost(request, response) {
    console.log('Demo...');
    response.setHeader('Content-Type', 'text/plain');
    response.write(' ');
    response.end("\n");
    response.statusCode = 200;
    extractBody(request);
}

function extractBody(request) {
    let body = [];

    request.on('data', data => {
        body.push(data);
    }).on('end', () => {
        console.log(body.toString());
    })
}

<<<<<<< Updated upstream
/* Starts the server */
server.listen(port, hostname, () => {
    console.log("Server listening on " + hostname + ":" + port);
})
=======
function checkoutHTMLString() {
    return `<html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Check out</title>
            
            <style>
                body {
                    background-color: #d8d8d8;
                    font-family: sans-serif;
                }
                #products {
                    height: 280px;
                    overflow-x: scroll;
                }
                .product {
                    background-color: #d2d2d2;
                    padding: 1em 2em;
                    margin: 1em 0;
                }
                .product > div {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                #form-body {
                    box-shadow: 3px 0px 5px rgba(0, 0, 0, 0.10);
                    padding: 2em;
                    max-width: 300px;
                    margin: 4em auto;
                    background-color: #f9f9f9;
                }
                form > input {
                    display: block;
                    margin: 1em 0;
                }
            </style>
        </head>
        <body>
            <div id="form-body">
                <h2>Products</h2>
                <div id="products">
                    <div class="product">
                        <h4>Product 1</h4>
                        <div>
                            <p>Description...</p>
                            <span>89,50 DKK</span>
                        </div>
                    </div>

                    <div class="product">
                        <h4>Product 2</h4>
                        <div>
                            <p>Description...</p>
                            <span>499,95 DKK</span>
                        </div>
                    </div>

                    <div class="product">
                        <h4>Product 3</h4>
                        <div>
                            <p>Description...</p>
                            <span>6,50 DKK</span>
                        </div>
                    </div>
                </div>
                <h3>Total: 595,95 DKK</h3>
                <form action="checkoutdemo/formhandler" method="POST">
                    <legend>Check out</legend>
                    <input name="firstName" type="text" placeholder="First name">
                    <input name="lastName" type="text" placeholder="Last name">
                    <input name="email" type="text" placeholder="Email">
                    <input type="submit">
                </form>
            </div>
        </body>
    </html>`;
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

main();
>>>>>>> Stashed changes
