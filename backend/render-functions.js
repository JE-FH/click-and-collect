function renderNavigation(store) {
    return `
        <nav class="navigation">
            <a href="/store"><h1 style="padding-left: 0.5em;">Admin</h1></a>
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