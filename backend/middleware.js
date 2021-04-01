const cookie = require('cookie');
const {db_get} = require("./db-helpers");
const querystring = require("querystring");
const crypto = require("crypto");

/* cant contain ( ) < > @ , ; : \ " / [ ] ? = { } per https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie */
const COOKIES_SESSION_ID = "sessid";
/* Seconds until the cookie expires */
const COOKIES_EXPIRE_TIME = 60*60*24; /*24 hours*/
/* This is where all the session data is stored */
let sessionStore = new Map();

exports.sessionMiddleware = function sessionMiddleware(req, res) {
    /* Check if the user has any cookies set in the header */
    if (typeof(req.headers["cookie"]) == "string") {
        let cookies = cookie.parse(req.headers["cookie"]);
        /* Check if the user has the specific cookie where we store session id */
        if (typeof(cookies[COOKIES_SESSION_ID]) == "string") {
            /* Check if that session exists in our session store */
            let store = sessionStore.get(cookies[COOKIES_SESSION_ID]);
            if (store != null) {
                /* Check if the cookie has expired, getTime() returns time in milliseconds*/
                if (new Date().getTime() > store.create_time.getTime() + COOKIES_EXPIRE_TIME * 1000) {
                    sessionStore.delete(cookies[COOKIES_SESSION_ID]);
                } else {
                    req.session = store.data;
                    return;
                }
            }
        }
    }

    /* Client doesnt have a valid session id, so we create one */
    let id = crypto.randomBytes(16).toString("hex");

    if (sessionStore.has(id)) {
        /* session id is already used which has around 1 in 3e+38 chance of happening */
        throw new Error("Super duper unlucky, lets just throw an error");
    }

    /* We add a create time so that we can expire old sessions */
    sessionStore.set(id, {create_time: new Date(), data: {}});

    req.session = sessionStore.get(id).data;

    /* Set the session cookie */
    res.setHeader("Set-Cookie", `${COOKIES_SESSION_ID}=${id};path=/`);
}

/*
 * Checks if the client is logged in and sets req.user to the user object if so
 * to check if the client is logged in, just check if the user object is null
 */
exports.createUserMiddleware = (db) => {
	return async function userMiddleware(req, res) {
		req.user = null;
		if (typeof(req.session.user_id) == "number") {
			req.user = await db_get(db, "SELECT * FROM user WHERE id=?", [req.session.user_id]);
		}
	}
}

exports.queryMiddleware = function queryMiddleware(req, res) {
    let raw_path = req.url.toString();
    
    let [pathPart, queryPart] = raw_path.split("?");
    
    let queryData = null;

    if (queryPart != null) {
        queryData = querystring.parse(queryPart);
    }
    if (queryData == null || typeof(queryData) != "object") {
        queryData = {};
    }

    req.query = queryData;
    req.path = pathPart;
}