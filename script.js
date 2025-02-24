// Set up the Leaflet map
const map = L.map('map').setView([32.0853, 34.7818], 13); // Centred on Tel Aviv
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Define line colours
const lineColours = {
    "M1": "#0971ce", //blue
    "M2": "#fd6b0d", //orange
    "M3": "#fec524", //yellow 
    "red": "red",
    "green": "green",
    "purple": "purple"
};


// Finds routes whose start is within a given tolerance (in meters) of the current route's end
function findConnectedRoutes(currentRoute) {
    const lastCoord = currentRoute[currentRoute.length - 1];
    const tolerance = 100; // meters - adjust as needed
    const connected = [];

    // Loop over all route objects (from the same line, if desired)
    routes.forEach(routeObj => {
        // Skip the current route (if it's the same object)
        if (routeObj.coordinates === currentRoute) return;

        const startCoord = routeObj.coordinates[0];
        // Compute the distance between current end and candidate start
        const dist = turf.distance(turf.point(lastCoord), turf.point(startCoord), { units: "meters" });
        if (dist < tolerance) {
            connected.push(routeObj);
        }
    });
    return connected;
}


// Load GeoJSON data
let routes = [];
let stations = [];
let trains = [];

Promise.all([
    fetch('data/dantat_metro_lines.geojson').then(res => res.json()),
    fetch('data/dantat_metro_stations.geojson').then(res => res.json())
]).then(([linesData, stationsData]) => {
    // In your Promise.all() .then callback:
    routes = linesData.features.flatMap(feature => {
        const lineId = feature.properties.NAME.trim();
        if (feature.geometry.type === "MultiLineString") {
            // For each branch, return a route object
            return feature.geometry.coordinates.map(branch => ({
                coordinates: branch,
                lineId: lineId
            }));
        } else {
            return [{
                coordinates: feature.geometry.coordinates,
                lineId: lineId
            }];
        }
    });

    // let linesGrouped = {};
    // routes.forEach(routeObj => {
    //     if (!linesGrouped[routeObj.lineId]) {
    //         linesGrouped[routeObj.lineId] = [];
    //     }
    //     linesGrouped[routeObj.lineId].push(routeObj);
    // });

    routeConnections = {};

    // Populate connections
    routes.forEach(routeObj => {
        const start = JSON.stringify(routeObj.coordinates[0]); // First point
        const end = JSON.stringify(routeObj.coordinates[routeObj.coordinates.length - 1]); // Last point

        if (!routeConnections[start]) routeConnections[start] = [];
        if (!routeConnections[end]) routeConnections[end] = [];

        routeConnections[start].push(routeObj);
        routeConnections[end].push(routeObj);
    });

    stations = stationsData.features.map(feature => feature.geometry.coordinates);
    console.log("Routes loaded:", routes);
    console.log("Stations loaded:", stations);
    startSimulation(); // Now that data is loaded, start the simulation
});


// Train settings
const trainSpeed = 60 * 1000 / 3600; // 60 km/h → meters per second
const dwellTime = 5; // Seconds to stop at each station
const timeScale = 60; // 1 real second = 1 simulated minute

// Train object
class Train {
    constructor(route, line, distanceOffset) {
        this.route = route;
        this.currentDistance = 0 + distanceOffset; // offset to stagger trains
        this.totalDistance = turf.length(turf.lineString(route)) * 1000; // total length in meters
        this.colour = lineColours[line] || "grey"; // fallback color

        // Extract label (number for metro, letter for light rail)
        let label = line.match(/^M(\d+)$/) ? line.match(/^M(\d+)$/)[1] : line.charAt(0).toUpperCase();

        this.marker = L.marker([route[0][1], route[0][0]], {
            icon: L.divIcon({
                className: "train-marker",
                html: label,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
                popupAnchor: [0, -12]
            })
        }).addTo(map);
        this.marker.getElement().style.backgroundColor = this.colour;
        
        this.direction = 1; // 1 for forward, -1 for reverse
        this.isPaused = false;
        this.pauseUntil = 0;
    }

    update(deltaTime) {
        if (this.isPaused) {
            if (Date.now() >= this.pauseUntil) this.isPaused = false;
            return;
        }
        
        // Update currentDistance along the route using the current direction.
        // (trainSpeed is in m/s, timeScale speeds up the simulation.)
        this.currentDistance += trainSpeed * deltaTime * timeScale * this.direction;
        
        // Check if we overshot either endpoint and reverse direction if needed.
        if (this.currentDistance >= this.totalDistance) {
            // Clamp at the end and reverse direction.
            this.currentDistance = this.totalDistance;
            this.direction = -1;
            // (Optionally, you can add a dwell time at the terminal here.)
        } else if (this.currentDistance <= 0) {
            // Clamp at the start and reverse direction.
            this.currentDistance = 0;
            this.direction = 1;
            // (Optionally, add a dwell time at the terminal.)
        }
        
        // When moving backward, measure the position from the end of the line.
        let effectiveDistance = (this.direction === 1)
            ? this.currentDistance 
            : this.totalDistance - this.currentDistance;
        
        let posFeature = turf.along(
            turf.lineString(this.route),
            effectiveDistance / 1000, // turf.along expects km
            { units: "kilometers" }
        );
        
        if (posFeature && posFeature.geometry && posFeature.geometry.coordinates) {
            let newPos = posFeature.geometry.coordinates;
            this.marker.setLatLng([newPos[1], newPos[0]]);
        }
    }
    
    
}


// Define headways (in minutes) based on your frequency table
const lineHeadways = {
    "M1": 3, // TODO: based on frequencues
    "M2": 3,
    "M3": 3
};

// Function to estimate train count dynamically
function calculateTrainsForLine(lineId) {
    const headway = lineHeadways[lineId];
    const routeDistanceKm = turf.length(turf.lineString(routes.find(r => r.lineId === lineId).coordinates));
    const travelTimeMinutes = (routeDistanceKm / (trainSpeed * 3.6)) * 60; // Convert to minutes

    return Math.round(travelTimeMinutes / headway); // Total trains on the line
}



// Start simulation function
function startSimulation() {
    // Group routes by line if not already done
    let linesGrouped = {};
    routes.forEach(routeObj => {
        if (!linesGrouped[routeObj.lineId]) {
            linesGrouped[routeObj.lineId] = [];
        }
        linesGrouped[routeObj.lineId].push(routeObj);
    });

    // For each line group, spawn trains for the whole line
    Object.keys(linesGrouped).forEach(lineId => {
        const segments = linesGrouped[lineId];
        // Use the first segment as a representative for calculating train count
        const representativeRoute = segments[0];
        // const numTrains = calculateTrainsForLine(representativeRoute);
        const numTrains = 1;
        console.log(`Spawning ${numTrains} trains on line ${lineId}`);
        for (let i = 0; i < numTrains; i++) {
            // Pick an initial segment from the group at random
            let initialSegment = segments[Math.floor(Math.random() * segments.length)].coordinates;
            console.log(`Spawning train on ${lineId} with route:`, initialSegment);
            trains.push(new Train(initialSegment, lineId, 0)); //TODO: add distance offset
            console.log("train spawned successfully");
        }
    });

    // Initialize lastTime before starting the animation loop
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

function animate() {
    console.log("Animation running...");
    let now = Date.now();
    let deltaTime = (now - lastTime) / 1000;
    lastTime = now;

    trains.forEach(train => train.update(deltaTime));
    requestAnimationFrame(animate);
}