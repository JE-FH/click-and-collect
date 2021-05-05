const sqlite3 = require("sqlite3");
const {main} = require("../../backend/server");
const httpMocks = require('node-mocks-http');
const EventEmitter = require("node:events");
const CookieJar = require("cookiejar");
const config = require("../../server.config");


const BCookieJar = function BCookieJar() {
	this.cookieJar = new CookieJar.CookieJar();
	this.host = config.base_host_address;
}

BCookieJar.prototype.addCookie = function addCookie(cookieHeader) {
	if (cookieHeader instanceof Array) {
		this.cookieJar.setCookies(cookieHeader, this.host);
	} else {
		this.cookieJar.setCookie(cookieHeader, this.host);
	}
}

BCookieJar.prototype.getCookieObject = function getCookieObject() {
	let rv = {};
	let cookies = this.cookieJar.getCookies(CookieJar.CookieAccessInfo(this.host))
	for (cookie of cookies) {
		rv[cookie.name] = cookie.value;
	}
	return rv;
}

BCookieJar.prototype.getCookieString = function getCookieObject() {
	return this.cookieJar.getCookies(CookieJar.CookieAccessInfo(this.host)).toString();
}

BCookieJar.prototype.getCookie = function getCookie(name) {
	return this.cookieJar.getCookie(name, CookieJar.CookieAccessInfo(this.host))
}

function create_simple_req(method, url) {
	return httpMocks.createRequest({
		method: method,
		url: url
	});
}

function create_simple_res() {
	return httpMocks.createResponse({
		eventEmitter: EventEmitter
	});
}

async function await_response(response) {
	await new Promise((resolve) => {
		response.on("end", () => resolve());
	});
}

describe("Unit test", function() {
	let db = new sqlite3.Database(":memory:");
	let requestHandler;
	beforeAll(async () => {
		requestHandler = await main(db);
	});
	describe("session middleware", function() {
		const {sessionMiddleware} = require("../../backend/middleware");
		it("should add a session id", async () => {
			let request = create_simple_req("GET", "/")
			let response = create_simple_res();
			let p = await_response(response);
			sessionMiddleware(request, response);
			response.end();
			await p;

			let cookieHeader = response.getHeader("set-cookie");
			expect(cookieHeader).toBeDefined();
			expect(request.session).toBeInstanceOf(Object);
		});
		it("Should keep the same session", async () => {
			//Send first request to get the session object
			let cookieJar = new BCookieJar();
			let response = create_simple_res();
			let request = create_simple_req("GET", "/");
			sessionMiddleware(request, response);

			let cookieHeader = response.getHeader("set-cookie");
			
			expect(cookieHeader).toBeDefined();
			expect(request.session).toEqual({});
			
			request.session.testthing = 5486283;
			cookieJar.addCookie(cookieHeader);
			
			//Check if the session object is still the same
			let request2 = httpMocks.createRequest({
				method: "",
				url: "/",
				headers: {
					cookie: cookieJar.getCookieString()
				}
			});
			let response2 = create_simple_res();
			sessionMiddleware(request2, response2);

			expect(request2.session.testthing).toBe(5486283);
		});
		it("Should get unique session ids", async () => {
			let response = create_simple_res();
			sessionMiddleware(create_simple_req("GET", "/"), response);
			let cookieJar1 = new BCookieJar();
			cookieJar1.addCookie(response.getHeader("set-cookie"));

			let response2 = create_simple_res();
			sessionMiddleware(create_simple_req("GET", "/"), response2);
			let cookieJar2 = new BCookieJar();
			cookieJar2.addCookie(response2.getHeader("set-cookie"));

			/*A very long way to write that we should have a new session id*/
			expect(cookieJar1.getCookie("sessid").value)
				.not.toBe(cookieJar2.getCookie("sessid").value);
		});
	});
})
