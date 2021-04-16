const sqlite3 = require("sqlite3");
const moment = require("moment");
const { dbGet, dbExec, dbAll } = require("./db-helpers");
const fs = require("fs/promises");

async function main() {
	db = new sqlite3.Database(__dirname + "/../databasen.sqlite3");

    let databaseCreationCommand = (await fs.readFile(__dirname + "/database_creation.sql")).toString();

    console.log("Configuring database");
    
    /* Execute the database creation commands */
    await dbExec(db, databaseCreationCommand);

    console.log("Database correctly configured");
	let now = moment();

	let applicable_range_start = roundUpHour(moment(now));
	let applicable_range_end = moment(applicable_range_start).add(7, "day");

	let lastTimeslot = await dbGet(db, "select * from timeSlot ORDER BY endTime DESC LIMIT 1;");
	
	let beginningTime = roundUpHour(moment(lastTimeslot?.startTime ?? 0));
	
	if (now.isAfter(beginningTime)) {
		beginningTime = roundUpHour(moment(now));
	}

	if (beginningTime.isSameOrAfter(applicable_range_end)) {
		console.log("Cant add anything");
	}

	let queueAgnosticTimeslots = []

	for (let current_time = moment(beginningTime); current_time.isBefore(applicable_range_end); current_time.add(1, "hour")) {
		queueAgnosticTimeslots.push({start: moment(current_time).add(0, "minute"), end: moment(current_time).add(15, "minute")});
		queueAgnosticTimeslots.push({start: moment(current_time).add(15, "minute"), end: moment(current_time).add(30, "minute")});
		queueAgnosticTimeslots.push({start: moment(current_time).add(30, "minute"), end: moment(current_time).add(45, "minute")});
		queueAgnosticTimeslots.push({start: moment(current_time).add(45, "minute"), end: moment(current_time).add(60, "minute")});
	}

	let queues = await dbAll(db, "select * from queue");
	let values = queues.map((queue) => {
		return queueAgnosticTimeslots.map((ts) => {
			return [ts.start.format("YYYY-MM-DDTHH:mm:ss"), ts.end.format("YYYY-MM-DDTHH:mm:ss"), queue.storeId, queue.id];
		})
	}).flat()

	await new Promise((resolve, reject) => {
		db.serialize(() => {
			let stmt = db.prepare("INSERT INTO timeSlot (startTime, endTime, storeId, queueId) VALUES (?,?,?,?)");
			db.parallelize(() => {
				values.forEach(v => {
					stmt.run(v);
				})
			})
			stmt.finalize(() => {
				resolve();
			});
		})
	});

	db.close();
}

function roundUpHour(m) {
	let roundUp = m.minute() || m.second() || m.millisecond() ? m.add(1, 'hour').startOf('hour') : m.startOf('hour');
	return roundUp;
}

main();