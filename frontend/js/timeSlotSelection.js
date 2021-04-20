var modal = document.getElementById("myModal");
var btn = document.getElementById("myBtn");
var span = document.getElementsByClassName("close")[0];

var elements = document.querySelectorAll("button[data-id]");
for (var i = 0; i < elements.length; i++) {
    (elements)[i].addEventListener("click", function () {
        modal.style.display = "block";


        var dataId = this.getAttribute('data-id');

        var x = this.innerHTML;

        document.getElementById("selectedTime").innerHTML = x;
        document.getElementById("selected-time-id").value = dataId;
    });
}

span.onclick = function () {
    modal.style.display = "none";
}

window.onclick = function (event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}