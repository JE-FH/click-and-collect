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

exports.renderAdmin = function renderAdmin(request, store) {
    let page = `
        <!DOCTYPE html>
        <html>
            <head>
                <link rel="stylesheet" href="/static/css/style.css">
                <title>Store admin for ${store.name}</title>
            </head>
            <body>`;
    
    page += `${renderNavigation(store)}`;
    page += `
                <div class="wrap1">
                    <h1>Admin dashboard</h1>
                    <h2>Welcome, ${request.user.name}</h2>
                    <ul>
                    <li><a href="/store?storeid=${store.id}"> Go to standard employee dashboard</a></li>
                        <li><a href="/admin/queues?storeid=${store.id}">Manage queues</a></li>
                        <li><a href="/admin/settings?storeid=${store.id}">Change settings</a></li>
                        <li><a href="/admin/package_form?storeid=${store.id}">Create package manually</a></li>
                        <li><a href="/admin/employees?storeid=${store.id}">Manage employees</a></li>
                    </ul>
                </div> 
            </body>
        </html>
    `;
    return page;
}

exports.renderQueueList = function renderQueueList(store, queues) {
    let page = `
        <!DOCTYPE html>
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
                <h1>Add package</h1>
                <form action="/package_form_handler?storeid=${store.id}" method="POST">
                    <input type="text" name="customerName" placeholder="Customer name" required>
                    <input type="text" name="customerEmail" placeholder="Customer email" required>
                    <input type="text" name="externalOrderId" placeholder="Order ID" required> 
                    <input type="submit">
                </form>
            </body>
        </html>
    `;
    return page;
}