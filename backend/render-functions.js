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