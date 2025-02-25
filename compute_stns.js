// This script precomputes station distances along each service route and saves the result to a JSON file.
// Data source: the GeoJSON files for service routes and stations.

// To run:
// npm install @turf/turf
// node compute_stns.js

const fs = require('fs');
const turf = require('@turf/turf');

// Define file paths for the service routes (both Metro & LRT)
const serviceRouteFiles = {
    // Metro routes
    "M1_NESE": "data/dantat_metro_M1_NESE.geojson",
    "M1_NWSE": "data/dantat_metro_M1_NWSE.geojson",
    "M1_NESW": "data/dantat_metro_M1_NESW.geojson",
    "M1_NWSW": "data/dantat_metro_M1_NWSW.geojson",
    "M2": "data/dantat_metro_M2.geojson",
    "M3": "data/dantat_metro_M3.geojson",
    "M3_Shuttle": "data/dantat_metro_M3_shuttle.geojson",
    // LRT routes
    "P1": "data/dankal_lrt_P1.geojson",
    "P2": "data/dankal_lrt_P2.geojson",
    "G1": "data/dankal_lrt_G1.geojson",
    "G2": "data/dankal_lrt_G2.geojson",
    "G3": "data/dankal_lrt_G3.geojson",
    "G4": "data/dankal_lrt_G4.geojson",
    "R1": "data/dankal_lrt_R1.geojson",
    "R23": "data/dankal_lrt_R23.geojson"
};
// Define file paths for station layers (Metro and LRT)
const metroStationsFile = "data/dantat_metro_stations.geojson";
const lrtStationsFile = "data/dankal_lrt_stations.geojson";
// Helper function: load and parse JSON from file.
function loadJSON(path) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}
// Function to process a service route file.
function processRouteFile(path) {
    let data = loadJSON(path);
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
        coords = geom.coordinates.flat();
    } else {
        coords = [];
    }
    return coords;
}
// Load all service routes
let allServiceRoutes = {};
Object.keys(serviceRouteFiles).forEach(key => {
    const coords = processRouteFile(serviceRouteFiles[key]);
    allServiceRoutes[key] = {
        coords,
        stations: []
    };
    console.log(`Loaded route ${key} with ${coords.length} points.`);
});
// Load station data
let metroStationsData = loadJSON(metroStationsFile);
let lrtStationsData = loadJSON(lrtStationsFile);
// Merge the two station sets
let allStations = metroStationsData.features.concat(lrtStationsData.features);
console.log(`Loaded a total of ${allStations.length} stations.`);
// Compute station distances along each service route
Object.keys(allServiceRoutes).forEach(key => {
    let routeObj = allServiceRoutes[key];
    let lineStr = turf.lineString(routeObj.coords);
    let totalRouteLength = turf.length(lineStr) * 1000; // in meters
    let stationDistances = [];
    // For Metro routes, filter by feature.properties.LINE if available.
    // For LRT routes, assume all station features apply.
    // const linePrefix = !key.startsWith("M") ? "LRT" : key.split('_')[0]; // e.g., "M1", "M2", "M3" or "LRT"
    

    allStations.forEach(feature => {
        if (!feature.geometry || !feature.geometry.coordinates) return;
        let stationPt = turf.point(feature.geometry.coordinates);
        let snapped = turf.nearestPointOnLine(lineStr, stationPt, {
            units: "meters"
        });
        // Only add station if it's within 50 m of the route.
        if (snapped.properties.dist <= 50) {
            let distMeters = Math.round(snapped.properties.location); // location is in km.
            // console.log("total route length", totalRouteLength);
            // console.log(distMeters);
            //add a 1 meter buffer
            if (distMeters >= 0 && distMeters <= totalRouteLength) {
                stationDistances.push(distMeters);
            }
        }
    });

    // Remove duplicates and sort.
    stationDistances = Array.from(new Set(stationDistances)).sort((a, b) => a - b);
    routeObj.stations = stationDistances;
    console.log(`Route ${key} station distances (m):`, stationDistances);
    console.log(`Route ${key} has ${stationDistances.length} stations`);
    
});

// Save the preprocessed station distances with route coordinates to a JSON file.
fs.writeFileSync('data/preprocessed_station_distances.json', JSON.stringify(allServiceRoutes, null, 2));
console.log('Preprocessed station distances saved to data/preprocessed_station_distances.json');