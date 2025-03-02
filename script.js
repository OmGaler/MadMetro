//TODO: up max metro speed to 80kmh, max LRT speed to 70 (ug and 50 overground???), tweak sim speed
//TODO: short turns at elifelet

//------------------

//settings screen-
//configurable timescale
//configure service day/times
//languages
//discalimers
//data from geo.mot.gov.il, openstreetmap
//this is a simulation, not real data
//link to the readme, which contains all the disclaimers
//------------------




//TODO: enforce headway separation -Before spawning a new train or allowing a train to depart from a station, check the distance to the train ahead.
//TODO: respawn all trains when service time is changed
//TODO: when unpausing, trains teleport
//TODO: red line gets stuck at southern terminal, M1 gets stuck at NW terminal, M3_shuttle at TLV
    //those stations dont exist
//TODO: extreme bunching (irrespective of branching??)
//TODO: headways still not being enforced
//TRAINS get stuck at termin
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
let day;
let time;

//===============================================
// PAUSE controls
//===============================================
// Add event listener to the pause/play button.
document.getElementById("pause").addEventListener("click", function () {
    simPaused = !simPaused;
    this.innerHTML = simPaused ? "<ion-icon name='play'></ion-icon>" : "<ion-icon name='pause'></ion-icon>";
});
//and for the space/p key
document.addEventListener("keydown", function (event) {
    // Check if the key pressed is space (code "Space") or the letter "P" (case-insensitive)
    if (event.code === "Space" || event.key.toLowerCase() === "p") {
        simPaused = !simPaused; // Toggle simulation pause state
        document.getElementById("pause").innerHTML = simPaused 
        ? "<ion-icon name='play'></ion-icon>" 
        : "<ion-icon name='pause'></ion-icon>";
      // Prevent default behavior for spacebar scrolling
    event.preventDefault();
    }
});
//===============================================
// SETTINGS controls
//===============================================
const settingsButton = document.getElementById("settings");
const settingsModal = document.getElementById("settingsModal");
const closeModal = document.getElementsByClassName("close")[0];
// Open the settings modal and pause simulation.
settingsButton.addEventListener("click", function () {
    settingsModal.style.display = "block";
    simPaused = true;
    document.getElementById("pause").innerHTML = "<ion-icon name='play'></ion-icon>";   
});
// Close the settings modal and resume simulation.
closeModal.addEventListener("click", function () {
    settingsModal.style.display = "none";
    simPaused = false;
    document.getElementById("pause").innerHTML = "<ion-icon name='pause'></ion-icon>";
});
// Also close the modal if the user clicks outside of the modal content
window.addEventListener("click", function (event) {
    if (event.target === settingsModal) {
        settingsModal.style.display = "none";
        simPaused = false;
        document.getElementById("pause").innerHTML = "<ion-icon name='pause'></ion-icon>";
    }
});

//===============================================
// Train info pop-up
//===============================================
document.addEventListener('click', () => {
    document.getElementById("trainPopup").style.display = "none";
  });
// document.addEventListener("click", function (event) {
//     const trainPopup = document.getElementById("trainPopup");
//     // If the popup is open and the click target is not inside the popup, hide it
//     if (trainPopup.style.display === "flex" && !trainPopup.contains(event.target)) {
//       trainPopup.style.display = "none";
//     }
//   });

//===============================================
// DAY/TIME controls
//===============================================
document.getElementById("dayTypeSelect").addEventListener("change", updateOperationSettings);
document.getElementById("timePeriodSelect").addEventListener("change", updateOperationSettings);

dayTypeSelect.addEventListener("change", function () {
    updateTimePeriodOptions(); // repopulate the timePeriodSelect options
    updateOperationSettings(); // then update the schedule settings
});

  // Define time period options for each day type
const timePeriods = {
    weekday: [{
                value: "early_late",
                text: "Early Morning/Late Night"
            },
            {
                value: "morning_evening",
                text: "Morning/Evening"
            },
            {
                value: "peaks",
                text: "Morning/Evening Peak"
            },
            {
                value: "midday",
                text: "Midday"
            }
        ],
        weekend: [{
                value: "early",
                text: "Early Morning (F)"
            },
            {
                value: "morning_peak",
                text: "Morning Peak (F)"
            },
            {
                value: "midday",
                text: "Midday 09:00-1hr before Sh"
            },
            {
                value: "evening",
                text: "1hr after Sh-22:00"
            },
            {
                value: "late",
                text: "Late Night (S)"
            }
        ]
};

function updateTimePeriodOptions() {
    const selectedDayType = dayTypeSelect.value;
    // Clear existing options
    timePeriodSelect.innerHTML = "";
    // Add new options based on selected day type
    timePeriods[selectedDayType].forEach(option => {
        const opt = document.createElement("option");
        opt.value = option.value;
        opt.textContent = option.text;
        timePeriodSelect.appendChild(opt);
    });
    // Reset the selection to the first valid option
    if (timePeriodSelect.options.length > 0) {
        timePeriodSelect.value = timePeriodSelect.options[0].value;
    }
}

// Initialise default options
updateTimePeriodOptions();


function updateOperationSettings() {
    // Get current selections
    const dayType = document.getElementById("dayTypeSelect").value;
    const timePeriod = document.getElementById("timePeriodSelect").value;
    // console.log("Selected schedule:", dayType, timePeriod);
    day = dayType;
    time = timePeriod;

    // Respawn all trains so that the new frequencies (from scheduleData) are used.
    // The startSimulation() function already retrieves the schedule selections:
    startSimulation();
}

//===============================================
// SIMULATION setup
//===============================================
// We'll store each route (an array of [lon, lat] coordinates) in serviceRoutes.
let serviceRoutes = {}; // key: service pattern, value: polyline coordinates
let stationsData = null; // will hold the stations GeoJSON

// Add at the top with other global variables
let scheduleData = null;

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
Promise.all([
    // Load schedule data
    fetch('data/schedule.json')
      .then(res => {
          if (!res.ok) throw new Error("Failed to load schedule data");
          return res.json();
      }),
    // Load preprocessed station distances
    fetch('data/preprocessed_station_distances.json')
      .then(res => {
          if (!res.ok) throw new Error("Failed to load preprocessed station distances");
          return res.json();
      })
])
.then(([schedule, routes]) => {
    // Set global variables
    scheduleData = schedule;
    serviceRoutes = routes;
    console.log("Loaded schedule data:", scheduleData);
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
            let snapped = turf.along(lineStr, dist / 1000, { units: "kilometers" });
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
    
    // Now that both files are loaded, start the simulation
    startSimulation();
})
.catch(error => console.error("Error loading data:", error));


// Train simulation
const trainSpeed = 80 * 1000 / 3600; // 80 km/h in m/s
const timeScale = 60; // 1 real second = 1 simulated minute

const DEFAULT_DWELL_TIME = 1; // seconds dwell at each station
const STATION_TOLERANCE = 30; // meters within which a train is considered "at" a station

// Add these constants near the other simulation constants
const VEHICLE_SPEEDS = {
    METRO: 80 * 1000 / 3600, // 80 km/h in m/s
    LRT: 60 * 1000 / 3600 // 60 km/h in m/s
};

// let serviceTime = "morning_evening";
//frequency = schedule["weekday"]["morning_evening"].tph;
// let frequency = 20;
// let headway = 60 / frequency;
// Add these constants near the top of your file
const SERVICE_PATTERNS = {
    // Metro lines
    M1: {
        branches: ['M1_NESE', 'M1_NWSE', 'M1_NESW', 'M1_NWSW'],
        defaultFrequency: 20, // default combined frequency on core section
        branchFrequency: 1 / 4 // frequency per branch compared to core
    },
    M2: {
        branches: ['M2'],
        defaultFrequency: 20,
        branchFrequency: 1 // same as frequency since no branches
    },
    M3: {
        branches: ['M3', 'M3_Shuttle'],
        defaultFrequency: 20,
        branchFrequency: 1 //no shared section, the shuttle is independent
    },
    // Light Rail lines
    P: {
        branches: ['P1', 'P2'],
        defaultFrequency: 20,
        branchFrequency: 1 / 2
    },
    R: {
        branches: ['R1', 'R23'],
        defaultFrequency: 17,
        branchFrequency: 1 / 2
    },
    G: {
        branches: ['G1', 'G2', 'G3', 'G4'],
        defaultFrequency: 20,
        branchFrequency: 1 / 4
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
        // In your Train class constructor, after creating this.marker
        this.marker.on('click', event => {
            // Stop propagation so the global listener isn’t triggered by this click
            event.originalEvent.stopPropagation();
            const popup = document.getElementById("trainPopup");
            const routeBullet = document.getElementById("popupRouteBullet");
            routeBullet.textContent = this.label;
            routeBullet.style.backgroundColor = this.color;
            routeBullet.style.color = "white"; // Ensure the text is visible
            popup.style.display = "flex";
        });
        // Determine vehicle type from label (Metro if label is "1","2","3", else LRT)
        this.vehicleType = (this.label === "1" || this.label === "2" || this.label === "3") ? 'METRO' : 'LRT_SURFACE';
        this.minimumHeadway = 90; // 90 meters minimum separation
        this.branchId = null; // Will be set when creating trains
        this.ahead = null; // Reference to train ahead on same route
        this.behind = null; // Reference to train behind on same route
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

    // Add new method to check headway
    checkHeadway() {
        //if there's no train ahead or the train ahead is itself, return true
        if (!this.ahead || this.ahead === this) return true;
        
        // Calculate distance to train ahead
        const aheadDist = this.ahead.distance;
        const myDist = this.distance;
        
        // Account for wrapping around at end of line
        let separation;
        if (this.direction === 1) {
            separation = aheadDist - myDist;
            if (separation < 0) separation += this.totalDistance;
        } else {
            separation = myDist - aheadDist;
            if (separation < 0) separation += this.totalDistance;
        }
        
        return separation >= this.minimumHeadway;
    }

    update(deltaTime) {
        // If dwelling, check if dwell time is over.
        if (this.isDwelling) {
            if (Date.now() >= this.dwellUntil) {
                if (this.checkHeadway()) {
                    this.isDwelling = false;
                    this.updateNextStationIndex();
                } else {
                    // Extend dwell time if insufficient headway
                    this.dwellUntil = Date.now() + 1000;
                }
            }
            return;
        }

        // Only move if we have sufficient headway
        if (this.checkHeadway()) {
            const currentSpeed = (this.vehicleType === 'METRO') ? VEHICLE_SPEEDS.METRO : VEHICLE_SPEEDS.LRT;
            this.distance += currentSpeed * deltaTime * timeScale * this.direction;

            // Terminal reversal check
            if (this.distance >= this.totalDistance) {
                this.distance = this.totalDistance;
                this.direction = -1;
                this.isDwelling = true;
                this.dwellUntil = Date.now() + DEFAULT_DWELL_TIME * 1000;
                this.currentStationIndex = this.stations.length - 1;
            } else if (this.distance <= 0) {
                this.distance = 0;
                this.direction = 1;
                this.isDwelling = true;
                this.dwellUntil = Date.now() + DEFAULT_DWELL_TIME * 1000;
                this.currentStationIndex = 0;
            }

            // Station check
            if (this.stations.length > 0) {
                let target = this.stations[this.currentStationIndex];
                if ((this.direction === 1 && this.distance >= target) ||
                    (this.direction === -1 && this.distance <= target)) {
                    this.distance = target;
                    this.isDwelling = true;
                    this.dwellUntil = Date.now() + DEFAULT_DWELL_TIME * 1000;
                    this.updateNextStationIndex();
                }
            }

            // Update marker position
            let posFeature = turf.along(turf.lineString(this.route), this.distance / 1000, {units: "kilometers"});
            if (posFeature && posFeature.geometry && posFeature.geometry.coordinates) {
                let newPos = posFeature.geometry.coordinates;
                this.marker.setLatLng([newPos[1], newPos[0]]);
            }
        }
    }
}


// Global array to hold all the trains.
let trains = [];

// Start simulation: create one train per service route (you can adjust this as needed).
function startSimulation() {
    // Clear existing trains
    trains.forEach(train => train.marker.remove());
    trains = [];

    // Get current schedule settings
    const dayType = document.getElementById("dayTypeSelect").value;
    const timePeriod = document.getElementById("timePeriodSelect").value;
    console.log("*******************");
    console.log(dayType);
    console.log(timePeriod);
    console.log(scheduleData?.["Metro"]?.[dayType]?.[timePeriod].tph);
    console.log("*******************");
    Object.keys(SERVICE_PATTERNS).forEach(lineId => {
        const pattern = SERVICE_PATTERNS[lineId];
        let frequency;
        // Get frequency from schedule, fallback to default if not available
        if (lineId.startsWith("M")) { //Metro Line
            frequency = scheduleData?.["Metro"]?.[dayType]?.[timePeriod].tph || pattern.defaultFrequency;
        } else { //Light Rail Line
            frequency = scheduleData?.["Light Rail"]?.[dayType]?.[lineId[0]]?.[timePeriod].tph|| pattern.defaultFrequency;
        }

        const headway = 60 / frequency;
        
        /* The above code is a JavaScript comment block using a syntax that is not valid in JavaScript.
        The code starts with a traditional JavaScript comment `/*` and ends with a series of `#`
        characters, which is not a valid way to close a comment in JavaScript. This code will likely
        result in a syntax error when executed. */
        console.log(`\nLine ${lineId}: Frequency=${frequency} tph, Headway=${headway} minutes`);
        
        pattern.branches.forEach(branchId => {
            const route = serviceRoutes[branchId];
            if (!route) {
                console.error(`Route data not found for branch: ${branchId}`);
                return;
            }
            const routeLength = turf.length(turf.lineString(route.coords)) * 1000; // in meters
            const roundTripTime = (2 * routeLength) / VEHICLE_SPEEDS[route.type || 'METRO']; // in seconds
            const trainsPerDirection = Math.ceil((roundTripTime / 60) / (2 * headway));
            console.log(`Branch ${branchId}: Length=${Math.round(routeLength/1000)}km, Trains/direction=${trainsPerDirection}`);
            // Create trains for each direction
            [-1, 1].forEach(direction => {
                const directionTrains = [];
                for (let i = 0; i < trainsPerDirection; i++) {
                    // Calculate evenly spaced offsets
                    const spacing = routeLength / trainsPerDirection;
                    const offset = direction === 1 ? 
                        i * spacing : 
                        routeLength - (i * spacing);
                    
                    // Set correct label (1,2,3 for Metro, first letter for others)
                    let trainLabel;
                    if (lineId.startsWith('M')) {
                        trainLabel = lineId.charAt(1); // Gets "1" from "M1", etc.
                    } else {
                        trainLabel = lineId.charAt(0);
                    }
                    
                    let train = new Train(route, trainLabel, lineColours[lineId.split('_')[0]], offset);
                    train.direction = direction;
                    train.branchId = branchId;
                    directionTrains.push(train);
                }
                
                // Link trains together for headway checking
                directionTrains.forEach((train, i) => {
                    train.ahead = directionTrains[(i + 1) % directionTrains.length];
                    train.behind = directionTrains[(i - 1 + directionTrains.length) % directionTrains.length];
                });
                
                trains.push(...directionTrains);
            });
        });
    });

    // Start animation loop
    let lastTime = Date.now();
    function animate() {
        const currentTime = Date.now();
        let deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
        if (deltaTime > 0.1) {
            deltaTime = 0.1; // Cap deltaTime to prevent large time steps
        }
        lastTime = currentTime;
        if (!simPaused) {
            trains.forEach(train => train.update(deltaTime));
        }
        requestAnimationFrame(animate);
    }
    animate();
}