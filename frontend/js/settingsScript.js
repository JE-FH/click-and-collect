const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

let openClosePairs = [];

function findOneOrFail(name) {
	let els = document.getElementsByName(name);
	if (els.length != 1) {
		throw new Error("Could not find all input elements, input cant be checked client side");
	}
	return els[0];
}

function fixTime(el) {
	let old = el.value;
	if (el.value.split(":").length == 2) {
		el.value += ":00";
	}
}

DAYS_OF_WEEK.forEach((day) => {
	let open = findOneOrFail(`${day}-open`);
	let close = findOneOrFail(`${day}-close`);
	open.addEventListener("blur", (ev) => fixTime(open))
	close.addEventListener("blur", (ev) => fixTime(close));
	openClosePairs.push({open, close, day});
})

let settingsForm = document.getElementById("settings-form");

if (settingsForm == null) {
	throw new Error("Could not find the settings for, input cant be checked client side");
}

let errorContainer = document.getElementById("error-message");

settingsForm.addEventListener("submit", (ev) => {
	/*Check if every opening and closing time pairs are valid*/
	for (pair of openClosePairs) {
		if (pair.open.value > pair.close.value) {
			errorContainer.classList.remove("hidden");
			errorContainer.innerText = `Error for ${pair.day} the close time cant be before the open time`
			ev.preventDefault();
			return;
		}
	}
})

