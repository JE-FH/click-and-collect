/*Basically a bunch of functions that makes db function into promises*/
const sqlite3 = require("sqlite3");

/**
 * 
 * @param {sqlite3.Database} db the database to target
 * @param {string} query the sql query to execute
 * @param {any[]} param the parameters to replace ? with
 * @returns {Promise<object[]>} the rows it found
 */
exports.dbAll = async function dbAll(db, query, param) {
	return await new Promise((resolve, reject) => {
		db.all(query, param, (err, rows) => {
			if (err) {
				reject(err);
			} else {
			 	resolve(rows);
			}
		});
	});
}

/**
 * 
 * @param {sqlite3.Database} db the database to target
 * @param {string} query the sql query to execute
 * @param {any[]} param the parameters to replace ? with
 * @returns {Promise<object>} the row it found
 */
exports.dbGet = async function dbGet(db, query, param) {
	return await new Promise((resolve, reject) => {
		db.get(query, param, (err, row) => {
			if (err) {
				reject(err);
			} else {
				resolve(row);
			}
		});
	});
}

/**
 * 
 * @param {sqlite3.Database} db the database to target
 * @param {string} query the sql query to execute
 * @param {any[]} param the parameters to replace ? with
 */
exports.dbRun = async function dbRun(db, query, param) {
	return await new Promise((resolve, reject) => {
		db.run(query, param, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

/**
 * 
 * @param {sqlite3.Database} db the database to target
 * @param {string} query the sql query to execute
 */
exports.dbExec = async function dbExec(db, query) {
	return await new Promise((resolve, reject) => {
		db.exec(query, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}