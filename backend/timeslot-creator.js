const sqlite3 = require("sqlite3");
const moment = require("moment");
const { dbGet, dbExec, dbAll } = require("./db-helpers");
const fs = require("fs/promises");
const { isStringInt } = require("./helpers");

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
	let stores = await dbAll(db, "select * from store")

	stores.forEach((store) => {
		let queueAgnosticTimeslots = [];
		let store_open = getTimeParts(store.openingTime);
		let store_close = getTimeParts(store.closingTime);
		if (store_open == null || store_close == null) {
			throw new Error("Store with id " + store.id.toString() + " has ill formated opening/closing time");
		}
		console.log(store_open, store_close);
		for (let current_time = moment(beginningTime); current_time.isBefore(applicable_range_end); current_time.add(1, "hour")) {
			addIfBetween(queueAgnosticTimeslots, moment(current_time).add(0, "minute"), moment(current_time).add(15, "minute"), store_open, store_close);
			addIfBetween(queueAgnosticTimeslots, moment(current_time).add(15, "minute"), moment(current_time).add(30, "minute"), store_open, store_close);
			addIfBetween(queueAgnosticTimeslots, moment(current_time).add(30, "minute"), moment(current_time).add(45, "minute"), store_open, store_close);
			addIfBetween(queueAgnosticTimeslots, moment(current_time).add(45, "minute"), moment(current_time).add(60, "minute"), store_open, store_close);

		}
		console.log(queueAgnosticTimeslots);
	});
	

	
	/*
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
*/
	db.close();
}

function addIfBetween(target, start, end, storeOpenParts, storeCloseParts) {
	if (isBetween(storeOpenParts, storeCloseParts, start, end)) {
		target.push({start: start, end: end});
	}
}

function getTimeParts(hhmmss) {
	let parts = hhmmss.split(":");
	if (!isStringInt(parts[0]) || !isStringInt(parts[1]) || !isStringInt(parts[2])) {
		return null;
	}
	
	return {
		hour: Number(parts[0]),
		minute: Number(parts[1]),
		second: Number(parts[2])
	};
}

function isBetween(beginTimeParts, endTimeParts, startTimeSlot, endTimeSlot) {
	let sh = startTimeSlot.get("hour");
	let sm = startTimeSlot.get("minute");
	let ss = startTimeSlot.get("second");
	let eh = endTimeSlot.get("hour");
	let em = endTimeSlot.get("minute");
	let es = endTimeSlot.get("second");

	return sh >= beginTimeParts.hour && sm >= beginTimeParts.minute && ss >= beginTimeParts.second &&
		eh <= endTimeParts.hour && em <= endTimeParts.minute && es <= endTimeParts.second;
	
}

function roundUpHour(m) {
	let roundUp = m.minute() || m.second() || m.millisecond() ? m.add(1, 'hour').startOf('hour') : m.startOf('hour');
	return roundUp;
}

main();