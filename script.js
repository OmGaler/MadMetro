// ----- SET UP LEAFLET MAP -----
const map = L.map('map').setView([32.0853, 34.7818], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// ----- DEFINE LINE COLOURS -----
const lineColours = {
    "M1": "#0971ce", // blue
    "M2": "#fd6b0d", // orange
    "M3": "#fec524", // yellow
    "red": "red",
    "green": "green",
    "purple": "purple"
};

// ----- SERVICE ROUTE FILES -----
// Adjust these filenames to match your actual files.
const serviceRouteFiles = {
    "M1_NESE": "data/dantat_metro_M1_NESE.geojson",
    "M1_NWSE": "data/dantat_metro_M1_NWSE.geojson",
    "M1_NESW": "data/dantat_metro_M1_NESW.geojson",
    "M1_NWSW": "data/dantat_metro_M1_NWSW.geojson",
    "M2": "data/dantat_metro_M2.geojson",
    "M3": "data/dantat_metro_M3.geojson",
    "M3_Shuttle": "data/dantat_metro_M3_shuttle.geojson"
};

// ----- LOAD SERVICE ROUTES -----
// We'll store each route (an array of [lon, lat] coordinates) in serviceRoutes.
const serviceRoutes = {}; // key: service pattern, value: polyline coordinates

Promise.all(Object.keys(serviceRouteFiles).map(key => {
    return fetch(serviceRouteFiles[key])
        .then(res => res.json())
        .then(data => {
            // Assume each file is either a FeatureCollection or a Feature with a LineString geometry.
            let geom;
            if (data.type === "FeatureCollection") {
                geom = data.features[0].geometry;
            } else if (data.type === "Feature") {
                geom = data.geometry;
            } else {
                geom = data;
            }
            let coords;
            if (geom.type === "LineString") {
                coords = geom.coordinates;
            } else if (geom.type === "MultiLineString") {
                // If by any chance it's a MultiLineString, flatten it (this should not be common since you split them manually)
                coords = geom.coordinates.flat();
            }
            serviceRoutes[key] = coords;
            console.log(`Loaded route ${key} with ${coords.length} points.`);
        });
})).then(() => {
    // ----- VISUALISE SERVICE ROUTES -----
    Object.keys(serviceRoutes).forEach(key => {
        const routeCoords = serviceRoutes[key];
        // Convert [lon, lat] to [lat, lon] for Leaflet.
        const latlngs = routeCoords.map(coord => [coord[1], coord[0]]);
        L.polyline(latlngs, {
            color: "green",
            weight: 4,
            opacity: 0.7,
            dashArray: "5,5"
        }).addTo(map).bindPopup(`Service Route: ${key}`);
    });

    // Now start the simulation.
    startSimulation();
});

// ----- TRAIN SIMULATION -----
const trainSpeed = 60 * 1000 / 3600; // 60 km/h in m/s
const timeScale = 60; // 1 real second = 1 simulated minute

// Train class moves a train along a continuous precomputed route.
class Train {
    constructor(routeCoords, label, color, offset = 0) {
        this.route = routeCoords; // array of [lon, lat]
        this.label = label;
        this.color = color;
        // Compute total route length in meters using Turf.js.
        this.totalDistance = turf.length(turf.lineString(this.route)) * 1000;
        this.distance = offset; // initial offset (in meters) along the route
        this.direction = 1; // 1 for forward, -1 for reverse

        // Create a Leaflet marker at the starting position.
        let posFeature = turf.along(turf.lineString(this.route), this.distance / 1000, {
            units: "kilometers"
        });
        let startCoord = posFeature.geometry.coordinates;
        this.marker = L.marker([startCoord[1], startCoord[0]], {
            icon: L.divIcon({
                className: "train-marker",
                html: this.label,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            })
        }).addTo(map);
        this.marker.getElement().style.backgroundColor = color;
    }

    update(deltaTime) {
        // Advance along the route using the current direction.
        this.distance += trainSpeed * deltaTime * timeScale * this.direction;

        // When reaching or overshooting the endpoints, reverse direction.
        if (this.distance >= this.totalDistance) {
            this.distance = this.totalDistance;
            this.direction = -1;
            // Optionally, you can add dwell time here.
        } else if (this.distance <= 0) {
            this.distance = 0;
            this.direction = 1;
            // Optionally, you can add dwell time here.
        }

        // Compute new position along the polyline using Turf's along().
        let posFeature = turf.along(turf.lineString(this.route), this.distance / 1000, {
            units: "kilometers"
        });
        if (posFeature && posFeature.geometry && posFeature.geometry.coordinates) {
            let newPos = posFeature.geometry.coordinates;
            this.marker.setLatLng([newPos[1], newPos[0]]);
        } else {
            console.error("Invalid position computed:", posFeature);
        }
    }
}


// Global array to hold our trains.
let trains = [];

// Start simulation: create one train per service route (you can adjust this as needed).
function startSimulation() {
    Object.keys(serviceRoutes).forEach(key => {
        let route = serviceRoutes[key];
        let color, label;
        if (key.startsWith("M1")) {
            color = lineColours["M1"];
            // Use a simplified label, e.g., strip the "M1_" prefix.
            label = key.replace("M1_", "");
        } else if (key === "M2") {
            color = lineColours["M2"];
            label = "M2";
        } else if (key === "M3") {
            color = lineColours["M3"];
            label = "M3";
        } else if (key === "M3_Shuttle") {
            color = lineColours["M3"];
            label = "M3S";
        } else {
            color = "grey";
            label = key;
        }

        // Create a train with a random starting offset.
        let offset = Math.random() * 1000; // 0 to 1000m
        let train = new Train(route, label, color, offset);
        trains.push(train);
    });

    // Animation loop.
    let lastTime = Date.now();

    function animate() {
        let now = Date.now();
        let deltaTime = (now - lastTime) / 1000;
        lastTime = now;
        trains.forEach(train => train.update(deltaTime));
        requestAnimationFrame(animate);
    }
    animate();
}