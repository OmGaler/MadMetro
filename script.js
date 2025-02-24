//! TODO: preprocess the station distances 
//TODO: up max speed to 80kmh, tweak sim speed 
//discalimers
//languaages
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
    "red": "red",
    "green": "green",
    "purple": "purple"
};

// Load service routes, split the branches into separate files for ease of simulation 
const serviceRouteFiles = {
    "M1_NESE": "data/dantat_metro_M1_NESE.geojson",
    "M1_NWSE": "data/dantat_metro_M1_NWSE.geojson",
    "M1_NESW": "data/dantat_metro_M1_NESW.geojson",
    "M1_NWSW": "data/dantat_metro_M1_NWSW.geojson",
    "M2": "data/dantat_metro_M2.geojson",
    "M3": "data/dantat_metro_M3.geojson",
    "M3_Shuttle": "data/dantat_metro_M3_shuttle.geojson"
};
// We'll store each route (an array of [lon, lat] coordinates) in serviceRoutes.
const serviceRoutes = {}; // key: service pattern, value: polyline coordinates
let stationsData = null; // will hold the stations GeoJSON

Promise.all([
        ...Object.keys(serviceRouteFiles).map(key =>
            fetch(serviceRouteFiles[key])
            .then(res => {
                if (!res.ok) throw new Error(`Failed to load ${key}`);
                return res.json();
            })
            .then(data => {
                let geom = (data.type === "FeatureCollection") ? data.features[0].geometry :
                    (data.type === "Feature") ? data.geometry : data;
                let coords = geom.type === "LineString" ? geom.coordinates :
                    geom.type === "MultiLineString" ? geom.coordinates.flat() : null;

                if (!coords) throw new Error(`Invalid geometry in ${key}`);
                serviceRoutes[key] = {
                    coords,
                    stations: []
                };
                // console.log(`Loaded route ${key} with ${coords.length} points.`);
            })
        ),
        fetch('data/dantat_metro_stations.geojson')
        .then(res => {
            if (!res.ok) throw new Error("Failed to load stations");
            return res.json();
        })
        .then(data => {
            if (!data || !data.features) throw new Error("Invalid stations GeoJSON");
            stationsData = data;
            console.log(`Loaded ${stationsData.features.length} stations.`);
        })
    ])
    .then(() => {
        if (!stationsData || !stationsData.features) {
            throw new Error("stationsData is still null!");
        }
        // ----- COMPUTE STATION DISTANCES ALONG EACH SERVICE ROUTE -----
        Object.keys(serviceRoutes).forEach(key => {
            //TODO: unbugg this mess and ideally process it once and save it bec icba to wait for it everytime
            let routeObj = serviceRoutes[key];
            let lineStr = turf.lineString(routeObj.coords);
            let totalRouteLength = turf.length(lineStr) * 1000; // in meters
            console.log(key, totalRouteLength)
            let stationDistances = [];

            stationsData.features.forEach(feature => {
                if (!feature.geometry || !feature.geometry.coordinates) return;
                let stationPt = turf.point(feature.geometry.coordinates);
                let snapped = turf.nearestPointOnLine(lineStr, stationPt, {
                    units: "meters"
                });
                let distMeters = snapped.properties.location;// * 1000;
                console.log(distMeters);
                console.log(totalRouteLength);
                if (distMeters >= 0 && distMeters <= totalRouteLength) {
                    stationDistances.push(distMeters);
                }
            });

            stationDistances = Array.from(new Set(stationDistances.map(d => Math.round(d)))).sort((a, b) => a - b);
            routeObj.stations = stationDistances;
            console.log(`Route ${key} station distances (m):`, stationDistances);

            const latlngs = routeObj.coords.map(coord => [coord[1], coord[0]]);
            L.polyline(latlngs, {
                    color: "green",
                    weight: 4,
                    opacity: 0.7,
                    dashArray: "5,5"
                })
                .addTo(map)
                .bindPopup(`Service Route: ${key}`);

                stationsData.features.forEach(feature => {
                    if (!feature.geometry || !feature.geometry.coordinates) return;
                    let coords = feature.geometry.coordinates;
                    let stationName = feature.properties.name || "Unnamed Station";
                    
                    L.marker([coords[1], coords[0]], {
                        icon: L.divIcon({
                            className: "station-marker",
                            html: "⬤",
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        })
                    }).addTo(map)
                    .bindPopup(`<b>${stationName}</b>`);
                });
            
                console.log("Stations added to the map.");
        });

        startSimulation();
    })
    .catch(error => console.error("Error in loading data:", error));


// Train simulation
const trainSpeed = 60 * 1000 / 3600; // 60 km/h in m/s
const timeScale = 60; // 1 real second = 1 simulated minute

const DEFAULT_DWELL_TIME = 2; // seconds dwell at each station
const STATION_TOLERANCE = 20; // meters within which a train is considered "at" a station

// Train class to represent each vehicle which moves along a continuous precomputed route.
class Train {
    constructor(route, label, color, offset = 0) {
        // if (!Array.isArray(route) || route.length === 0) {
        //     console.error(`Invalid route for train ${label}:`, route);
        //     return;
        // }
        this.route = route.coords; // array of [lon, lat]
        // console.log("routeCoords", routeCoords);
        this.stations = route.stations;
        this.label = label;
        this.color = color;
        // Compute total route length in meters using Turf.js.
        this.totalDistance = turf.length(turf.lineString(this.route)) * 1000;
        this.distance = offset; // initial offset (in meters) along the route
        // 1 for forward, -1 for reverse (trains reverse at termini instead of continuing into the void)
        this.direction = 1;
        this.isDwelling = false;
        this.dwellUntil = 0;
        this.updateNextStationIndex();
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

    updateNextStationIndex() {
        if (this.direction === 1) {
            // Forward: first station with distance >= current distance.
            let idx = this.stations.findIndex(d => d >= this.distance);
            this.nextStationIndex = (idx === -1) ? this.stations.length : idx;
        } else {
            // Reverse: last station with distance <= current distance.
            let idx = -1;
            for (let i = 0; i < this.stations.length; i++) {
                if (this.stations[i] <= this.distance) {
                    idx = i;
                } else {
                    break;
                }
            }
            this.nextStationIndex = idx;
        }
    }

    update(deltaTime) {
        // If dwelling (at a station or terminal), check if dwell time is over.
        if (this.isDwelling) {
            if (Date.now() >= this.dwellUntil) {
                this.isDwelling = false;
                this.updateNextStationIndex();
            } else {
                return;
            }
        }

        // Advance along the route.
        this.distance += trainSpeed * deltaTime * timeScale * this.direction;

        // Terminal reversal check.
        if (this.distance >= this.totalDistance) {
            this.distance = this.totalDistance;
            this.direction = -1;
            this.isDwelling = true;
            this.dwellUntil = Date.now() + DEFAULT_DWELL_TIME * 1000;
            this.updateNextStationIndex();
        } else if (this.distance <= 0) {
            this.distance = 0;
            this.direction = 1;
            this.isDwelling = true;
            this.dwellUntil = Date.now() + DEFAULT_DWELL_TIME * 1000;
            this.updateNextStationIndex();
        }

        // Station dwell check: if train is within tolerance of the next station, start dwelling.
        if (this.direction === 1 && this.nextStationIndex < this.stations.length) {
            let stationDist = this.stations[this.nextStationIndex];
            if (Math.abs(this.distance - stationDist) < STATION_TOLERANCE) {
                if (!this.isDwelling) {
                    this.isDwelling = true;
                    this.dwellUntil = Date.now() + DEFAULT_DWELL_TIME * 1000;
                }
            }
        } else if (this.direction === -1 && this.nextStationIndex >= 0) {
            let stationDist = this.stations[this.nextStationIndex];
            if (Math.abs(this.distance - stationDist) < STATION_TOLERANCE) {
                if (!this.isDwelling) {
                    this.isDwelling = true;
                    this.dwellUntil = Date.now() + DEFAULT_DWELL_TIME * 1000;
                }
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


// Global array to hold our trains.
let trains = [];

// Start simulation: create one train per service route (you can adjust this as needed).
function startSimulation() {
    Object.keys(serviceRoutes).forEach(key => {
        let route = serviceRoutes[key];
        let color, label;
        if (key.startsWith("M1")) {
            color = lineColours["M1"];
            label = "1";
        } else if (key === "M2") {
            color = lineColours["M2"];
            label = "2";
        } else if (key.startsWith("M3")) {
            color = lineColours["M3"]
            label = "3";
        } else {
            color = "grey";
            label = key;
        }

        // Create a train with a random starting offset.
        let offset = Math.random() * 1000; // 0 to 1000m
        console.log(`Service route: ${key}`, route);
        let train = new Train(serviceRoutes[key], label, color, offset);
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