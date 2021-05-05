const sqlite3 = require("sqlite3");
const {main} = require("../../backend/server");
const httpMocks = require('node-mocks-http');
const EventEmitter = require("node:events");
const CookieJar = require("cookiejar");
const config = require("../../server.config");
const { dbRun } = require("../../backend/db-helpers");
const querystring = require("querystring");


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

function create_req_with_cookie(method, url, cookiestr) {
	return httpMocks.createRequest({
		method: method,
		url: url,
		headers: {
			cookie: cookiestr
		}
	});
}

function createPostReq(url, data) {
	return httpMocks.createRequest({
		method: "POST",
		url: url,
		fake_body_thing: data
	});
}


function createPostReqWithCookie(url, data, cookiestr) {
	return httpMocks.createRequest({
		method: "POST",
		url: url,
		fake_body_thing: data,
		headers: {
			cookie: cookiestr
		}
	});
}


function create_simple_res() {
	return httpMocks.createResponse({
		eventEmitter: EventEmitter
	});
}

async function await_response(response) {
	await new Promise((resolve) => {
		response.on("end", () => {resolve();});
	});
}

describe("Unit test", function() {
	let db = new sqlite3.Database(":memory:");
	let serverRequestHandler;
	beforeAll(async () => {
		serverRequestHandler = await main(db);
		//Insert a store
		await dbRun(db, `INSERT INTO store (id, name, openingTime, pickupDelay, apiKey, storeEmail) VALUES
			(4563, "dkfaoef", 
			'{"monday": ["08:00:00", "17:00:00"],' || 
			'"tuesday": ["08:00:00", "17:00:00"],' ||
			'"wednesday": ["08:00:00", "17:00:00"],' ||
			'"thursday": ["08:00:00", "17:00:00"],' ||
			'"friday": ["08:00:00", "17:00:00"],' ||
			'"saturday": ["10:00:00", "12:30:00"],' ||
			'"sunday": []}', 
			"00:00:00", "ksokg", "dkfaoef@mail.com")`
		);
		//Insert a user, unhashed password is "password"
		await dbRun(db, `
			INSERT INTO user (id, username, password, salt, name, superuser, storeId) VALUES 
			(1, "bob", "e7620ce600f3434e87dc9bfdaacdcf473f98f1275838f74f92c7e928da4a76a24d134576898ec1143f9603b025850f9e269af92d7e068f31dec31bb07c97cebc", "abcdefg", "bob", 0, 4563);
		`);
		//Insert another user, unhashed password is "hunter2"
		await dbRun(db, `
			INSERT INTO user (id, username, password, salt, name, superuser, storeId) VALUES
			(2, "superbob", "ecb71788886af823e32cd74d22a4fe2712cc579cd0783030ff75e54272191e3d3d9f4b4e156623119f8e2d2fa55cb84cc897a700171aec3ed7617a7602c80fa4", "akrogd", "bob", 1, 4563);
		`)
	});
	describe("session middleware", function() {
		const {sessionMiddleware} = require("../../backend/middleware");
		it("should add a session id", async () => {
			let request = create_simple_req("GET", "/")
			let response = create_simple_res();
			sessionMiddleware(request, response);

			let cookieHeader = response.getHeader("set-cookie");
			expect(cookieHeader).toBeDefined();
			expect(request.session).toBeInstanceOf(Object);
		});
		it("Should keep the same session", async () => {
			let cookieJar = new BCookieJar();
			let response = create_simple_res();
			let request = create_simple_req("GET", "/");
			//Send first request to get the session object
			sessionMiddleware(request, response);
			
			let cookieHeader = response.getHeader("set-cookie");
			
			expect(cookieHeader).toBeDefined();
			expect(request.session).toEqual({});
			
			request.session.testthing = 5486283;
			cookieJar.addCookie(cookieHeader);
			
			//Check if the session object is still the same
			let request2 = create_req_with_cookie("GET", "/", cookieJar.getCookieString());
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

	describe("user middleware", function () {
		const {sessionMiddleware} = require("../../backend/middleware");
		const {createUserMiddleware} = require("../../backend/middleware");
		//Add a user to the database
		let userMiddleware;
		beforeAll(async () => {
			userMiddleware = createUserMiddleware(db);
		});
		it("should not set user on request when userId is null", async () => {
			let response = create_simple_res();
			let request = create_simple_req("GET", "/");
			
			sessionMiddleware(request, response);
			await userMiddleware(request, response);

			expect(request.session.userId).not.toBeDefined();
			expect(request.user).toBe(null);
		});
		it("should set user on request when userId is defined correctly", async () => {
			let response = create_simple_res();
			let request = create_simple_req("GET", "/");
			
			sessionMiddleware(request, response);
			await userMiddleware(request, response);

			request.session.userId = 1;
			
			let cookieJar = new BCookieJar();
			cookieJar.addCookie(response.getHeader("set-cookie"));

			let request2 = create_req_with_cookie("GET", "/", cookieJar.getCookieString());
			let response2 = create_simple_res();
			sessionMiddleware(request2, response2);
			await userMiddleware(request2, response2);
			expect(request2.user).toBeInstanceOf(Object);
			expect(request2.user.id).toBe(1);
			expect(request2.user.username).toBe("bob");
		});
	});

	describe("Query middleware", function () {
		const {queryMiddleware} = require("../../backend/middleware");
		it("should set query object to empty with no query param", async () => {
			let request = create_simple_req("GET", "/");
			queryMiddleware(request, httpMocks.createResponse());
			expect(request.query).toEqual({});
		});

		it("should parse querystrings correctly", async () => {
			let raw = {
				first: "kadof kaofk eof%32kao&32ekf ?=) 42890+ +5i 9??///2\\31454i392 jååæ",
				["dkfoe&?/=\\åæ+   ef%20"]: "lg+ålæø,.-=)(?/\\21%&392%32"
			};
			                                                                          /*Some random characters that might break it*/
			let request = create_simple_req("GET", "/?" + querystring.encode(raw));
			queryMiddleware(request, httpMocks.createResponse());
			expect(request.query).toEqual(raw);
		});
	});

	describe("request handler", function() {
		const {RequestHandler} = require("../../backend/request-handler");
		it("Should crate request handler", async () => {
			let requestHandler = new RequestHandler();
			expect(true).toBe(true);
		})
		it("Should route missing endpoints to default handler", async () => {
			let callCount = 0;
			let requestHandler = new RequestHandler((req, res) => {
				callCount++;
			});
			let wrongCallCount = 0;
			requestHandler.addEndpoint("GET", "/", (req, res) => {
				wrongCallCount++;
			});
			await requestHandler.handleRequest(create_simple_req("GET", "/dfea"), create_simple_res());
			await requestHandler.handleRequest(create_simple_req("GET", ""), create_simple_res());
			await requestHandler.handleRequest(create_simple_req("GET", "wdwdawdaw/dvef/dfe"), create_simple_res());
			await requestHandler.handleRequest(create_simple_req("POST", "/"), create_simple_res());
			expect(callCount).toBe(4);
			expect(wrongCallCount).toBe(0);
		});
		it("Should route endpoints to the correct endpoint handler", async () => {
			let defCallCount = 0;
			let requestHandler = new RequestHandler((req, res) => {
				defCallCount++;
			});

			let aCallCount = 0;
			requestHandler.addEndpoint("GET", "/b", (req, res) => {
				aCallCount++;
			});
			let bCallCount = 0;
			requestHandler.addEndpoint("GET", "/a", (req, res) => {
				bCallCount++;
			});
			await requestHandler.handleRequest(create_simple_req("GET", "/a"), create_simple_res());
			await requestHandler.handleRequest(create_simple_req("POST", "/a"), create_simple_res());
			await requestHandler.handleRequest(create_simple_req("GET", "/b"), create_simple_res());
			await requestHandler.handleRequest(create_simple_req("POST", "/b"), create_simple_res());
			await requestHandler.handleRequest(create_simple_req("GET", ""), create_simple_res());
			await requestHandler.handleRequest(create_simple_req("GET", "&sdfef"), create_simple_res());
			expect(defCallCount).toBe(4);
			expect(aCallCount).toBe(1);
			expect(bCallCount).toBe(1);
		});
		it("should route errors to error handler", async () => {
			let errorToThrow = new Error();
			let thrownError;
			let requestHandler = new RequestHandler((req, res) => {}, (req, res, err) => {
				thrownError = err;
			});
			requestHandler.addEndpoint("GET", "/", (req, res) => {
				throw errorToThrow;
			});
			await requestHandler.handleRequest(create_simple_req("GET", "/"), create_simple_res());
			expect(thrownError).toBe(errorToThrow);
		});
		it("Should route through middleware", async () => {
			let requestHandler = new RequestHandler((req, res) => {});
			let order = [];
			requestHandler.addMiddleware((req, res) => {
				order.push(1);
			});
			requestHandler.addMiddleware((req, res) => {
				order.push(2);
			});
			requestHandler.addMiddleware((req, res) => {
				order.push(3);
			});
			requestHandler.addEndpoint("GET", "/", (req, res) => {
				order.push(4);
			});

			await requestHandler.handleRequest(create_simple_req("GET", "/"), create_simple_res());
			
			await requestHandler.handleRequest(create_simple_req("GET", "539234"), create_simple_res());
			expect(order).toEqual([1, 2, 3, 4, 1, 2, 3]);
		});
		it("should make middleware error reach error handler", async () => {
			let errorToThrow = new Error();
			let thrownError;
			let requestHandler = new RequestHandler((req, res) => {}, (req, res, err) => {
				thrownError = err;
			});
			requestHandler.addMiddleware((req, res) => {
				throw errorToThrow;
			});
			await requestHandler.handleRequest(create_simple_req("GET", "/"), create_simple_res());
			expect(thrownError).toBe(errorToThrow);
		});
	});

	describe("/login endpoint", function() {
		it("Should be able to login to superuser with correct username and password", async () => {
			let request = createPostReq("/login", querystring.encode({username: "bob", password: "password"}));
			let response = create_simple_res();
			let p = await_response(response);
			serverRequestHandler.handleRequest(request, response);
			await p;

			expect(request.session.userId).toBe(1);
			expect(response.statusCode).toBe(302);
			expect(response.getHeader("Location")).toBe(`/store?storeid=${4563}`);
		});
		it("Should be able to login to superuser with correct username and password", async () => {
			let request = createPostReq("/login", querystring.encode({username: "superbob", password: "hunter2"}));
			let response = create_simple_res();
			let p = await_response(response);
			serverRequestHandler.handleRequest(request, response);
			await p;

			expect(request.session.userId).toBe(2);
			expect(response.statusCode).toBe(302);
			expect(response.getHeader("Location")).toBe(`/admin?storeid=${4563}`);
		});
		it("shouldnt be able to login with incorrect password", async () => {
			let request = createPostReq("/login", querystring.encode({username: "bob", password: "srgarg"}));
			let response = create_simple_res();
			let p = await_response(response);
			serverRequestHandler.handleRequest(request, response);
			await p;

			expect(request.session.userId).not.toBeInstanceOf(Number);
			expect(response.statusCode).toBe(302);
			expect(response.getHeader("Location")).toBe(`/login`);
		});
		it("shouldnt be able to login with incorrect username and password", async () => {
			let request = createPostReq("/login", querystring.encode({username: "bobefef", password: "hunter2"}));
			let response = create_simple_res();
			let p = await_response(response);
			serverRequestHandler.handleRequest(request, response);
			await p;

			expect(request.session.userId).not.toBeInstanceOf(Number);
			expect(response.statusCode).toBe(302);
			expect(response.getHeader("Location")).toBe(`/login`);
		});
	});
});
