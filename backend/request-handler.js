exports.RequestHandler = function(defaultHandler, errorHandler) {
    this.endpoints = new Map();
    this.middleware = [];
    this.defaultHandler = defaultHandler;
    this.errorHandler = errorHandler;
}

/**
 * Gets the name of the endpoint in the endpoint map
 * @param {string} method 
 * @param {string} path 
 * @returns 
 */
 exports.RequestHandler.prototype.getEndpointName = function (method, path) {
    return `${method.toUpperCase()}:${path}`;
}

exports.RequestHandler.prototype.callHandler = async function (handler, request, response) {
    if (handler.length == 1) {
        return await handler(response);
    } else {
        return await handler(request, response);
    }
}

/**
 * Handles a http request
 * @param {http.IncomingMessage} request 
 * @param {http.ServerResponse} response 
 */
exports.RequestHandler.prototype.handleRequest = async function (request, response) {
    let pathPart = request.url.split("?")[0];

    try {
        for (let middleware of this.middleware) {
            let res = await this.callHandler(middleware, request, response);
            if (res) {
                console.log("stopped at " + middleware.toString())
                return;
            }
        }

        let endpointName = this.getEndpointName(request.method, pathPart);

        let handler = this.endpoints.get(endpointName);

        if (handler == null) {
            await this.callHandler(this.defaultHandler, request, response);
        } else {
            await this.callHandler(handler, request, response);
        }
    } catch (e) {
        if (this.errorHandler == null) {
            console.error("No errorHandler so rethrowing");
            throw e;
        } else {
            if (handler.errorHandler == 2) {
                await this.errorHandler(response, e);
            } else {
                await this.errorHandler(request, response, e);
            }
        }
    }
}

/**
 * Adds an endpoint to the request handler
 * @param {"GET" | "POST"} method 
 * @param {string} path 
 * @param {function(http.IncomingMessage, http.ServerResponse) | function(http.ServerResponse)} handler
 */
exports.RequestHandler.prototype.addEndpoint = function(method, path, handler) {
    let endpointName = this.getEndpointName(method, path);
    if (this.endpoints.has(endpointName)) {
        throw new Error(`Handler for the endpoint ${path} for ${method} has already been added`);
    }
    this.endpoints.set(endpointName, handler);
}

/**
 * Adds middleware at the end of the middleware chain
 * @param {function(http.IncomingMessage, http.ServerResponse): (boolean | void) | function(http.ServerResponse): (boolean | void)} middlewareFunction 
 */
exports.RequestHandler.prototype.addMiddleware = function (middlewareFunction) {
    this.middleware.push(middlewareFunction);
}