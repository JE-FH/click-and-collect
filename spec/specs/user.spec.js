const sqlite3 = require("sqlite3");
const {main} = require("../../backend/server");
const httpMocks = require('node-mocks-http');
const EventEmitter = require("node:events");
const cookie = require("cookie");
const CookieJar = require("cookiejar");
const config = require("../../server.config");
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
		let cookieJar = new CookieJar.CookieJar();
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

			request.session.testthing = 5486283;

			if (cookieHeader instanceof Array) {
				cookieJar.setCookies(cookieHeader, config.base_host_address);
			} else {
				cookieJar.setCookie(cookieHeader,  config.base_host_address);
			}
		});
		it("Should keep the same session", async () => {
			let request = httpMocks.createRequest({
				method: "",
				url: "/",
				headers: {
					cookie: cookieJar.getCookies(CookieJar.CookieAccessInfo(config.base_host_address)).toString()
				}
			});
			let response = create_simple_res();
			let p = await_response(response);
			sessionMiddleware(request, response);
			response.end()
			await p;

			expect(request.session.testthing).toBe(5486283);
		});
		it("Should get another session when sending without cookies", async () => {
			let request = create_simple_req("GET", "/")
			let response = create_simple_res();
			let p = await_response(response);
			sessionMiddleware(request, response);
			response.end();
			await p;

			let cookieHeader = response.getHeader("set-cookie");
			expect(cookieHeader).toBeDefined();
			expect(request.session).toBeInstanceOf(Object);

			let newCookieJar = new CookieJar.CookieJar();
			if (cookieHeader instanceof Array) {
				newCookieJar.setCookies(cookieHeader, config.base_host_address);
			} else {
				newCookieJar.setCookie(cookieHeader,  config.base_host_address);
			}
			/*A very long way to write that we should have a new session id*/
			expect(newCookieJar.getCookie("sessid", CookieJar.CookieAccessInfo(config.base_host_address)).value)
				.not.toBe(cookieJar.getCookie("sessid", CookieJar.CookieAccessInfo(config.base_host_address)).value)
		});
	});
})
