const sqlite3 = require("sqlite3");
const {main} = require("../../backend/server");
const httpMocks = require('node-mocks-http');
const CookieJar = require("cookiejar");
const config = require("../../server.config");
const { dbRun, dbExec, dbAll, dbGet } = require("../../backend/db-helpers");
const querystring = require("querystring");
const { ReadyState } = require("../../backend/helpers");
const fs = require("fs/promises");
const moment = require("moment");
const {EventEmitter} = require("events");
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

function createSimpleReq(method, url) {
	return httpMocks.createRequest({
		method: method,
		url: url
	});
}

function createReqWithCookie(method, url, cookiestr) {
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


function createSimpleRes() {
	return httpMocks.createResponse({
		eventEmitter: EventEmitter
	});
}

async function awaitResponse(response) {
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
		await dbRun(db, `INSERT INTO store (id, name, openingTime, apiKey, storeEmail) VALUES
			(4563, "dkfaoef", 
			'{"monday": ["08:00:00", "17:00:00"],' || 
			'"tuesday": ["08:00:00", "17:00:00"],' ||
			'"wednesday": ["08:00:00", "17:00:00"],' ||
			'"thursday": ["08:00:00", "17:00:00"],' ||
			'"friday": ["08:00:00", "17:00:00"],' ||
			'"saturday": ["10:00:00", "12:30:00"],' ||
			'"sunday": []}', 
			"ksokg", "dkfaoef@mail.com")`
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
			let request = createSimpleReq("GET", "/")
			let response = createSimpleRes();
			sessionMiddleware(request, response);

			let cookieHeader = response.getHeader("set-cookie");
			expect(cookieHeader).toBeDefined();
			expect(request.session).toBeInstanceOf(Object);
		});
		it("Should keep the same session", async () => {
			let cookieJar = new BCookieJar();
			let response = createSimpleRes();
			let request = createSimpleReq("GET", "/");
			//Send first request to get the session object
			sessionMiddleware(request, response);
			
			let cookieHeader = response.getHeader("set-cookie");
			
			expect(cookieHeader).toBeDefined();
			expect(request.session).toEqual({});
			
			request.session.testthing = 5486283;
			cookieJar.addCookie(cookieHeader);
			
			//Check if the session object is still the same
			let request2 = createReqWithCookie("GET", "/", cookieJar.getCookieString());
			let response2 = createSimpleRes();
			sessionMiddleware(request2, response2);

			expect(request2.session.testthing).toBe(5486283);
		});
		it("Should get unique session ids", async () => {
			let response = createSimpleRes();
			sessionMiddleware(createSimpleReq("GET", "/"), response);
			let cookieJar1 = new BCookieJar();
			cookieJar1.addCookie(response.getHeader("set-cookie"));

			let response2 = createSimpleRes();
			sessionMiddleware(createSimpleReq("GET", "/"), response2);
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
			let response = createSimpleRes();
			let request = createSimpleReq("GET", "/");
			
			sessionMiddleware(request, response);
			await userMiddleware(request, response);

			expect(request.session.userId).not.toBeDefined();
			expect(request.user).toBe(null);
		});
		it("should set user on request when userId is defined correctly", async () => {
			let response = createSimpleRes();
			let request = createSimpleReq("GET", "/");
			
			sessionMiddleware(request, response);
			await userMiddleware(request, response);

			request.session.userId = 1;
			
			let cookieJar = new BCookieJar();
			cookieJar.addCookie(response.getHeader("set-cookie"));

			let request2 = createReqWithCookie("GET", "/", cookieJar.getCookieString());
			let response2 = createSimpleRes();
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
			let request = createSimpleReq("GET", "/");
			queryMiddleware(request, httpMocks.createResponse());
			expect(request.query).toEqual({});
		});

		it("should parse querystrings correctly", async () => {
			let raw = {
				first: "kadof kaofk eof%32kao&32ekf ?=) 42890+ +5i 9??///2\\31454i392 jååæ",
				["dkfoe&?/=\\åæ+   ef%20"]: "lg+ålæø,.-=)(?/\\21%&392%32"
			};
			                                                                          /*Some random characters that might break it*/
			let request = createSimpleReq("GET", "/?" + querystring.encode(raw));
			queryMiddleware(request, httpMocks.createResponse());
			expect(request.query).toEqual(raw);
		});
	});

	describe("request handler", function() {
		const {RequestHandler} = require("../../backend/request-handler");
		it("Should route missing endpoints to default handler", async () => {
			let callCount = 0;
			let requestHandler = new RequestHandler((req, res) => {
				callCount++;
			});
			let wrongCallCount = 0;
			requestHandler.addEndpoint("GET", "/", (req, res) => {
				wrongCallCount++;
			});
			await requestHandler.handleRequest(createSimpleReq("GET", "/dfea"), createSimpleRes());
			await requestHandler.handleRequest(createSimpleReq("GET", ""), createSimpleRes());
			await requestHandler.handleRequest(createSimpleReq("GET", "wdwdawdaw/dvef/dfe"), createSimpleRes());
			await requestHandler.handleRequest(createSimpleReq("POST", "/"), createSimpleRes());
			expect(callCount).toBe(4);
			expect(wrongCallCount).toBe(0);
		});
		it("Should route endpoints to the correct endpoint handler", async () => {
			let defCallCount = 0;
			let requestHandler = new RequestHandler((req, res) => {
				defCallCount++;
			});

			let aCallCount = 0;
			requestHandler.addEndpoint("GET", "/a", (req, res) => {
				bCallCount++;
			});
			let bCallCount = 0;
			requestHandler.addEndpoint("POST", "/b", (req, res) => {
				aCallCount++;
			});
			await requestHandler.handleRequest(createSimpleReq("GET", "/a"), createSimpleRes());
			await requestHandler.handleRequest(createSimpleReq("POST", "/a"), createSimpleRes());
			await requestHandler.handleRequest(createSimpleReq("GET", "/b"), createSimpleRes());
			await requestHandler.handleRequest(createSimpleReq("POST", "/b"), createSimpleRes());
			await requestHandler.handleRequest(createSimpleReq("GET", ""), createSimpleRes());
			await requestHandler.handleRequest(createSimpleReq("GET", "&sdfef"), createSimpleRes());
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
			await requestHandler.handleRequest(createSimpleReq("GET", "/"), createSimpleRes());
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

			await requestHandler.handleRequest(createSimpleReq("GET", "/"), createSimpleRes());
			
			await requestHandler.handleRequest(createSimpleReq("GET", "539234"), createSimpleRes());
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
			await requestHandler.handleRequest(createSimpleReq("GET", "/"), createSimpleRes());
			expect(thrownError).toBe(errorToThrow);
		});
	});

	describe("/login endpoint", function() {
		it("Should be able to login to normal user with correct username and password", async () => {
			let request = createPostReq("/login", querystring.encode({username: "bob", password: "password"}));
			let response = createSimpleRes();
			let p = awaitResponse(response);
			serverRequestHandler.handleRequest(request, response);
			await p;

			expect(request.session.userId).toBe(1);
			expect(response.statusCode).toBe(302);
			expect(response.getHeader("Location")).toBe(`/store?storeid=4563`);
		});
		it("Should be able to login to superuser with correct username and password", async () => {
			let request = createPostReq("/login", querystring.encode({username: "superbob", password: "hunter2"}));
			let response = createSimpleRes();
			let p = awaitResponse(response);
			serverRequestHandler.handleRequest(request, response);
			await p;

			expect(request.session.userId).toBe(2);
			expect(response.statusCode).toBe(302);
			expect(response.getHeader("Location")).toBe(`/admin?storeid=4563`);
		});
		it("shouldnt be able to login with incorrect password", async () => {
			let request = createPostReq("/login", querystring.encode({username: "bob", password: "srgarg"}));
			let response = createSimpleRes();
			let p = awaitResponse(response);
			serverRequestHandler.handleRequest(request, response);
			await p;

			expect(request.session.userId).not.toBeInstanceOf(Number);
			expect(response.statusCode).toBe(302);
			expect(response.getHeader("Location")).toBe(`/login`);
		});
		it("shouldnt be able to login with incorrect username and password", async () => {
			let request = createPostReq("/login", querystring.encode({username: "bobefef", password: "hunter2"}));
			let response = createSimpleRes();
			let p = awaitResponse(response);
			serverRequestHandler.handleRequest(request, response);
			await p;

			expect(request.session.userId).not.toBeInstanceOf(Number);
			expect(response.statusCode).toBe(302);
			expect(response.getHeader("Location")).toBe(`/login`);
		});
	});
	describe("timeslot creator", function () {
		const { createTimeSlots } = require("../../backend/timeslot-creator");
		let timeslotCreatorDb;
		beforeAll(async () => {
			timeslotCreatorDb = new sqlite3.Database(":memory:");
			let databaseCreationCommand = (await fs.readFile(__dirname + "/../../backend/database_creation.sql")).toString();
			
			/* Execute the database creation commands */
			await dbExec(timeslotCreatorDb, databaseCreationCommand);
			await dbExec(timeslotCreatorDb, `
				INSERT INTO store (id, name, openingTime, apiKey, storeEmail) VALUES
					(4563, "dkfaoef", 
					'{"monday": ["08:00:00", "17:00:00"],' || 
					'"tuesday": ["08:00:00", "17:00:00"],' ||
					'"wednesday": ["08:00:00", "17:00:00"],' ||
					'"thursday": ["08:00:00", "17:00:00"],' ||
					'"friday": ["08:00:00", "17:00:00"],' ||
					'"saturday": ["10:00:00", "12:30:00"],' ||
					'"sunday": []}', 
					"ksokg", "dkfaoef@mail.com"
				);
				INSERT INTO queue (id, latitude, longitude, size, storeId, queueName) VALUES
					(1, 0, 0, 1, 4563, "Queue number 1!");
				
				INSERT INTO timeSlot (id, storeId, startTime, endTime, queueId) VALUES
					(1, 4563, "2021-05-05T11:00:00", "2021-05-05T11:30:00", 1),
					(2, 4563, "2021-05-05T11:30:00", "2021-05-05T12:00:00", 1);
				
				INSERT INTO package (guid, storeId, bookedTimeId, customerEmail, creationDate, readyState) VALUES
					("12155", 4563, 1, "", "", ${ReadyState.NotDelivered}),
					("1234", 4563, 2, "", "", ${ReadyState.NotDelivered});

				INSERT INTO timeSlot (id, storeId, startTime, endTime, queueId) VALUES
					(3, 4563, "2021-05-05T12:00:00", "2021-05-05T12:15:00", 1),
					(4, 4563, "2021-05-05T12:15:00", "2021-05-05T12:30:00", 1),
					(5, 4563, "2021-05-05T12:30:00", "2021-05-05T12:45:00", 1),
					(6, 4563, "2021-05-05T12:45:00", "2021-05-05T13:00:00", 1);

				INSERT INTO package (guid, storeId, bookedTimeId, customerEmail, creationDate, readyState) VALUES
					("12341", 4563, 3, "", "", ${ReadyState.NotDelivered}),
					("12342", 4563, 4, "", "", ${ReadyState.NotDelivered}),
					("12343", 4563, 5, "", "", ${ReadyState.NotDelivered}),
					("12344", 4563, 6, "", "", ${ReadyState.NotDelivered});

				INSERT INTO timeSlot (id, storeId, startTime, endTime, queueId) VALUES
					(7, 4563, "2021-05-05T13:00:00", "2021-05-05T13:15:00", 1),
					(8, 4563, "2021-05-05T13:15:00", "2021-05-05T13:30:00", 1),
					(9, 4563, "2021-05-05T13:30:00", "2021-05-05T13:45:00", 1),
					(10, 4563, "2021-05-05T13:45:00", "2021-05-05T14:00:00", 1);
					
				INSERT INTO package (guid, storeId, bookedTimeId, customerEmail, creationDate, readyState) VALUES
					("12345", 4563, 7, "", "", ${ReadyState.NotDelivered}),
					("12346", 4563, 8, "", "", ${ReadyState.NotDelivered}),
					("12347", 4563, 9, "", "", ${ReadyState.NotDelivered});

				INSERT INTO timeSlot (id, storeId, startTime, endTime, queueId) VALUES
					(11, 4563, "2021-05-05T14:00:00", "2021-05-05T14:15:00", 1),
					(12, 4563, "2021-05-05T14:15:00", "2021-05-05T14:30:00", 1),
					(13, 4563, "2021-05-05T14:30:00", "2021-05-05T14:45:00", 1),
					(14, 4563, "2021-05-05T14:45:00", "2021-05-05T15:00:00", 1);
					
				INSERT INTO package (guid, storeId, bookedTimeId, customerEmail, creationDate, readyState) VALUES
					("12348", 4563, 11, "", "", ${ReadyState.NotDelivered});
			`);
		});
		it("Should create 4 timeslots since the 2 was filled before", async () => {
			await createTimeSlots(timeslotCreatorDb, moment("2021-05-07T14:00:00"));
			let res = await dbGet(timeslotCreatorDb, `SELECT COUNT(*) as cnt FROM timeSlot WHERE startTime >= "2021-05-12T11:00:00" AND endTime <= "2021-05-12T12:00:00"`);
			expect(res.cnt).toBe(4);

			let res2 = await dbGet(timeslotCreatorDb, `SELECT COUNT(*) as cnt FROM timeSlot WHERE startTime >= "2021-05-12T12:00:00" AND endTime <= "2021-05-12T13:00:00"`);
			expect(res2.cnt).toBe(8);

			let res3 = await dbGet(timeslotCreatorDb, `SELECT COUNT(*) as cnt FROM timeSlot WHERE startTime >= "2021-05-12T13:00:00" AND endTime <= "2021-05-12T14:00:00"`);
			expect(res3.cnt).toBe(4);

			let res4 = await dbGet(timeslotCreatorDb, `SELECT COUNT(*) as cnt FROM timeSlot WHERE startTime >= "2021-05-12T14:00:00" AND endTime <= "2021-05-12T15:00:00"`);
			expect(res4.cnt).toBe(2);
		});
	});
	describe("API", function() {
		it("Should add one package into the database with the correct field values", async () => {
			/* Example order for John Doe using a store with the api key "ksokg" */
			let postBody = {
                customerName: "John Doe",
                customerEmail: "johndoe@mail.com",
                orderId: "#1",
                apiKey: "ksokg"
            }

			let request = createPostReq("/api/add_package", querystring.encode(postBody));
			let response = createSimpleRes();
			let p = awaitResponse(response);
			serverRequestHandler.handleRequest(request, response);
			await p;

			/* Did the response turn out good? */
			expect(response.statusCode).toBe(200);

			/* Is there a package with the correct field values in the database?
			*  customerName: 'John Doe'
			*  customerEmail: 'johndoe@mail.com'
			*  externalOrderId: '#1'
			*/
			let packages = await dbGet(db, `SELECT COUNT(*) as count FROM package WHERE customerName == 'John Doe' AND customerEmail == 'johndoe@mail.com' AND externalOrderId == '#1'`);
			
			expect(packages.count).toBe(1);
		});
		it("Should not add a new package if the api key doesn't exist in our database", async () => {
			/* Example order for John Doe using an api key that doesn't exist */
			let postBody = {
                customerName: "John Doe",
                customerEmail: "johndoe@mail.com",
                orderId: "#2",
                apiKey: "wrongKey"
            }

			let request = createPostReq("/api/add_package", querystring.encode(postBody));
			let response = createSimpleRes();
			let p = awaitResponse(response);
			serverRequestHandler.handleRequest(request, response);
			await p;

			/* Did the response turn out as an error? */
			expect(response.statusCode).toBe(400);
		});
		it("Should add the package to the correct store", async () => {
			/* Example order for John Doe using a store with the api key "ksokg" */
			let postBody = {
                customerName: "John Doe",
                customerEmail: "johndoe@mail.com",
                orderId: "#3",
                apiKey: "ksokg"
            }

			let request = createPostReq("/api/add_package", querystring.encode(postBody));
			let response = createSimpleRes();
			let p = awaitResponse(response);
			serverRequestHandler.handleRequest(request, response);
			await p;

			/* Did the response turn out good? */
			expect(response.statusCode).toBe(200);

			/* Do we have an order in the database with the order id '#3'? */
			let package = await dbGet(db, `SELECT * FROM package WHERE externalOrderId == '#3'`);
			expect(package).toBeDefined();

			/* Is the store id of the package the same store id as the store with the api key? */
			let store = await dbGet(db, `SELECT * FROM store WHERE apiKey == 'ksokg'`);
			expect(package.storeId).toBe(store.id);
		});
	});
});
