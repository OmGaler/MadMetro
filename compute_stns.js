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
    "M1_NESE": "data/METRO/dantat_metro_M1_NESE.geojson",
    "M1_NWSE": "data/METRO/dantat_metro_M1_NWSE.geojson",
    "M1_NESW": "data/METRO/dantat_metro_M1_NESW.geojson",
    "M1_NWSW": "data/METRO/dantat_metro_M1_NWSW.geojson",
    "M2": "data/METRO/dantat_metro_M2.geojson",
    "M3": "data/METRO/dantat_metro_M3.geojson",
    "M3_Shuttle": "data/METRO/dantat_metro_M3_shuttle.geojson",
    // LRT routes
    "P1": "data/LRT/dankal_lrt_P1.geojson",
    "P2": "data/LRT/dankal_lrt_P2.geojson",
    "G1": "data/LRT/dankal_lrt_G1.geojson",
    "G2": "data/LRT/dankal_lrt_G2.geojson",
    "G3": "data/LRT/dankal_lrt_G3.geojson",
    "G4": "data/LRT/dankal_lrt_G4.geojson",
    "R1": "data/LRT/dankal_lrt_R1.geojson",
    "R23": "data/LRT/dankal_lrt_R23.geojson"
};
// Define file paths for station layers (Metro and LRT)
const metroStationsFile = "data/METRO/dantat_metro_stations.geojson";
const lrtStationsFile = "data/LRT/dankal_lrt_stations.geojson";
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

// Parse command line arguments
const args = process.argv.slice(2);
const heavyRailMode = args.includes('-m');

if (!heavyRailMode) {
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
                        name: {
                            en: feature.properties.NAMEENG || feature.properties.name || 'Unnamed Station',
                            he: feature.properties.NAME || feature.properties.name || 'תחנה ללא שם'
                        },
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
        
        if (stationDistances.length === 0 || 
            (totalRouteLength - stationDistances[stationDistances.length - 1].distance) > 50) {
            stationDistances.push({
                distance: Math.round(totalRouteLength),
                name: 'Terminal Station',
                originalDist: 0
            });
        }
        
        // After collecting all stations, add terminus information
        routeObj.stations = stationDistances;
        routeObj.termini = {
            en: {
                start: stationDistances[0].name.en,
                end: stationDistances[stationDistances.length - 1].name.en
            },
            he: {
                start: stationDistances[0].name.he,
                end: stationDistances[stationDistances.length - 1].name.he
            }
        };
        console.log(`Route ${key} has ${stationDistances.length} stations`);
    });
    // Save the preprocessed station distances with route coordinates to a JSON file.
    fs.writeFileSync('data/preprocessed_station_distances.json', JSON.stringify(allServiceRoutes, null, 2));
    console.log('\n\nPreprocessed station distances saved to data/preprocessed_station_distances.json');
} else {
    // Heavy rail preprocessing mode
    // Input files
    const railLegsFile = "data/RAIL/service_legs.geojson";
    const railStopsFile = "data/RAIL/service_stops.geojson";

    const railLegs = loadJSON(railLegsFile);
    const railStops = loadJSON(railStopsFile);

    // Group legs and stops by service_id
    const legsByService = {};
    railLegs.features.forEach(f => {
        const sid = f.properties.service_id;
        if (!legsByService[sid]) legsByService[sid] = [];
        legsByService[sid].push(f);
    });

    const stopsByService = {};
    railStops.features.forEach(f => {
        const sid = f.properties.service_id;
        if (!stopsByService[sid]) stopsByService[sid] = [];
        stopsByService[sid].push(f);
    });

    const heavyRailRoutes = {};

    Object.keys(legsByService).forEach(serviceId => {
        const legs = legsByService[serviceId];
        // Concatenate all coordinates, avoiding duplicate endpoints
        let coords = [];
        legs.forEach((leg, idx) => {
            const legCoords = leg.geometry.coordinates;
            if (idx === 0) {
                coords.push(...legCoords);
            } else {
                coords.push(...legCoords.slice(1));
            }
        });

        // Get stops for this service, sorted by stop_sequence
        const stops = (stopsByService[serviceId] || []).sort(
            (a, b) => a.properties.stop_sequence - b.properties.stop_sequence
        );

        // Build station objects with distance along the line, always including both en and he
        const lineString = turf.lineString(coords);
        stops.forEach(stop => {

            console.log(stop.properties);
        });
        const stations = stops.map(stop => ({
            id: stop.properties.stop_id,
            name: {
                en: stop.properties.name[0].en || "",
                he: stop.properties.name[1].he || ""
            },
            distance: turf.length(turf.lineSlice(coords[0], stop.geometry.coordinates, lineString)) * 1000
        })).sort((a, b) => a.distance - b.distance);

        heavyRailRoutes[serviceId] = {
            coords,
            stations
        };
        console.log(`Heavy rail route ${serviceId} has ${stations.length} stations`);
    });

    fs.writeFileSync('data/network/preprocessed_mainline_distances.json', JSON.stringify(heavyRailRoutes, null, 2));
    console.log('\n\nPreprocessed heavy rail station distances saved to data/preprocessed_heavyrail_distances.json');
}

