//First we need to ask for access to the camera
navigator.mediaDevices.getUserMedia({video: true, audio: false})
.then(function(stream) {
	stream.getTracks().forEach((track) => {
		track.stop();
	})
	document.getElementById("loading-placeholder").classList.add("hidden");
	document.getElementById("controls-container").classList.remove("hidden");
	QrScanner.WORKER_PATH = "/static/js/external/qr-scanner-worker.min.js";
	
	const qrScanner = new QrScanner(document.getElementById("scanner-content"), result => {
		console.log("Found qr code " + result);
		document.getElementById("validation-key-input").value = result;
		qrScanner.stop();
	}, (err) => {
		if (err != "No QR code found") {
			console.log(err);
		}
	});

	qrScanner.start();
	
	document.getElementById("start-scanner-btn").addEventListener("click", (ev) => {
		qrScanner.start();
	})
	document.getElementById("stop-scanner-btn").addEventListener("click", (ev) => {
		qrScanner.stop();
	});
}).catch(err => {
	if (err.name == "NotAllowedError") {
		document.write("Could not gain access: " + err.toString());
	} else {
		throw err;
	}
});

let validationKeyInput = document.getElementById('validation-key-input');
function toggleValidationInput(){
	validationKeyInput.readOnly = !validationKeyInput.readOnly;
	if (elm.readOnly){
		validationKeyInput.classList.add("locked");
	} else{
		validationKeyInput.classList.remove("locked");
	}
}

validationKeyInput.readOnly = true;
