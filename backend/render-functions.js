function renderNavigation(store) {
    return `
        <nav class="navigation">
            <a href="/admin?storeid=${store.id}"><h1 style="padding-left: 0.5em;">Admin</h1></a>
            <ul>
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

function renderEmployeeNav(store) {
    return `
        <nav class="employee-nav">
            <div>
                <a href="/store?storeid=${store.id}">Home</a>
                <a id="scan" href="/store/scan?storeid=${store.id}">Scan</a>
            </div>
        </nav>
    `;
}

exports.renderAdmin = function renderAdmin(request, store) {
    let page = `
        <html>
            <head>
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
                        <a href="/store?storeid=${store.id}"><li>Go to standard employee dashboard</li></a>
                        <a href="/admin/queues?storeid=${store.id}"><li>Manage queues</li></a>
                        <a href="/admin/settings?storeid=${store.id}"><li>Change settings</li></a>
                        <a href="/admin/package_form?storeid=${store.id}"><li>Create package manually</li></a>
                        <a href="/admin/employees?storeid=${store.id}"><li>Manage employees</li></a>
                    </ul>
                </div> 
            </body>
        </html>
    `;
    return page;
}

exports.renderQueueList = function renderQueueList(store, queues) {
    let page = `
        <html>
            <head>
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
                <script type="text/javascript" src="/static/js/queueListScript.js"></script>
                </div>
            </body>
        </html>
    `;

    return page;
}

exports.renderPackageForm = function renderPackageForm(store) {
    let page = `
        <html>
            <head>
                <meta charset="UTF-8">
                <title>Add package</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>`;
    page += `${renderNavigation(store)}`;
    page += `
                <div class="main-body">
                    <h1>Add package</h1>
                    <form action="/package_form_handler?storeid=${store.id}" method="POST">
                        <input type="text" name="customerName" placeholder="Customer name" required>
                        <input type="text" name="customerEmail" placeholder="Customer email" required>
                        <input type="text" name="externalOrderId" placeholder="Order ID" required> 
                        <input type="submit">
                    </form>
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
                <title>Store admin for ${request.session.storeName}</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body> `;
    
    page += `${renderNavigation(store)}`;
    page += `
                <div class="main-body">
                    <h1>Manage employees </h1>
                    <ul class="dash">
                        <a href="/admin/employees/employee_list?storeid=${request.session.storeId}"><li>View a list of employees</li></a>
                        <a href="/admin/employees/remove?storeid=${request.session.storeId}"><li>Remove employees</li></a>
                        <a href="/admin/employees/add?storeid=${request.session.storeId}"><li>Add employees</li></a>
                        <a href="/admin?storeid=${request.session.storeId}"><li>Back to dashboard</li></a>
                    </ul>
                </div>
            </body>
        </html>
    `;

    return page;
}

exports.employeeListPage = function employeeListPage(store, htmlTable) {
    let page = `
        <html>
            <head>
                <title>Employee list </title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>`;
    
    page += `${renderNavigation(store)}`;
    page += `
            <div class="main-body">
                <h> Employee list <h> <br>
                <b> Here is a table of the current employee accounts: <br> ${htmlTable} </b>
            </div>
            </body>
        </html>
    `;

    return page;
}

exports.employeeListRemPage = function employeeListRemPage(store, error, htmlTable) {
    let page = `
        <html>
            <head>
                <title>Removing an employee </title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>`;
    
    page += `${renderNavigation(store)}`;
    page += `
            <div class="main-body">
                ${error ? `<p>${error}</p>` : ""}
                <h> Removing employee from the store <h>
                
                <form action="/admin/employees/remove" method="POST">
                
                <label for="name">Write the username:     </label>
                <input type="text" placeholder="username" name="username" required><br>     
                <input type="hidden" value="${store.id}" name="storeid">          
                <input type="submit" value="Delete user" onclick="return confirm('Are you sure?')" />
            </form>
            <b> Here is a table of the current employee accounts: <br> ${htmlTable} </b>
            </div>
            </body>
        </html>
    `;

    return page;
}

exports.addEmployeePage = function addEmployeePage(store, error) {
    let page = `
        <html>
            <head>
                <title>Adding new employee </title>
                <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.13.0/css/all.min.css">
                <link rel="stylesheet" href="/static/css/style.css">
                <style>
                    .container {
                        display: flex;
                        align-items: center;
                        position: relative;
                        margin-bottom: 1em;
                    }
                    #togglePassword {
                        position: absolute;
                        right: 10px;
                    }
                </style>
            </head>
            <body>`;

    page += `${renderNavigation(store)}`;
    page += `
                <div class="main-body">
                    ${error ? `<p>${error}</p>` : ""}
                    <h> Adding new employee to the store <h>
                
                    <form action="/admin/employees/add" method="POST">
                        <label for="username">Username:      </label>
                        <input type="text" name="username" placeholder="username" required><br>

                        <label for="name"> Employee name: </label>
                        <input type="text" name="employeeName" placeholder="Employee name" required><br> <br>
                        <label for="password"> Password:     </label>
                        <div class="container">
                            <input type="password" name="password" placeholder="password" id="password" onchange='checkPass();' minlength="8" required>
                            <i class="fas fa-eye" id="togglePassword"> </i>
                        </div>
                        
                        <label for="confirmPassword"> Confirm password: </label>
                        <div class="container">
                            <input type="password" name="confirmPassword" placeholder="password" id="confirmPassword" onchange='checkPass();' required>
                            <i class="fas fa-eye" id="toggleConfirmPassword"> </i>
                        </div>
                        <input type="hidden" value="${store.id}" name="storeid">    
                        <p id="matchingPasswords" style="color:red" hidden> The passwords do not match </p>
                        
                        <label for="superuser"> Is the account an admin account: </label>
                        <input type="radio" value="1" name="superuser" checked>Yes</input>
                        <input type="radio" value="0" name="superuser">No</input>
                    
                        <input type="submit" id="submit" value="Create user" disabled>
                    </form>
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
                <title>Store menu for ${store.name}</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>

            <body>`;

    page += `${renderEmployeeNav(store)}`;
    page += `

                <div class="main-body">
                <h1>Menu for ${request.user.name}:</h1>
                <ul class="dash">
                    ${request.user.superuser ? `<a href="/admin?storeid=${store.id}"><li>Back to admin page</li></a>` : ""}
                    <a href="/store/packages?storeid=${store.id}"><li>Package overview</li></a>
                    <a href="/store/scan?storeid=${store.id}"><li>Scan package</li></a>
                </ul>
                </div>
            </body>
        </html>
    `;

    return page;
}

exports.renderPackageList = function renderPackageList(store, packageTable) {
    let page = `
        <html>
            <head>
                <title>Package overview</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>`;

    page += `${renderEmployeeNav(store)}`;
    page += `
                <h> Package overview <h>
                </form>
                <br>
                <b> List of current packages: </b>
                <br> 
                ${packageTable} 
            </body>
        </html>
    `;

    return page;
}

exports.renderSettings = function renderSettings(store) {
    let page = `
        <html>
            <head>
                <title>Store settings</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>`;

    page += `${renderNavigation(store)}`;
    page += `
            <div class="main-body">
                <h1>Settings</h1>

            </div>
            </body>
        </html>
    `

    return page;
}

exports.renderGetTime = function renderGetTime(rowsHTML) {
    let html = `
    <!DOCTYPE HTML>
    <html>
        <head>
            <title>Timeslots</title>
            <meta charset="UTF-8">
        </head>
        <style>

        h1 {
            text-align: center;
            background-color: #E3BCBC;
            background-position: 50% top;
            padding: 50px;
            font-weight: normal;
        }
        h2 {
            text-align: center;
        }
        table {
            border-collapse: collapse;
            width: 100%;
        }


        th, td {
            text-align: center;
            border-radius: 5px;
        }
        th {
            color: #666;
            text-align: center;
        }

        td {
            padding: 15px;
        }
        td:hover {background-color:#E3BCBC;}

        .modal {
            display: none; /* Hidden by default */
            position: fixed; /* Stay in place */
            z-index: 1; /* Sit on top */
            padding-top: 200px; /* Location of the box */
            left: 0;
            top: 0;
            width: 100%; /* Full width */
            height: 100%; /* Full height */
            overflow: auto; /* Enable scroll if needed */
            background-color: rgb(0,0,0); /* Fallback color */
            background-color: rgba(0,0,0,0.4); /* Black w/ opacity */
        }
        
        .modal-content {
            background-color: #fefefe;
            margin: auto;
            padding: 20px;
            border: 1px solid #888;
            width: 80%;
        }
        
        .close {
            color: #aaaaaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
        }
        
        .close:hover,
        .close:focus {
          color: #000;
          text-decoration: none;
          cursor: pointer;
        }

        .submitbtn {
            position: relative;
            left: 47%;
            cursor: pointer;
        }
        .sTime {
            text-align: center;
        }


        </style>

        <body> 

            <h1> Week x </h1>
        
            <div class="time">
            <table>
            <thead>
                <tr>
                    <th>Monday</th>
                    <th>Tuesday</th>
                    <th>Wednesday</th>
                    <th>Thursday</th>
                    <th>Friday</th>
                    <th>Saturday</th>
                    <th>Sunday</th>
                </tr>
            </thead>
        <tbody> 
    `;
    html += rowsHTML;  
            
    /* Second part of html, right now there is an alert box when clicking on a td (timeslot)*/
    let html2 = `

        </div>

        <div id="myModal" class="modal">

            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>Do you want the following time slot?</h2>
                <p id="selectedTime" class="sTime"> </p>
                <form action="/package/confirm" method="GET">
                    <input type="submit" class="submitbtn" value="Submit" style="font-size:20px;"/>
                </form>
                
            </div>
        </div>

        <script>
        var modal = document.getElementById("myModal");
        var btn = document.getElementById("myBtn");
        var span = document.getElementsByClassName("close")[0];
        
        var elements= document.getElementsByTagName('td');
        for(var i = 0; i < elements.length; i++){
        (elements)[i].addEventListener("click", function(){
        modal.style.display = "block";

        
        var dataId = this.getAttribute('data-id');

        var x = this.innerHTML;

        document.getElementById("selectedTime").innerHTML = x;
        console.log(dataId);
        console.log(this);

        if (this.innerHTML == "") {
            modal.style.display = "none";
        }
        });
        }
    
        span.onclick = function() {
        modal.style.display = "none";
        }

        window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
            }
        }
        </script>

        </body>

        </html>
        `

        /* Stacks the html parts */
        let page = html + rowsHTML+ html2;

        return page;
}

exports.renderStoreScan = function renderStoreScan(store) {
    let page = `
        <html>
            <head>
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

    page += `${renderEmployeeNav(store)}`;
    page += `
                <h1>Scan a package</h1>
                <p id="loading-placeholder">Trying to open camera...</p>
                <div id="controls-container" class="hidden">
                    <video id="scanner-content" disablepictureinpicture playsinline></video><br>
                    <button id="start-scanner-btn">Start scanner</button>
                    <button id="stop-scanner-btn">Stop scanner</button><br>
                    <h2>Package details</h2>
                    <form action="/store/package" method="GET">
                        <label for="validationKey">Validation key, automatically set when a qr code is scanned. Press the lock to manually input package: </label><br>
                        <input id="validation-key-input" type="text" name="validationKey" disabled="true" value="">
                        <i class="fas fa-unlock" onclick="toggleValidationInput()"> </i> <br>
                        <input type="hidden" value="${store.id}" name="storeid">
                        <input type="submit" value="Go to package"><br>
                    </form>
                </div>

                <!-- Burde måske samles i en script -->
                <script src="/static/js/external/qr-scanner.umd.min.js"></script>
                <script src="/static/js/qrScannerScript.js"></script>
                <script>
                    function toggleValidationInput(){
                        elm = document.getElementById('validation-key-input');
                        elm.disabled ? elm.disabled = false : elm.disabled = true;
                    }
                </script>
            </body>
        </html>
    `;

    return page;
}

exports.renderPackageOverview = function renderPackageOverview(store, package) {
    let page = `
        <html>
            <head>
                <title>Package overview</title>
                <link rel="stylesheet" href="/static/css/style.css">
            </head>
            <body>`;

    page += `${renderEmployeeNav(store)}`;
    page += `
                <div class="main-body">
                    <h1>Package overview</h1>
                    <h2>Details</h2>
                    <p>status: ${package.delivered == 0 ? "NOT DELIVERED" : "DELIVERED"}
                    <p>guid: ${package.guid}</p>
                    <p>bookedTimeId: ${package.bookedTimeId}</p>
                    <p>verificationCode: ${package.verificationCode}</p>
                    <p>customerEmail: ${package.customerEmail}</p>
                    <p>customerName: ${package.customerName}</p>
                    <p>externalOrderId: ${package.externalOrderId}</p>
                    <p>creationDate: ${package.creationDate}</p>
                    <h2>Actions</h2>
                    <form action="/store/package/${package.delivered == 0 ? "confirm" : "undeliver"}" method="POST">
                        <input type="hidden" value="${store.id}" name="storeid">
                        <input type="hidden" value="${package.id}" name="packageid">
                        <input type="submit" value="${package.delivered == 0 ? "Confirm delivery" : "Mark as not delivered"}">
                    </form>
                <div class="main-body">
            </body>
        </html>
    `;

    return page;
}