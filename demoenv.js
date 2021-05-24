const {dbAll, dbGet, dbRun, dbExec} = require("./backend/db-helpers");
const sqlite3 = require("sqlite3");
const fs = require("fs/promises")

async function main() {
	let db = new sqlite3.Database(__dirname + "/databasen.sqlite3");

	let tables = await dbAll(db, `
		select name from sqlite_master where type="table";
	`);

	let indices = await dbAll(db, `
		select name from sqlite_master where type="index";
	`);

	for (let index of indices) {
		await dbExec(db, `drop index ${index.name}`);
	}

	for (let table of tables) {
		if (table.name == "sqlite_sequence") {
			continue;
		}
		await dbExec(db, `drop table ${table.name}`);
	}

    let databaseCreationCommand = (await fs.readFile(__dirname + "/backend/database_creation.sql")).toString();

	await dbExec(db, databaseCreationCommand);

	let databaseCreateDemoEnv = (await fs.readFile(__dirname + "/backend/create_demo_env.sql")).toString();

	await dbExec(db, databaseCreateDemoEnv);

	await new Promise((resolve, reject) => {
		db.close((err) => {
			if (err) {
				reject(err);
			}
			resolve();
		});
	});
	console.log("Done")
}

main();