const moment = require('moment');
const {fromISOToDate, fromISOToHHMM, ReadyState, readyStateToReadableString, ErrorType} = require('./helpers');

function renderNavigation(store) {
    return `
        <nav class="navigation">
            <a href="/admin?storeid=${store.id}" id="home">Admin</a>
            <ul>
                <a href="/admin?storeid=${store.id}" style="flex: 2; width: 16em;"><li>Admin dashboard</li></a>
                <a href="/store?storeid=${store.id}" style="flex: 2; width: 16em;"><li>Employee dashboard</li></a>
                <a href="/admin/queues?storeid=${store.id}"><li>Queues</li></a>
                <a href="/admin/settings?storeid=${store.id}"><li>Settings</li></a>
                <a href="/admin/package_form?storeid=${store.id}"><li>Package</li></a>
                <a href="/admin/employees?storeid=${store.id}"><li>Employees</li></a>
            </ul>
            <div id="hamburger">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </nav> 

        <div id="hamburger-menu">
            <a href="/admin?storeid=${store.id}">Admin dashboard</a>
            <a href="/store?storeid=${store.id}">Employee dashboard</a>
            <a href="/admin/queues?storeid=${store.id}">Queues</a>
            <a href="/admin/settings?storeid=${store.id}">Settings</a>
            <a href="/admin/package_form?storeid=${store.id}">Package</a>
            <a href="/admin/employees?storeid=${store.id}">Employees</a>
        </div>    

        <script>
            let hamburger = document.getElementById("hamburger");
            let hamburgerMenu = document.getElementById("hamburger-menu");

            hamburger.addEventListener("click", () => {
                hamburger.classList.toggle("close");
                hamburgerMenu.classList.toggle("close");
            })
        </script>
    `
}

function renderEmployeeNav(store, request) {
    return `
        <nav class="navigation" id="employeeNav">
            <a href="/store?storeid=${store.id}" id="homeEmployee">Home</a>
            <ul>
                ${request.user.superuser == 1 ? `<a href="/admin?storeid=${store.id}" style="flex: 2; width: 16em;"><li>Admin dashboard</li></a>` : ''}
                <a href="/store?storeid=${store.id}" style="flex: 2; width: 16em;"><li>Employee dashboard</li></a>
                <a href="/store/scan?storeid=${store.id}"><li>Scan</li></a>
                <a href="/store/packages?storeid=${store.id}"><li>Packages</li></a>
                <a href="/store/unpacked_packages?storeid=${store.id}" style="flex: 2"><li>Unpacked packages</li></a>
            </ul>
            <div id="hamburger">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </nav>

        <div id="hamburger-menu">
            ${request.user.superuser == 1 ? `<a href="/admin?storeid=${store.id}">Admin dashboard</a>` : ''}
            <a href="/store?storeid=${store.id}">Employee dashboard</a>
            <a href="/store/scan?storeid=${store.id}">Scan</a>
            <a href="/store/packages?storeid=${store.id}">Packages</a>
            <a href="/store/unpacked_packages?storeid=${store.id}">Unpacked packages</a>
        </div>

        <script>
            let hamburger = document.getElementById("hamburger");
            let hamburgerMenu = document.getElementById("hamburger-menu");

            hamburger.addEventListener("click", () => {
                hamburger.classList.toggle("close");
                hamburgerMenu.classList.toggle("close");
            })
        </script>
    `;
}

function generalHeader() {
    return `
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    `;
}

exports.render404 = function render404(userId) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>404 page not found</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>
                <div class="main-body">
                    <b> Webpage can not be found. <br></b>
                    <a href="/login">Go to login page </a> <br>
                    <a href="/store?storeid=${userId}"> Go to employee dashboard</a> <br>
                    <a href="/admin?storeid=${userId}"> Go to admin dashboard</a> <br>
                </div>
            </body>
        </html>
    `;

    return page;
}

exports.renderAdmin = function renderAdmin(request, store) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <link rel="stylesheet" href="/static/css/style.css">
                <title>Store admin for ${store.name}</title>
            </head>
            <body>`;
    
    page += `${renderNavigation(store)}`;
    page += `
                <div class="main-body">
                    <h1>Admin dashboard</h1>
                    <h2>Welcome, ${request.user.name}</h2>
                    <ul class="dash">
                        <a href="/store?storeid=${store.id}"><li>Employee dashboard</li></a>
                        <a href="/admin/queues?storeid=${store.id}"><li>Manage queues</li></a>
                        <a href="/admin/settings?storeid=${store.id}"><li>Manage opening hours</li></a>
                        <a href="/admin/package_form?storeid=${store.id}"><li>Create package manually</li></a>
                        <a href="/admin/employees?storeid=${store.id}"><li>Manage employees</li></a>
                    </ul>
                </div> 
            </body>
        </html>
    `;
    return page;
}

/* Helper function for renderQueueList */
function renderQueues(queues) {
    let html = '';
    queues.forEach(queue => {
    html += `<div>
                <h3>Latitude/longitude</h3>
                <p>Lat: ${queue.latitude}</p>
                <p>Lon: ${queue.longitude}</p>
                <h3>Size:</h3>
                <p>${queue.size}</p>
                <form action="/admin/queues/remove" method="POST">
                    <input type="hidden" name="storeid" value="${queue.storeId}">
                    <input type="hidden" name="queueid" value="${queue.id}">
                    <input type="submit" value="Remove">
                </form>
            </div>` 
    });
    return html;
}

exports.renderQueueList = function renderQueueList(request, store, queues) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>Queue list for ${store.name}</title>
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/openlayers/openlayers.github.io@master/en/v6.5.0/css/ol.css" type="text/css">
                <script src="https://cdn.jsdelivr.net/gh/openlayers/openlayers.github.io@master/en/v6.5.0/build/ol.js"></script>
                <link rel="stylesheet" href="/static/css/style.css">
                <style>
                    .map {
                        height: 400px;
                        width: 500px;
                    }
                </style>
            </head>
            <body>`;

    page += `${renderNavigation(store)}`;
    page += `
                <div class="main-body">
                    <h1>Queues for ${store.name}</h1>
                    ${request.session.status ? `<p class="${request.session.status.type == 0 ? "error-message" : "success-message"}">${request.session.status.text}</p>` : ""}
                    <div class="queue-list">
                        ${renderQueues(queues)}
                    </div>
                    <h2>Add queue</h2>
                    <form action="/admin/queues/add", method="POST">
                        <div id="queue-placement-map" class="map"></div>
                        <label for="queueName">Name:</label>
                        <input type="text" id="queueName-input" name="queueName">
                        <label for="size">Queue capacity: </label>
                        <input type="number" name="size" required>
                        
                        <input id="latitude-input" type="hidden" name="latitude">
                        <input id="longitude-input" type="hidden" name="longitude">
                        <input type="hidden" name="storeid" value="${store.id}">
                        <input type="submit" value="Add">
                    </form>
                    <script type="text/javascript">
                        var queues = ${JSON.stringify(queues)};
                    </script>
                    <script type="text/javascript" src="/static/js/queueListScript.js"></script>
                </div>
            </body>
        </html>
    `;

    return page;
}

exports.renderPackageForm = function renderPackageForm(store, request) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>Add package</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>`;
    page += `${renderNavigation(store)}`;
    page += `
                <div class="main-body">
                    <h1>Add package</h1>
                    <form action="/package_form_handler?storeid=${store.id}" method="POST">
                        <label for="customerName">Customer name:</label>
                        <input type="text" name="customerName" placeholder="Customer name" required>
                        <label for="customerEmail">Customer email:</label>
                        <input type="email" name="customerEmail" placeholder="Customer email" required>
                        <label for="externalOrderId">Order ID:</label>
                        <input type="text" name="externalOrderId" placeholder="Order ID" required> 
                        <input type="submit">
                    </form>
                    ${request.session.statusMsg ? `<p class="success-message">${request.session.statusMsg}</p>` : ''}
                </div>
            </body>
        </html>
    `;
    return page;
}

exports.manageEmployees = function manageEmployees(store, request) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>Store admin for ${request.session.storeName}</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body> `;
    
    page += `${renderNavigation(store)}`;
    page += `
                <div class="main-body">
                    <h1>Manage employees </h1>
                    <ul class="dash">
                        <a href="/admin/employees/employee_list?storeid=${request.session.storeId}"><li>View employees</li></a>
                        <a href="/admin/employees/add?storeid=${request.session.storeId}"><li>Add employee</li></a>
                    </ul>   
                </div>
            </body>
        </html>
    `;

    return page;
}

/* Helper function for employeeListPage */
function renderListOfEmployees(list, storeId) {
    let html = '';

    list.forEach(employee => {
        html += `
            <div>
                <h2>${employee.name}</h2>
                <p>Username: ${employee.username}</p>
                <p>Superuser: ${employee.superuser == 1 ? "YES" : "NO"}</p>
                <div>
                    <form action="/admin/employees/edit" method="GET">
                        <input type="hidden" value="${employee.id}" name="id">   
                        <input type="hidden" value="${employee.username}" name="username">
                        <input type="hidden" value="${employee.name}" name="name">
                        <input type="hidden" value="${employee.superuser}" name="superuser">     
                        
                        <input type="hidden" value="${storeId}" name="storeid">   
                        <input type="submit" value="Edit">
                    </form>

                    <form action="/admin/employees/remove" method="POST">
                        <input type="hidden" value="${employee.username}" name="username">     
                        <input type="hidden" value="${storeId}" name="storeid">   
                        <input type="submit" value="Remove">
                    </form>
                </div>
            </div>
        `
    });

    return html;
}

exports.employeeListPage = function employeeListPage(store, employeeList, request) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>Employee list </title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>`;
    
    page += `${renderNavigation(store)}`;
    page += `
            <div class="main-body">
                <h1>Employee list</h1>
                ${request.session.status ? `<p class="${request.session.status.type == 0 ? "error-message" : "success-message"}">${request.session.status.text}</p>` : ""}
                <div class="employee-list">
                    ${renderListOfEmployees(employeeList, store.id)}
                </div>
                <a href="/admin/employees?storeid=${store.id}" class="knap">Back</a>
            </div>
            </body>
        </html>
    `;

    return page;
}

exports.addEmployeePage = function addEmployeePage(store, request) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>Adding new employee </title>
                <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.13.0/css/all.min.css">
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>`;

    page += `${renderNavigation(store)}`;
    page += `
                <div class="main-body">
                    <h1>Add new employee</h1>
                    <form action="/admin/employees/add" method="POST">
                        <label for="username">Username:</label>
                        <input type="text" name="username" placeholder="username" required>

                        <label for="name">Employee name:</label>
                        <input type="text" name="employeeName" placeholder="Employee name" required>

                        <label for="password"> Password:</label>
                        <div class="container">
                            <input type="password" name="password" placeholder="password" id="password" onchange='checkPass();' minlength="8" required>
                            <i class="fas fa-eye" id="togglePassword"></i>
                        </div>

                        <label for="confirmPassword"> Confirm password:</label>
                        <div class="container">
                            <input type="password" name="confirmPassword" placeholder="password" id="confirmPassword" onchange='checkPass();' required>
                            <i class="fas fa-eye" id="toggleConfirmPassword"></i>
                        </div>

                        <input type="hidden" value="${store.id}" name="storeid">    
                        <p id="matchingPasswords" style="color:red" hidden>The passwords do not match</p>
                        
                        <label for="superuser"> Is the account an admin account:</label>
                        <input type="radio" value="1" name="superuser" checked>Yes</input>
                        <input type="radio" value="0" name="superuser">No</input>
                    
                        <input type="submit" id="submit" value="Create user" disabled>
                    </form>
                    ${request.session.status ? `<p class="${request.session.status.type == 0 ? "error-message" : "success-message"}">${request.session.status.text}</p>` : ""}
                    <a href="/admin/employees?storeid=${store.id}" class="knap">Back</a>
                </div>
                <script>
                    function checkPass() {
                        if (document.getElementById('password').value ==
                                document.getElementById('confirmPassword').value) {
                            document.getElementById('submit').disabled = false;
                            document.getElementById('matchingPasswords').hidden = true;
                        } else {
                            document.getElementById('submit').disabled = true;
                            document.getElementById('matchingPasswords').hidden = false;
                        }
                    }
                    
                    // Eye toggle for password
                    const togglePassword = document.querySelector('#togglePassword');
                    const password = document.querySelector('#password');

                    togglePassword.addEventListener('click', function (e) {
                        const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
                        password.setAttribute('type', type);
                        this.classList.toggle('fa-eye-slash');
                    });

                    // Eye toggle for confirmPassword
                    const toggleConfirmPassword = document.querySelector('#toggleConfirmPassword');
                    const ConfirmPassword = document.querySelector('#confirmPassword');

                    toggleConfirmPassword.addEventListener('click', function (e) {
                        const type = confirmPassword.getAttribute('type') === 'password' ? 'text' : 'password';
                        confirmPassword.setAttribute('type', type);
                        this.classList.toggle('fa-eye-slash');
                    });
                </script>
            </body>
        </html>
    `;

    return page;
}

exports.renderStoreMenu = function renderStoreMenu(store, request) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>Store menu for ${store.name}</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>

            <body>
                ${renderEmployeeNav(store, request)}
                <div class="main-body">
                    <h1>Employee dashboard</h1>
                    <h2>Welcome, ${request.user.name}</h2>
                    <ul class="dash">
                        ${request.user.superuser == 1 ? `<a href="/admin?storeid=${store.id}"><li>Back to admin page</li></a>` : ""}
                        <a href="/store/packages?storeid=${store.id}"><li>Package overview</li></a>
                        <a href="/store/scan?storeid=${store.id}"><li>Scan package</li></a>
                        <a href="/store/unpacked_packages?storeid=${store.id}"><li>Unpacked packages</li></a>
                    </ul>
                </div>
            </body>
        </html>
    `;

    return page;
}

exports.renderUnpackedPackages = function renderUnpackedPackages(store, unpackedPackages, request) {
    return `
    <!DOCTYPE html>
    <html>
        <head>
            ${generalHeader()}
            <title>Package overview</title>
            <link rel="stylesheet" href="/static/css/style.css">
        </head>
        <body>
            ${renderEmployeeNav(store, request)}
            <div class="main-body">
                <h1>Unpacked packages overview</h1>
                <div class="packages">
                    ${unpackedPackages.map((package) => {
                        return `
                        <div class="package">
                            <h2>Order id: ${package.externalOrderId}</h2>
                            <h3>Customer info:</h3>
                            <p>Name: ${package.customerName}</p>
                            <p>Mail: ${package.customerEmail}</p>
                            <h3>Creation date:</h3>
                            <p>${fromISOToDate(package.creationDate)} ${fromISOToHHMM(package.creationDate)} </p>
                            <h3>Status:</h3>
                            <p style="color:red">Not packed yet</p>
                            <form action="/store/package/ready_for_delivery" method="POST">
                                <input type="hidden" name="packageid" value="${package.id}">
                                <input type="hidden" name="storeid" value="${package.storeId}">
                                <input type="submit" value="Mark as ready for delivery">
                            </form>
                        </div>
                    `}).join("\n")}
                </div>
                <a href="/store?storeid=${store.id}" class="knap">Back</a>
            </div>
        </body>
    </html>
    `;
}

exports.renderPackageList = function renderPackageList(store, nonDeliveredPackageTable, deliveredPackageTable, request) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>Package overview</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>`;

    page += `${renderEmployeeNav(store, request)}`;
    page += `
                <div class="search">
                    <div id="search-body" class="main-body">
                        <form action="/store/packages" method="POST">
                            <label for="customerName"> Search for customer name: </label>
                            <input type="text" name="customerName">
                            <input type="hidden" value="${store.id}" name="storeid">
                            <input type="submit" id="submit" value="Search">
                        </form>
                        <div id="search-buttons">
                            <a class="knap" id="showButton" onclick="toggleShowDelivered()">Show delivered packages</a>
                            <a class="knap" id="toggleTimeslots"onclick="toggleTimeSlotChosen()">Hide packages without an assigned timeslot</a>
                        </div>
                    </div>
                    <div id="toggle-search">&#9660;</div>
                </div>
                <div class="main-body">
                    <h1>Package Overview</h1>
                    ${nonDeliveredPackageTable}
                    ${deliveredPackageTable}
                    <a href="/store?storeid=${store.id}" class="knap">Back</a>
                </div>
            </body>
            <script>
            let showToggle = 1;
            function toggleShowDelivered(){
                table = document.getElementById('deliveredPackages');
                console.log(table);
                
                if (table.style.display === "none"){
                    table.style.display = "initial";
                    console.log(table.style.display);
                } else{
                    table.style.display = "none";    
                }
                console.log(table.style.display);
                button = document.getElementById('showButton');
                if (table.style.display === "none"){
                    button.innerText = "Show delivered packages";
                }
                else{
                    button.innerText = "Hide delivered packages";
                }
            }
            function toggleTimeSlotChosen(){
                table = document.getElementById('nonDeliveredPackages');

                elements = table.getElementsByTagName('div');
                
                button = document.getElementById('toggleTimeslots');

                for (i = 0; i < elements.length; i++){
                    if (elements[i].classList.contains('noTimeSlot')){
                        elements[i].hidden = !elements[i].hidden;
                    }
                }
                if (showToggle == 1){
                    showToggle = 0;
                    button.innerText = "Show packages without an assigned timeslot";
                }else{
                    showToggle = 1;
                    button.innerText = "Hide packages without an assigned timeslot";
                }
            }

            /* Search toggle */
            let searchToggle = document.getElementById('toggle-search');
            let searchBody = document.getElementById('search-body');

            searchToggle.addEventListener('click', () => {
                searchBody.classList.toggle("open");
                searchToggle.classList.toggle("flip");
            })
            </script>
        </html>
    `;

    return page;
}

function capitalizeFirstLetter(str) {
    return str[0].toUpperCase()+str.slice(1);
}

exports.renderSettings = function renderSettings(store, request, DAYS_OF_WEEK, parsedOpeningTime) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>Opening hours for ${store.name}</title>
                <link rel="stylesheet" href="/static/css/style.css">
                <style>
                    .hidden {
                        display: none;
                    }
                </style>
            </head>
            <body>`;
    
            page += `${renderNavigation(store)}`;
            page += `
                <div class="main-body">
                    <h1>Opening hours for ${store.name}</h1>
                    <form method="POST" id="settings-form">
                        <table>
                            <thead>
                                <tr>
                                    <th style="text-align: left">Day</th>
                                    <th>Open time</th>
                                    <th>Closing time</th>
                                    <th> Closed </th>
                                </tr>
                            </thead>
                            <tbody>
                                ${DAYS_OF_WEEK.map((day) => {
                                    if (parsedOpeningTime[day].length == 0) {
                                        parsedOpeningTime[day] = ["00:00:00", "00:00:00"];
                                    }
                                    return `<tr>
                                        <td>${capitalizeFirstLetter(day)}</td>
                                        <td><input name="${day}-open" type="time" value="${parsedOpeningTime[day][0]}" step="1"></td>
                                        <td><input name="${day}-close" type="time" value="${parsedOpeningTime[day][1]}" step="1"></td>
                                        <td> <input type="checkbox" name="${day}" value="closed"></td>
                                    </tr>`;
                                }).join("\n")}
                                <input type="hidden" name="storeid" value="${store.id}">
                            </tbody>
                        </table>
                        <label for="delete-timeslots">Delete existing timeslots outside of opening times: </label>
                        <input type="checkbox" name="delete-timeslots"><br>
                        <input type="submit" value="Set new opening hours">
                    </form>
                    ${request.session.status ? `<p id="error-message" class="${request.session.status.type == 0 ? "error-message" : "success-message"}">${request.session.status.text}</p>` : ""}
                </div>
                <script src="/static/js/settingsScript.js"></script>
            </body>
        </html>
    `;

    return page;
}

exports.renderStoreScan = function renderStoreScan(store, request) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>scanner</title>
                <link rel="stylesheet" href="/static/css/style.css">
                <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.13.0/css/all.min.css">
                <style>
                    .hidden {
                        display: none;
                    }
                </style>
            </head>
            <body>`;

    page += `${renderEmployeeNav(store, request)}`;
    page += `
                <div class="main-body">
                    <h1>Scan a package</h1>
                    <p id="loading-placeholder">Trying to open camera...</p>
                    <div id="controls-container" class="hidden">
                        <video id="scanner-content" disablepictureinpicture playsinline></video><br>
                        <div id="btn-wrap">
                            <button id="start-scanner-btn">Start scanner</button>
                            <button id="stop-scanner-btn">Stop scanner</button>
                        </div>
                    </div>
                        <h2>Package details</h2>
                        <p>Validation key is automatically set when a QR code is scanned. Press the lock to manually input package:</p>
                        <form action="/store/package" method="GET">
                            <label for="validationKey">Validation key:</label><br>
                            <div class="input-container">
                                <input id="validation-key-input" style="background-color:#72A4D2" type="text" name="validationKey" readonly value="">
                                <i id="input-toggle" class="fas fa-unlock" onclick="toggleValidationInput()"> </i> <br>
                            </div>
                            <input type="hidden" value="${store.id}" name="storeid">
                            <input type="submit" value="Go to package"><br>
                        </form>
                    
                    <a href="/store?storeid=${store.id}" class="knap">Back</a>
                    </div>

                <script src="/static/js/external/qr-scanner.umd.min.js"></script>
                <script src="/static/js/qrScannerScript.js"></script>
                <script>
                    function toggleValidationInput(){
                        elm = document.getElementById('validation-key-input');
                        elm.readOnly = !elm.readOnly;
                        if (elm.readOnly){
                            elm.style.backgroundColor = "#72A4D2";
                        } else{
                            elm.style.backgroundColor = "#f0f0f0";
                        }
                    }
                </script>
            </body>
        </html>
    `;

    return page;
}

exports.renderPackageOverview = function renderPackageOverview(store, package, request) {
    let action_path = "";
    let action_name = "";
    switch (package.readyState) {
        case ReadyState.NotPackedYet:
            action_path = "readyfordelivery";
            action_name = "Mark as packed and ready";
            break;
        case ReadyState.NotDelivered:
            action_path = "confirm";
            action_name = "Mark as delivered";
            break;
        case ReadyState.Delivered:
            action_path = "undeliver";
            action_name = "Mark as not delivered";

            break;
        default:
            throw new Error(`package with id ${package.id} has an invalid ready state of ${package.readyState}`);
    }
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>Package overview</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>
                ${renderEmployeeNav(store, request)}
                <div class="main-body">
                    <h1>Package details</h1>
                    <p style="display: inline">Status: </p><span style="color: ${package.readyState == ReadyState.Delivered ? "green" : "red"}">${readyStateToReadableString(package.readyState)}</span>
                    <p>Guid: ${package.guid}</p>
                    <p>Booked timeslot id: ${package.bookedTimeId}</p>
                    <p>Verification code: ${package.verificationCode}</p>
                    <p>Customer Email: ${package.customerEmail}</p>
                    <p>Customer name: ${package.customerName}</p>
                    <p>External order id: ${package.externalOrderId}</p>
                    <p>Creation date: ${fromISOToDate(package.creationDate)} ${fromISOToHHMM(package.creationDate)}</p>
                    <h2>Actions</h2>
                    <form action="/store/package/${action_path}" method="POST">
                        <input type="hidden" value="${store.id}" name="storeid">
                        <input type="hidden" value="${package.id}" name="packageid">
                        <input type="submit" value="${action_name}">
                    </form>
                    <h2>Links:</h2>
                    <div class="link-wrap">
                        <a href="/store/packages?storeid=${store.id}" class="knap">Package overview</a>
                        <a href="/store/scan?storeid=${store.id}" class="knap">Scan package</a>
                    </div>
                <div class="main-body">
            </body>
        </html>
    `;

    return page;
}

exports.renderLogin = function renderLogin(request) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.13.0/css/all.min.css">
                <link rel="stylesheet" href="/static/css/style.css">
                <title>login</title>
            </head>

            <body>
                <form action="/login" method="POST">
                    <label for="username">Username: </label>
                    <input type="text" name="username" placeholder="username" value="${request.session.username == undefined ? "" : request.session.username}" required><br>
                    <label for="password"> Password:     </label>
                        <div class="container">
                            <input type="password" name="password" placeholder="password" id="password" required>
                            <i class="fas fa-eye" id="togglePassword"> </i>
                        </div>
                    <input type="submit" value="login">
                    ${request.session.status ? `<p class="${request.session.status.type == 0 ? "error-message" : "success-message"}">${request.session.status.text}</p>` : ""}
                </form>

                <script>
                    // Eye toggle for password
                    const togglePassword = document.querySelector('#togglePassword');
                    const password = document.querySelector('#password');

                    togglePassword.addEventListener('click', function (e) {
                        const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
                        password.setAttribute('type', type);
                        this.classList.toggle('fa-eye-slash');
                    });
            
                </script>

            </body>
            
        </html>
    `

    return page;
}

exports.renderEditEmployee = function renderEditEmployee(store, request) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title> Editing user: ${request.query.username} </title>
                <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.13.0/css/all.min.css">
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>`;
    
            page += `${renderNavigation(store)}`;
            page += `
                ${request.session.status ? `<p class="${request.session.status.type == 0 ? "error-message" : "success-message"}">${request.session.status.text}</p>` : ""}
                <div class="main-body">
                    <h1>Editing ${request.query.username}</h1>
                        
                    <form action="/admin/employees/edit" method="POST">
                        <label for="username">Username:</label>
                        <input type="text" name="username" value="${request.query.username}" required>
                        <label for="name"> Employee name:</label>
                        <input type="text" name="employeeName" value="${request.query.name}" required>
                        
                        <label for="password">Password:</label>
                        <div class="container">
                            <input type="password" name="password" value="password" id="password" onchange='checkPass();' minlength="8" required>
                            <i class="fas fa-eye" id="togglePassword"></i>
                        </div>
                        
                        <label for="confirmPassword"> Confirm password: </label>
                        <div class="container">
                            <input type="password" name="confirmPassword" value="password" id="confirmPassword" onchange='checkPass();' required>
                            <i class="fas fa-eye" id="toggleConfirmPassword"> </i>
                        </div>
                        <input type="hidden" value="${store.id}" name="storeid"> 
                        <input type="hidden" value="${request.query.id}" name="id">   
                        <p id="matchingPasswords" style="color:red" hidden> The passwords do not match </p>
                        
                        <label for="superuser">Is the account an admin account:</label>
                        <input type="radio" value="1" name="superuser" ${request.query.superuser == 1 ? "checked" :""}>Yes</input>
                        <input type="radio" value="0" name="superuser" ${request.query.superuser == 1 ? "" :"checked"}>No</input>
                    
                        <input type="submit" id="submit" value="Edit user">
                    </form>

                    <a href="/admin/employees/employee_list?storeid=${store.id}" class="knap">Back</a>
                </div>
                <script>
                    function checkPass() {
                        if (document.getElementById('password').value ==
                                document.getElementById('confirmPassword').value) {
                            document.getElementById('submit').disabled = false;
                            document.getElementById('matchingPasswords').hidden = true;
                        } else {
                            document.getElementById('submit').disabled = true;
                            document.getElementById('matchingPasswords').hidden = false;
                        }
                    }
                    
                    // Eye toggle for password
                    const togglePassword = document.querySelector('#togglePassword');
                    const password = document.querySelector('#password');

                    togglePassword.addEventListener('click', function (e) {
                        const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
                        password.setAttribute('type', type);
                        this.classList.toggle('fa-eye-slash');
                    });

                    // Eye toggle for confirmPassword
                    const toggleConfirmPassword = document.querySelector('#toggleConfirmPassword');
                    const ConfirmPassword = document.querySelector('#confirmPassword');

                    toggleConfirmPassword.addEventListener('click', function (e) {
                        const type = confirmPassword.getAttribute('type') === 'password' ? 'text' : 'password';
                        confirmPassword.setAttribute('type', type);
                        this.classList.toggle('fa-eye-slash');
                    });
                </script>
            </body>
        </html>
    `;

    return page;
}

exports.renderTimeSlots = function renderTimeSlots(selectedWeek, selectedYear, selectedWeekDay, targetPackage, lower, rowsHTML) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>Timeslots</title>
                <link href="/static/css/timeSlotSelection.css" rel="stylesheet">
            </head>
            <body>
                <h1>Week ${selectedWeekDay.isoWeek() }</h1>
                <p>Please select a time slot</p>
                <div class="btnWrap">
                    <form action="/package">
                        <input type="hidden" name="week" value="${selectedWeek - 1}">
                        <input type="hidden" name="year" value="${selectedYear}">
                        <input type="hidden" name="guid" value="${targetPackage.guid}">
                        <input type="submit" value="Previous week">
                    </form>
                    <form action="/package">
                        <input type="hidden" name="week" value="${selectedWeek + 1}">
                        <input type="hidden" name="year" value="${selectedYear}">
                        <input type="hidden" name="guid" value="${targetPackage.guid}">
                        <input type="submit" value="Next week">
                    </form>
                </div>
            
                <div class="time">
                    <table>
                        <thead>
                            <tr>
                            ${(Array(7).fill().map((_, i) => {
                                let thing = moment(lower).isoWeekday(i + 1);
                                return `<th>${thing.format("dddd")}<br>${thing.format("DD/MM/YYYY")}</th>`;
                            })).join("\n")}
                            </tr>
                        </thead>
                        <tbody> 
                            ${rowsHTML}
                        </tbody>
                    </table>
                </div>

                <div id="myModal" class="modal">
                    <div class="modal-content">
                        <span class="close">&times;</span>
                        <h2>Do you want the following time slot?</h2>
                        <p id="selectedTime" class="sTime"> </p>
                        <form action="/package/select_time" method="POST">
                            <input name="guid" type="hidden" value="${targetPackage.guid}">
                            <input id="selected-time-id" type="hidden" value="" name="selectedTimeId">
                            <input type="submit" class="submitbtn" value="Submit" style="font-size:20px;">
                        </form>
                    </div>
                </div>
                <script src="/static/js/timeSlotSelection.js"></script>
            </body>
        </html>
    `;

    return page;
}

exports.renderTimeSlotStatus = function renderTimeSlotStatus(package, bookedTimeSlot, queueName) {
    let page = `
        <html>
            <head>
                ${generalHeader()}
                <title>Package status</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>
                <div class="main-body" style="margin-top: 1em">
                    <h1>Hey ${package.customerName == null ? "" : package.customerName}</h1>
                    <p>You have selected a timeslot for this package, here is your package information:</p>
                    <p>Booked time period: ${fromISOToDate(bookedTimeSlot.startTime)} from ${fromISOToHHMM(bookedTimeSlot.startTime)} to ${fromISOToHHMM(bookedTimeSlot.endTime)} </p>
                    <p>Your booking is in queue ${queueName}
                    <h2>Actions</h2>
                    ${package.readyState == ReadyState.NotDelivered ? `
                    <p>If you can not come at the booked time, you can cancel and book a new time:</p> 
                    <form action="/package/cancel" method="POST">
                        <input type="hidden" value="${package.guid}" name="guid">
                        <input type="submit" value="Cancel the booked time">
                    </form>` : ""}
                    <p> You can close this page, and can return with the same link.</p>
                </div>
            </body>
        </html>
    `;

    return page;
}

exports.render500 = function render500(request) {
    let userId = null;
    if (request.user != null){
        userId = request.user.storeId;
    }
    return`<!DOCTYPE html>
    <html>
        <head>
            ${generalHeader()}
            <title>500 server error</title>
        </head>
        <body>
            <b>A server error occurred while serving your request<br></b>
            <a href="/login">Go to login page </a> <br>
            ${userId != null ? `
            <a href="/store?storeid=${userId}"> Go to employee dashboard</a> <br>
            <a href="/admin?storeid=${userId}"> Go to admin dashboard</a> <br>
            ` : ""}
        </body>
    </html>`;
}

exports.renderOrderProcessingMail = function renderOrderProcessingMail(store, package, timestamp) {
    return `
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <title>Choose pickup</title>
            </head>
            <body>
                <h1>Order information</h1>
                <p>Hello ${package.customerName}. You have ordered items from ${store.name}.</p>
                <p>Order received at ${timestamp}.</p>
                <p>Your order is currently being processed and packed at the store. You will get another mail with further
                information when the package has been packed and is ready for pick up.</p>
            </body>
        </html>
    `;
}

exports.renderMissedTimeSlot = function renderMissedTimeSlot(store, package, unique_url) {
    return `
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <title>Choose pickup</title>
            </head>
            <body>
                <h1>You have missed the timeslot for your package</h1>
                <p>Hello ${package.customerName}. </p>
                <p>You have ordered items from ${store.name} but you did not collect your package up within your time slot.</p>
                <p>Please pick another time on this link and pick it up with that time slot</p>
                <p><a href="${unique_url}">Click here to choose a new time slot</a></p>
            </body>
        </html>
    `;
}
