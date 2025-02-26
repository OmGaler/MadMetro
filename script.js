//! TODO: preprocess the station distances 
//TODO: up max metro speed to 80kmh, max LRT speed to 70 (ug and 50 overground???), tweak sim speed
//TODO: short turns at elifelet

//TODO: enforce headway separation -Before spawning a new train or allowing a train to depart from a station, check the distance to the train ahead.
//------------------
//pause/play simulation button
//settings screen-
//configurable timescale
//configure service day/times
//------------------

//TODO TODO when spawned, trains travelling in reverse skipp all stations until reversing

//languages

//discalimers
//data from geo.mot.gov.il, openstreetmap
//this is a simulation, not real data
//link to the readme, which contains all the disclaimers

// Initialise Leaflet Map
const map = L.map('map').setView([32.0853, 34.7818], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Define line colours
const lineColours = {
    "M1": "#0971ce", // blue
    "M2": "#fd6b0d", // orange
    "M3": "#fec524", // yellow
    "R": "#ff0000", // red
    "P": "#800080", // purple
    "G": "#008000" // green
};

// Load service routes, split the branches into separate files for ease of simulation 
const serviceRouteFiles = {
    // Metro lines
    "M1_NESE": "data/METRO/dantat_metro_M1_NESE.geojson",
    "M1_NWSE": "data/METRO/dantat_metro_M1_NWSE.geojson",
    "M1_NESW": "data/METRO/dantat_metro_M1_NESW.geojson",
    "M1_NWSW": "data/METRO/dantat_metro_M1_NWSW.geojson",
    "M2": "data/METRO/dantat_metro_M2.geojson",
    "M3": "data/METRO/dantat_metro_M3.geojson",
    "M3_Shuttle": "data/METRO/dantat_metro_M3_shuttle.geojson",
    // Light Rail lines
    "P1": "data/LRT/dankal_lrt_P1.geojson",
    "P2": "data/LRT/dankal_lrt_P2.geojson",
    "R1": "data/LRT/dankal_lrt_R1.geojson",
    "R23": "data/LRT/dankal_lrt_R23.geojson",
    "G1": "data/LRT/dankal_lrt_G1.geojson",
    "G2": "data/LRT/dankal_lrt_G2.geojson",
    "G3": "data/LRT/dankal_lrt_G3.geojson",
    "G4": "data/LRT/dankal_lrt_G4.geojson"
};

let simPaused = false; //global pause flag
// Add event listener to the pause/play button.
document.getElementById("pause").addEventListener("click", function () {
    simPaused = !simPaused;
    this.textContent = simPaused ? "▶" : "⏸";
});
document.getElementById("dayTypeSelect").addEventListener("change", function () {
    updateOperationSettings(document.getElementById("dayTypeSelect").value, document.getElementById("timePeriodSelect").value);
});

document.getElementById("timePeriodSelect").addEventListener("change", function () {
    updateOperationSettings(document.getElementById("dayTypeSelect").value, document.getElementById("timePeriodSelect").value);
});

const settingsButton = document.getElementById("settings");
const settingsModal = document.getElementById("settingsModal");
const closeModal = document.getElementsByClassName("close")[0];

// Open the settings modal and pause simulation.
settingsButton.addEventListener("click", function () {
    settingsModal.style.display = "block";
    simPaused = true;
    document.getElementById("pause").textContent = "▶";
});

// Close the settings modal and resume simulation.
closeModal.addEventListener("click", function () {
    settingsModal.style.display = "none";
    simPaused = false;
    document.getElementById("pause").textContent = "⏸";
});

// Also close the modal if the user clicks outside of the modal content
window.addEventListener("click", function (event) {
    if (event.target === settingsModal) {
        settingsModal.style.display = "none";
        simPaused = false;
        document.getElementById('pause').textContent = "⏸";
    }
});

function updateOperationSettings(day, time) {
    console.log(day, time);
}



// We'll store each route (an array of [lon, lat] coordinates) in serviceRoutes.
let serviceRoutes = {}; // key: service pattern, value: polyline coordinates
let stationsData = null; // will hold the stations GeoJSON


//         //****HIGHLIGHT THE COMPUTED STATIONS STOP POINTS */
//         Object.keys(serviceRoutes).forEach(key => {
//             let routeObj = serviceRoutes[key];
//             let lineStr = turf.lineString(routeObj.coords);
//             // Loop through each computed station distance
//             routeObj.stations.forEach(dist => {
//                 // Use turf.along to compute the coordinate along the route at the given distance (converted to km)
//                 let snapped = turf.along(lineStr, dist / 1000, {
//                     units: "kilometers"
//                 });
//                 if (snapped && snapped.geometry && snapped.geometry.coordinates) {
//                     let coord = snapped.geometry.coordinates;
//                     L.circleMarker([coord[1], coord[0]], {
//                         radius: 4,
//                         color: "red",
//                         fillOpacity: 1
//                     }).addTo(map).bindPopup(`<b>Station on ${key}</b><br>Distance: ${Math.round(dist)} m`);
//                 } else {
//                     console.error(`Could not compute station coordinate at ${dist} m on route ${key}`);
//                 }
//             });
//             // ***** END */
//         });

//         startSimulation();
//     })
//     .catch(error => console.error("Error in loading data:", error));
// let serviceRoutes = {};
fetch('data/preprocessed_station_distances.json')
    .then(res => {
        if (!res.ok) throw new Error("Failed to load preprocessed station distances");
        return res.json();
    })
    .then(data => {
        serviceRoutes = data;
        console.log("Successfully loaded preprocessed service routes and stations:", serviceRoutes);
        // Visualise each route
        Object.keys(serviceRoutes).forEach(key => {
            let routeObj = serviceRoutes[key];
            const latlngs = routeObj.coords.map(coord => [coord[1], coord[0]]);
            L.polyline(latlngs, {
                color: "green",
                weight: 4,
                opacity: 0.7,
                dashArray: "5,5"
            }).addTo(map).bindPopup(`Service Route: ${key}`);

            // Visualise station stop points
            let lineStr = turf.lineString(routeObj.coords);
            routeObj.stations.forEach(dist => {
                let snapped = turf.along(lineStr, dist / 1000, {
                    units: "kilometers"
                });
                if (snapped && snapped.geometry && snapped.geometry.coordinates) {
                    let coord = snapped.geometry.coordinates;
                    L.circleMarker([coord[1], coord[0]], {
                        radius: 4,
                        color: "red",
                        fillOpacity: 1
                    }).addTo(map).bindPopup(`<b>Station on ${key}</b><br>Distance: ${dist} m`);
                }
            });
        });

        startSimulation();
    })
    .catch(error => console.error("Error loading preprocessed data:", error));

// Train simulation
const trainSpeed = 80 * 1000 / 3600; // 80 km/h in m/s
const timeScale = 60; // 1 real second = 1 simulated minute

const DEFAULT_DWELL_TIME = 1; // seconds dwell at each station
const STATION_TOLERANCE = 30; // meters within which a train is considered "at" a station

// Add these constants near the other simulation constants
const VEHICLE_SPEEDS = {
    METRO: 80 * 1000 / 3600, // 80 km/h in m/s
    LRT: 60 * 1000 / 3600 // 60 km/h in m/s
    // LRT_UNDERGROUND: 70 * 1000 / 3600, // 70 km/h in m/s
    // LRT_SURFACE: 50 * 1000 / 3600 // 50 km/h in m/s
};

let serviceTime = "morning_evening";
//frequency = schedule["weekday"]["morning_evening"].tph;
let frequency = 20;
let headway = 60 / frequency;
// Add these constants near the top of your file
const SERVICE_PATTERNS = {
    // Metro lines
    M1: {
        branches: ['M1_NESE', 'M1_NWSE', 'M1_NESW', 'M1_NWSW'],
        frequency: frequency, // combined frequency on core section
        headway: headway, // minutes between trains on core section
        branchFrequency: frequency / 4 // frequency per branch
    },
    M2: {
        branches: ['M2'],
        frequency: frequency,
        headway: headway,
        branchFrequency: frequency // same as frequency since no branches
    },
    M3: {
        branches: ['M3', 'M3_Shuttle'],
        frequency: frequency,
        headway: headway,
        branchFrequency: frequency //no shared section, the shuttle is independent
    },
    // Light Rail lines
    P: {
        branches: ['P1', 'P2'],
        frequency: frequency,
        headway: headway,
        branchFrequency: frequency / 2
    },
    R: {
        branches: ['R1', 'R23'],
        frequency: frequency,
        headway: headway,
        branchFrequency: frequency / 2
    },
    G: {
        branches: ['G1', 'G2', 'G3', 'G4'],
        frequency: frequency,
        headway: headway,
        branchFrequency: frequency / 4
    }
};

// Train class to represent each vehicle which moves along a continuous precomputed route.
class Train {
    constructor(route, label, color, offset = 0) {
        // route is an object with properties: coords (array of [lon, lat]) and stations (array of distances in m)
        this.route = route.coords; // array of [lon, lat]
        this.stations = route.stations; // sorted array of station distances (in m)
        this.label = label;
        this.color = color;
        this.totalDistance = turf.length(turf.lineString(this.route)) * 1000;
        this.distance = offset; // current distance along route (m)
        this.direction = 1; // 1 for forward, -1 for reverse
        this.isDwelling = false;
        this.dwellUntil = 0;
        this.currentStationIndex = 0;
        this.updateNextStationIndex();

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

        // Determine vehicle type from label (Metro if label is "1","2","3", else LRT)
        this.vehicleType = (this.label === "1" || this.label === "2" || this.label === "3") ? 'METRO' : 'LRT_SURFACE';
    }

    // Use an epsilon to avoid repeatedly dwelling at the same station.
    updateNextStationIndex() {
        const epsilon = 5; // 5 meters offset
        if (this.direction === 1) {
            let idx = this.stations.findIndex(d => d > this.distance + epsilon);
            this.currentStationIndex = (idx === -1) ? this.stations.length - 1 : idx;
        } else {
            let idx = -1;
            for (let i = 0; i < this.stations.length; i++) {
                if (this.stations[i] < this.distance - epsilon) {
                    idx = i;
                } else {
                    break;
                }
            }
            this.currentStationIndex = (idx === -1) ? 0 : idx;
        }
    }

    update(deltaTime) {
        // If dwelling, check if dwell time is over.
        if (this.isDwelling) {
            if (Date.now() >= this.dwellUntil) {
                // Nudge the train past the station slightly.
                const epsilon = 5;
                this.distance += this.direction * epsilon;
                this.isDwelling = false;
                this.updateNextStationIndex();
            } else {
                return;
            }
        }

        // Save previous distance before advancing.
        const prevDistance = this.distance;
        // Use the appropriate speed based on the vehicle type.
        const VEHICLE_SPEEDS = {
            METRO: 80 * 1000 / 3600, // 80 km/h in m/s
            LRT: 60 * 1000 / 3600 // 60 km/h in m/s
        };
        const currentSpeed = (this.vehicleType === 'METRO') ? VEHICLE_SPEEDS.METRO : VEHICLE_SPEEDS.LRT;
        this.distance += currentSpeed * deltaTime * timeScale * this.direction;

        // Terminal reversal check.
        if (this.distance >= this.totalDistance) {
            this.distance = this.totalDistance;
            this.direction = -1;
            this.isDwelling = true;
            this.dwellUntil = Date.now() + DEFAULT_DWELL_TIME * 1000;
            this.currentStationIndex = this.stations.length - 1;
            return;
        } else if (this.distance <= 0) {
            this.distance = 0;
            this.direction = 1;
            this.isDwelling = true;
            this.dwellUntil = Date.now() + DEFAULT_DWELL_TIME * 1000;
            this.currentStationIndex = 0;
            return;
        }
        // Station dwell check: if we've passed a station, snap back to it.
        if (this.stations.length > 0) {
            let target = this.stations[this.currentStationIndex];
            if (this.direction === 1 && prevDistance < target && this.distance >= target) {
                this.distance = target;
                this.isDwelling = true;
                this.dwellUntil = Date.now() + DEFAULT_DWELL_TIME * 1000;
                return;
            } else if (this.direction === -1 && prevDistance > target && this.distance <= target) {
                this.distance = target;
                this.isDwelling = true;
                this.dwellUntil = Date.now() + DEFAULT_DWELL_TIME * 1000;
                return;
            }
        }

        // Update marker position.
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


// Global array to hold all the trains.
let trains = [];

// Start simulation: create one train per service route (you can adjust this as needed).
function startSimulation() {
    // Process each service pattern
    Object.keys(SERVICE_PATTERNS).forEach(lineId => {
        const pattern = SERVICE_PATTERNS[lineId];

        pattern.branches.forEach(branchId => {
            const route = serviceRoutes[branchId];
            if (!route) {
                console.error(`Route data not found for branch: ${branchId}`);
                return;
            }

            const routeLength = turf.length(turf.lineString(route.coords)) * 1000; // in meters
            const roundTripTime = (2 * routeLength) / VEHICLE_SPEEDS[route.type || 'METRO']; // seconds
            const requiredTrainsPerDirection = Math.ceil((roundTripTime / 60) / (2 * (60 / pattern.branchFrequency)));

            console.log(`${branchId} route length: ${Math.round(routeLength)}m`);
            console.log(`Round trip time: ${Math.round(roundTripTime/60)} minutes`);
            console.log(`frequency: ${pattern.frequency}tph`);
            console.log(`headway: ${pattern.headway}mins`);
            console.log(`Required trains per direction: ${requiredTrainsPerDirection}`);
            console.log("\n");
            // Spawn trains in both directions
            for (let direction of [1, -1]) { // 1 for northbound, -1 for southbound
                for (let i = 0; i < requiredTrainsPerDirection; i++) {
                    const spacing = routeLength / requiredTrainsPerDirection;
                    const offset = i * spacing;
                    // const arrow = direction === 1 ? '↑' : '↓';
                    let label;
                    if (lineId.startsWith("M1")) {
                        label = "1";
                    } else if (lineId.startsWith("M2")) {
                        label = "2";
                    } else if (lineId.startsWith("M3")) {
                        label = "3";
                    } else if (lineId.startsWith("P")) {
                        label = "P";
                    } else if (lineId.startsWith("R")) {
                        label = "R";
                    } else if (lineId.startsWith("G")) {
                        label = "G";
                    } else {
                        label = lineId;
                    }
                    let train = new Train(
                        route,
                        label,
                        lineColours[lineId.split('_')[0]],
                        offset
                    );
                    train.direction = direction;
                    train.branchId = branchId;
                    trains.push(train);
                }
            }
        });
    });

    // Start animation loop
    let lastTime = Date.now();

    function animate() {
        let now = Date.now();
        if (simPaused) {
            lastTime = now;
        } else {
            let deltaTime = (now - lastTime) / 1000;
            lastTime = now;
            trains.forEach(train => train.update(deltaTime));
        }
        requestAnimationFrame(animate);
    }
    animate();
}