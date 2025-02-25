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
// Function to process a service route file
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
// Add helper function to get line name from route key
function getLineName(routeKey) {
    const prefix = routeKey.split('_')[0]; // M1, M2, M3, P1, R1, etc.
    if (prefix.startsWith('M')) {
        return prefix; // Return M1, M2, M3 for metro lines
    }
    // For LRT lines, map to full names used in the GeoJSON
    const lrtMap = {
        'P': 'Purple',
        'R': 'Red',
        'G': 'Green'
    };
    return lrtMap[prefix[0]];
}

// Compute station distances along each service route
Object.keys(allServiceRoutes).forEach(key => {
    let routeObj = allServiceRoutes[key];
    let lineStr = turf.lineString(routeObj.coords);
    let totalRouteLength = turf.length(lineStr) * 1000; // in meters
    let stationDistances = [];
    
    // Get the line name for filtering
    const lineName = getLineName(key);
    
    // Filter stations that belong to this line
    const lineStations = allStations.filter(feature => 
        feature.properties.LINE && 
        feature.properties.LINE.includes(lineName)
    );
    lineStations.forEach(feature => {
        if (!feature.geometry || !feature.geometry.coordinates) return;

        let stationPt = turf.point(feature.geometry.coordinates);
        let snapped = turf.nearestPointOnLine(lineStr, stationPt, {
            units: "meters"
        });

        // Only add station if it's very close to the line (within 30 meters)
        if (snapped.properties.dist <= 20) {
            let distMeters = Math.round(snapped.properties.location);
            // Check if the station is within the route bounds
            if (distMeters >= 0 && distMeters <= totalRouteLength+1) {
                stationDistances.push({
                    distance: distMeters,
                    name: feature.properties.name || 'Unnamed Station',
                    originalDist: snapped.properties.dist // for debugging
                });
            }
        }
    });
    // Sort by distance and remove duplicates based on proximity
    stationDistances.sort((a, b) => a.distance - b.distance);    
    // Filter out stations that are too close to each other (within 100m)
    stationDistances = stationDistances.filter((station, index) => {
        if (index === 0) return true;
        return Math.abs(station.distance - stationDistances[index - 1].distance) > 100;
    });
    // Store only the distances in the route object
    routeObj.stations = stationDistances.map(s => s.distance);
    console.log(`Route ${key} has ${stationDistances.length} stations`);
});
// Save the preprocessed station distances with route coordinates to a JSON file.
fs.writeFileSync('data/preprocessed_station_distances.json', JSON.stringify(allServiceRoutes, null, 2));
console.log('\n\nPreprocessed station distances saved to data/preprocessed_station_distances.json');