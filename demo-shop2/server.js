const http = require('http');
const fetch = require('node-fetch');
const config = require("../server.config");

const port = 8128;
const hostname = '127.0.0.1';

const server = http.createServer(requestHandler);

function requestHandler(request, response) {
    console.log("Received " + request.method + " " + request.url);

    switch(request.method) {
        case "POST": {
            switch(request.url) {
                case "/formHandler":
                    formHandler(request, response);
                    break;
                default:
                    defaultResponse(response);
                    break;
            }
            break;
        }
        case "GET": {
            switch(request.url) {
                case '/':
                    getCheckout(response);
                    break;
                case '/validation':
                    getValidation(response);
                    break;
                case '/success':
                    getSuccess(response);
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

/* Request handler for the checkout page ('/') */
function getCheckout(response) {
    console.log('Sending check out page...')
    response.setHeader('Content-Type', 'text/html');
    response.write(renderCheckout());
    response.end('\n');
    response.statusCode = 200;
}

/* Returns a HTML string for the checkout page */
function renderCheckout() {
    return `
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Payment</title>

                <style>
                    body {
                        background-color: #d8d8d8;
                        font-family: sans-serif;
                        margin: 0;
                    }
                    #body-wrap {
                        box-shadow: 3px 0px 5px rgba(0, 0, 0, 0.10);
                        padding: 2em;
                        max-width: 420px;
                        margin: 4em auto;
                        background-color: #f9f9f9;
                    }
                    h1, h2 {
                        text-align: center;
                    }
                    form > div {
                        display: flex;
                        flex-wrap: wrap;
                    }
                    form > div > input {
                        flex: 1;
                        padding: 5px;
                        border-radius: 0;
                        border: solid 1px #d8d8d8;
                    }
                    #submitBtn {
                        margin: 1em 0;
                    }
                    #name {
                        padding: 2em;
                        background-color: #D95100;
                    }
                </style>
            </head>
            <body>
                <h1 id="name">Southern Ecommerce</h1>
                <div id="body-wrap">
                    <h1>Order payment</h1>
                    <h2>179,95 DKK</h2>
                    <form action="/formHandler" method="POST">
                        <h3>Contact details</h3>
                        <div>
                            <input type="text" required name="firstName" placeholder="First name">
                            <input type="text" required name="lastName" placeholder="Last name">
                            <input type="text" required name="email" placeholder="Email">
                            <input type="text" placeholder="Phone">
                        </div>

                        <div>
                            <input type="text" placeholder="Address line 1">
                            <input type="text" placeholder="Address line 2">
                            <input type="text" placeholder="Address line 3">
                            <input type="text" placeholder="Postal code">
                        </div>

                        <h3>Billing details</h3>
                        <div>
                            <input type="text" placeholder="Card holder">
                            <input type="text" placeholder="MM/YY">
                            <input type="text" placeholder="Card number">
                            <input type="text" placeholder="CVV">
                        </div>
                        <input id="submitBtn" type="submit">
                    </form>
                </div>
            </body>
        </html>`;
}

/* Request handler for the validation page ('/validation') */
function getValidation(response) {
    response.setHeader('Content-Type', 'text/html');
    response.write(renderValidation());
    response.end('\n');
    response.setStatusCode = 200;

}

/* Returns a HTML string for the validation page */
function renderValidation() {
    return `
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Validation</title>

                <style>
                    body {
                        background-color: #d8d8d8;
                        font-family: sans-serif;
                    }
                    #body-wrap {
                        box-shadow: 3px 0px 5px rgba(0, 0, 0, 0.10);
                        padding: 2em;
                        max-width: 420px;
                        margin: 4em auto;
                        background-color: #f9f9f9;
                    }
                    h1 {
                        display: inline;
                        font-size: 32px;
                    }
                    span {
                        font-size: 32px;
                        animation: blink 1s infinite;
                    }
                    @keyframes blink {
                        50% {
                            margin-left: 0.2em;
                        }
                    }
                </style>

                <script>
                    setTimeout(() => {
                        window.location.href = '/success';
                    }, 3000)
                </script>
            </head>
            <body>
                <div id="body-wrap">
                    <h1>Validating payment</h1>
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                </div>
            </body>
        </html>
    `;
}

/* Request handler for the success page ('/success') */
function getSuccess(response) {
    response.setHeader('Content-Type', 'text/html');
    response.write(renderSuccess());
    response.end("\n");
    response.statusCode = 200;
}

/* Returns a HTML string for the success page */
function renderSuccess() {
    return `
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Success</title>

                <style>
                    body {
                        background-color: #d8d8d8;
                        font-family: sans-serif;
                    }
                    #body-wrap {
                        box-shadow: 3px 0px 5px rgba(0, 0, 0, 0.10);
                        padding: 2em;
                        max-width: 420px;
                        margin: 4em auto;
                        background-color: #f9f9f9;
                    }
                    h1 {
                        color: green;
                    }
                </style>
            </head>
            <body>
                <div id="body-wrap">
                    <h1>Succes!</h1>
                    <h2>IMPORTANT: </h2>
                    <p>Check your email to choose a time slot for pickup</p>
                </div>
            </body>
        </html>
    `;
}

function formHandler(request, response) {
    let body = [];

    request.on('data', data => {
        body.push(data);
    }).on('end', () => {
        let bodyObj = qsToObj(body.toString());
        let random = Math.floor((Math.random()*100));

        apiJs(bodyObj.firstName+' '+bodyObj.lastName, bodyObj.email, `#${random*100}`, "southern-ecommerce-9137582955591253")
    })

    response.statusCode = 302;
    response.setHeader('Location', '/validation');
    response.end();
}

function qsToObj(qs) {
    let pairs = qs.split('&');
    let obj = {};

    pairs.forEach(pair => {
        let keyVal = pair.split('=');
        obj[keyVal[0]] = keyVal[1];
    });

    return obj;
}

function apiJs(customerName, customerEmail, orderId, apiKey) {
    let qs = `customerName=${customerName}&customerEmail=${customerEmail}&orderId=${orderId}&apiKey=${apiKey}`;

    fetch(`${config.base_host_address}/api/add_package`, {
        method: 'POST',
        mode: 'no-cors',
        body: qs
    })
    .then(console.log("Posted new order for: " + customerName))
    .catch(err => console.log(err));
}

/* Starts the server */
server.listen(port, hostname, () => {
    console.log("Server listening on " + hostname + ":" + port);
})