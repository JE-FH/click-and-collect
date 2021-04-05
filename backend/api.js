function api_js(customerName, customerEmail, orderId, apiKey) {
    fetch('http://127.0.0.1:8000/api/add_package', {
        method: 'POST',
        mode: 'no-cors',
        body : `
            {
                customerName: "${customerName}",
                customerEmail: "${customerEmail}",
                orderId: "${orderId}",
                apiKey: "${apiKey}"
            }`
    })
}