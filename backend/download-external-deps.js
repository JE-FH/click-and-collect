const fs = require("fs/promises");
const {constants} = require("fs");
const fetch = require("node-fetch");
async function main() {
	console.log("Attempting to create frontend/js/external folder")
	try {
		//Attempt to create the folder
		await fs.mkdir(__dirname + "/../frontend/js/external");
	} catch(e) {
		//EEXIST means that the folder already exists, so we dont care about that, in any other case we rethrow
		if (e.code != "EEXIST") {
			throw e;
		}
	}
	try {
		//We test if the file exists
		await fs.access(__dirname + "/../frontend/js/external/qr-scanner.umd.min.js", constants.F_OK);
	} catch(e) {
		//ENOENT means that the file doesnt exists
		if (e.code == "ENOENT") {
			//Get the file from the cdn
			console.log("Acquiring qr-scanner.umd.min.js");
			let content = await fetch("https://cdn.jsdelivr.net/npm/qr-scanner@1.2.0/qr-scanner.umd.min.js")
				.then(response => response.text());
			await fs.writeFile(__dirname + "/../frontend/js/external/qr-scanner.umd.min.js", content);
		}
	}

	try {
		//We test if the file exists
		await fs.access(__dirname + "/../frontend/js/external/qr-scanner-worker.min.js", constants.F_OK);
	} catch(e) {
		//ENOENT means that the file doesnt exists
		if (e.code == "ENOENT") {
			//Get the file from the cdn
			console.log("Acquiring qr-scanner-worker.min.js");
			let content = await fetch("https://cdn.jsdelivr.net/npm/qr-scanner@1.2.0/qr-scanner-worker.min.js")
				.then(response => response.text());
			
			await fs.writeFile(__dirname + "/../frontend/js/external/qr-scanner-worker.min.js", content);
		}
	}
	console.log("All files were acquired succefully");
}

main();
