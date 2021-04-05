let center = (queues[0] == null) ? [10.7, 56] : [queues[0].longitude, queues[0].latitude];
let zoom = (queues[0] == null) ? 7 : 18;

let map = new ol.Map({
	target: 'queue-placement-map',
	layers: [
		new ol.layer.Tile({
			source: new ol.source.OSM()
		})
	],
	view: new ol.View({
		center: ol.proj.fromLonLat(center),
		zoom: zoom
	})
});

let selectedFeature = new ol.Feature({
	geometry: new ol.geom.Point(ol.proj.transform([0, 0], 'EPSG:4326', 'EPSG:3857'))
});

let alreadyExistingLocations = queues.map((queue) => {
	return new ol.Feature({
		geometry: new ol.geom.Point(ol.proj.transform([queue.longitude, queue.latitude], 'EPSG:4326', 'EPSG:3857'))
	});
});
/*TODO: Download ikonerne til vores server */
var selectedStyle = new ol.style.Style({
	image: new ol.style.Icon(({
		anchor: [0.5, 1],
		src: "http://cdn.mapmarker.io/api/v1/pin?text=C%26C&size=50&hoffset=1"
	}))
});

var otherStyle = new ol.style.Style({
	image: new ol.style.Icon(({
		anchor: [0.5, 1],
		src: "http://cdn.mapmarker.io/api/v1/pin?text=C%26C&size=50&hoffset=1&background=%23373737"
	}))
});

selectedFeature.setStyle(selectedStyle)

alreadyExistingLocations.forEach((v) => {
	v.setStyle(otherStyle);
})

let vectorSource = new ol.source.Vector({
	features: [...alreadyExistingLocations]
});

let selectedSource = new ol.source.Vector({
	features: [selectedFeature]
});

let vectorLayer = new ol.layer.Vector({
	source: vectorSource
});

let selectedLayer = new ol.layer.Vector({
	source: selectedSource
});

map.addLayer(vectorLayer);
map.addLayer(selectedLayer);

let selectedGeo = selectedFeature.getGeometry();

map.on("click", (e) => {
	selectedGeo.setCoordinates(e.coordinate);
	let real_coordinate = ol.proj.transform(e.coordinate, 'EPSG:3857', 'EPSG:4326');
	console.log(real_coordinate);
	document.getElementById("latitude-input").value = real_coordinate[1];
	document.getElementById("longitude-input").value = real_coordinate[0];
});