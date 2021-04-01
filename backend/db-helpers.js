/*Basically a bunch of functions that makes db function into promises*/
const sqlite3 = require("sqlite3");

/**
 * 
 * @param {sqlite3.Database} db the database to target
 * @param {string} query the sql query to execute
 * @param {any[]} param the parameters to replace ? with
 * @returns {Promise<object[]>} the rows it found
 */
exports.db_all = async function db_all(db, query, param) {
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
exports.db_get = async function db_get(db, query, param) {
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
exports.db_run = async function db_run(db, query, param) {
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
 * @param {any[]} param the parameters to replace ? with
 */
exports.db_exec = async function db_exec(db, query, param) {
	return await new Promise((resolve, reject) => {
		db.exec(query, param, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}