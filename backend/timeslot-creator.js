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

	let timeSlots = [];

	await Promise.all(stores.map(async (store) => {
		let queues = await dbAll(db, "select * from queue where storeId = ?", [store.id]);
		console.log("huh");
		let store_open = getTimeParts(store.openingTime);
		let store_close = getTimeParts(store.closingTime);
		if (store_open == null || store_close == null) {
			throw new Error("Store with id " + store.id.toString() + " has ill formated opening/closing time");
		}

		await Promise.all(queues.map(async (queue) => {
			let lastTimeSlot = await dbGet(db, "select * from timeSlot where queueId=? order by endTime desc limit 1", [queue.id]);
			console.log(lastTimeSlot);
			let earliestTime = getEarliestTime(store.openingTime, store.closingTime, moment(lastTimeSlot?.endTime ?? now));
			for (let day = Math.abs(earliestTime.diff(now, "days")); day < 7; day++) {
				console.log(earliestTime);
				if (earliestTime == null) {
					earliestTime = moment(lastTimeSlot).add(day, "day").hour(store_open.hour).minute(store_open.minute).second(store_open.second);
					continue;
				}
				const timeSlotLength = 15
				for (let yep = moment(earliestTime); isBetween(store.openingTime, store.closingTime, yep, moment(yep).add(timeSlotLength, "minute"));) {
					timeSlots.push([yep.format("YYYY-MM-DDTHH:mm:ss"), yep.add(timeSlotLength, "minute").format("YYYY-MM-DDTHH:mm:ss"), store.id, queue.id]);
					
				}
				earliestTime.add(1, "day").hour(store_open.hour).minute(store_open.minute).second(store_open.second);
			}
		}));
	}));

	console.log(timeSlots);


	await new Promise((resolve, reject) => {
		db.serialize(() => {
			let stmt = db.prepare("INSERT INTO timeSlot (startTime, endTime, storeId, queueId) VALUES (?,?,?,?)");
			db.parallelize(() => {
				timeSlots.forEach(v => {
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

function getEarliestTime(openingTime, closingTime, lastTimeSlotEnd) {
	let lastRoundedUp = roundUpHour(lastTimeSlotEnd);
	console.log(lastRoundedUp);
	if (isBetween(openingTime, closingTime, lastRoundedUp, lastRoundedUp)) {
		return lastRoundedUp;
	}
	return null;
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

function isBetween(beginhhmmss, endhhmmss, startTimeSlot, endTimeSlot) {
	let formattedStart = startTimeSlot.format("HH:mm:ss");
	let formattedEnd = endTimeSlot.format("HH:mm:ss");
	if (formattedStart >= beginhhmmss && formattedEnd <= endhhmmss) {
		return true;
	} else {
		return false;
	}
}

function roundUpHour(m) {
	let roundUp = m.minute() || m.second() || m.millisecond() ? m.add(1, 'hour').startOf('hour') : m.startOf('hour');
	return roundUp;
}

main();