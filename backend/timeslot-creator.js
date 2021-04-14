const sqlite3 = require("sqlite3");
const moment = require("moment");
const { dbGet, dbExec } = require("./db-helpers");
const fs = require("fs/promises");

async function main() {
	db = new sqlite3.Database(__dirname + "/../databasen.sqlite3");

    let databaseCreationCommand = (await fs.readFile(__dirname + "/database_creation.sql")).toString();

    console.log("Configuring database");
    
    /* Execute the database creation commands */
    await dbExec(db, databaseCreationCommand);

    console.log("Database correctly configured");
	let now = moment();
	let lastTimeslot = await dbGet(db, "select * from timeSlot ORDER BY endTime DESC LIMIT 1;");
	
	let beginningTime = moment(lastTimeslot.startTime);
	
	if (now.isAfter(lastTimeslot)) {
		beginningTime = now;
	}
	console.log(beginningTime);
}

main();