//! TODO: preprocess the station distances 
//TODO: up max metro speed to 80kmh, max LRT speed to 70 (ug and 50 overground???), tweak sim speed
//? TODO: M2 missing station segula IZ
//TODO: short turns at elifelet


//// why is kahanemen and HAROEH station closed?! 
// TODO: some stations randomly skipped
//discalimers
//languages
//data from geo.mot.gov.il
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
// We'll store each route (an array of [lon, lat] coordinates) in serviceRoutes.
let serviceRoutes = {}; // key: service pattern, value: polyline coordinates
let stationsData = null; // will hold the stations GeoJSON

// Promise.all([
//         ...Object.keys(serviceRouteFiles).map(key =>
//             fetch(serviceRouteFiles[key])
//             .then(res => {
//                 if (!res.ok) throw new Error(`Failed to load ${key}`);
//                 return res.json();
//             })
//             .then(data => {
//                 let geom = (data.type === "FeatureCollection") ? data.features[0].geometry :
//                     (data.type === "Feature") ? data.geometry : data;
//                 let coords = geom.type === "LineString" ? geom.coordinates :
//                     geom.type === "MultiLineString" ? geom.coordinates.flat() : null;

//                 if (!coords) throw new Error(`Invalid geometry in ${key}`);
//                 serviceRoutes[key] = {
//                     coords,
//                     stations: []
//                 };
//                 // console.log(`Loaded route ${key} with ${coords.length} points.`);
//             })
//         ),
//         fetch('data/dantat_metro_stations.geojson')
//         .then(res => {
//             if (!res.ok) throw new Error("Failed to load Metro stations");
//             return res.json();
//         })
//         .then(data => {
//             if (!data || !data.features) throw new Error("Invalid Metro stations GeoJSON");
//             stationsData = data;
//             console.log(`Loaded ${stationsData.features.length} Metro stations.`);
//         }),
//         fetch('data/dankal_lrt_stations.geojson')
//         .then(res => {
//             if (!res.ok) throw new Error("Failed to load LRT stations");
//             return res.json();
//         })
//         .then(data => {
//             if (!data || !data.features) throw new Error("Invalid LRT stations GeoJSON");
//             // Merge LRT stations with metro stations
//             stationsData.features = stationsData.features.concat(data.features);
//             console.log(`Loaded ${data.features.length} LRT stations.`);
//         })
//     ])
//     .then(() => {
//         if (!stationsData || !stationsData.features) {
//             throw new Error("stationsData is null!");
//         }
//         // ----- COMPUTE STATION DISTANCES ALONG EACH SERVICE ROUTE -----
//         console.log("stationsData ", stationsData);
//         Object.keys(serviceRoutes).forEach(key => {
//             let routeObj = serviceRoutes[key];
//             let lineStr = turf.lineString(routeObj.coords);
//             let totalRouteLength = turf.length(lineStr) * 1000; // in meters
//             let stationDistances = [];
//             // First, filter stations that belong to this line
//             let lineName = key.split('_')[0]; // Extract M1, M2, M3 from route key
//             let l = lineName.charAt(0).toUpperCase();
//             if (l !== "M") { //check if it's a LRT line
//                 lineName = {
//                     "R": "Red",
//                     "G": "Green",
//                     "P": "Purple"
//                 }[l];
//             }
//             const lineStations = stationsData.features.filter(feature =>
//                 feature.properties.LINE &&
//                 feature.properties.LINE.includes(lineName)
//             );
//             lineStations.forEach(feature => {
//                 if (!feature.geometry || !feature.geometry.coordinates) return;

//                 let stationPt = turf.point(feature.geometry.coordinates);
//                 let snapped = turf.nearestPointOnLine(lineStr, stationPt, {
//                     units: "meters"
//                 });
//                 // Only add station if it's very close to the line (within 50 meters)
//                 if (snapped.properties.dist <= 50) {
//                     let distMeters = snapped.properties.location;
//                     //check the station is within the route (add a 1 metre buffer)
//                     if (distMeters >= 0 && distMeters <= totalRouteLength+1) {
//                         stationDistances.push({
//                             distance: Math.round(distMeters), // Round to nearest meter
//                             name: feature.properties.name,
//                             originalDist: snapped.properties.dist // for debugging
//                         });
//                     }
//                 }
//             });
//             // Sort by distance and remove duplicates based on rounded distance
//             stationDistances.sort((a, b) => a.distance - b.distance);
//             stationDistances = stationDistances.filter((station, index) => {
//                 if (index === 0) return true;
//                 // Remove stations that are within 100 meters of each other
//                 return Math.abs(station.distance - stationDistances[index - 1].distance) > 100;
//             });
//             routeObj.stations = stationDistances.map(s => s.distance);
//             console.log(`Route ${key} has ${stationDistances.length} stations:`, stationDistances);
//             console.log("coords", routeObj.coords)
//             const latlngs = routeObj.coords.map(coord => [coord[1], coord[0]]);
//             L.polyline(latlngs, {
//                     color: "green",
//                     weight: 4,
//                     opacity: 0.7,
//                     dashArray: "5,5"
//                 })
//                 .addTo(map)
//                 .bindPopup(`Service Route: ${key}`);

//             stationsData.features.forEach(feature => {
//                 if (!feature.geometry || !feature.geometry.coordinates) return;
//                 let coords = feature.geometry.coordinates;
//                 let stationName = feature.properties.name || "Unnamed Station";

//                 L.marker([coords[1], coords[0]], {
//                         icon: L.divIcon({
//                             className: "station-marker",
//                             html: "⬤",
//                             iconSize: [12, 12],
//                             iconAnchor: [6, 6]
//                         })
//                     }).addTo(map)
//                     .bindPopup(`<b>${stationName}</b>`);
//             });

//         });
//         // Visualize computed station points for each service route

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

        let posFeature = turf.along(turf.lineString(this.route), this.distance / 1000, { units: "kilometers" });
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
            METRO: 80 * 1000 / 3600,      // 80 km/h in m/s
            LRT: 60 * 1000 / 3600         // 60 km/h in m/s
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
        let posFeature = turf.along(turf.lineString(this.route), this.distance / 1000, { units: "kilometers" });
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
    Object.keys(serviceRoutes).forEach(key => {
        let route = serviceRoutes[key];
        let colour, label;
        // Determine color and label based on route key
        if (key.startsWith("M1")) {
            colour = lineColours["M1"];
            label = "1";
        } else if (key === "M2") {
            colour = lineColours["M2"];
            label = "2";
        } else if (key.startsWith("M3")) {
            colour = lineColours["M3"];
            label = "3";
        } else if (key.startsWith("P")) {
            colour = lineColours["P"];
            label = "P";
        } else if (key.startsWith("R")) {
            colour = lineColours["R"];
            label = "R";
        } else if (key.startsWith("G")) {
            colour = lineColours["G"];
            label = "G";
        } else {
            console.log(key);
            colour = "grey";
            label = key;
        }
        // for (i=0; i<5; i++) {
        //TODO: spawn multiple trains per line in accordance with required service pattern.
        //and spawn them spread out along the line
        //and perhaps enforce separation 
        //start with M2 becauses its the only one which has uniform frequency/headway throughout 
            let offset = Math.random() * 1000; // 0 to 1000m
            let train = new Train(serviceRoutes[key], label, colour, offset);
            trains.push(train);
        // }
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