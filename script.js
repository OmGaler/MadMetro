//TODO spread out on spawn more

//TODO: up max metro speed to 80kmh, max LRT speed to 70 (ug and 50 overground???), tweak sim speed
// TODO ensure traveltime is calculated with average speed 
//TODO: short R23 turns at elifelet

//TODO: enforce headway separation -Before spawning a new train or allowing a train to depart from a station, check the distance to the train ahead.
//TODO: extreme bunching (irrespective of branching??)
//TODO: headways still not being enforced


//TODO: in precomputed, add english names to light rail, and clean up the qualifiers for termini and others, e.g. Tel Aviv, HaShalom and Holon, Wolfson
//Bat Yam, HaKom
//TODO: hide all UI elements on 'f'? 

//TODO: hide trainpopup on mouseoff

//TODO: On occasion a train will show next station as a station after the next 
//TODO: settins modal doesnt update languages, probably because the updatelang function doesnt have jurisdication on it
//------------------
//settings screen-
//configurable timescale
//configurable service day/times
//languages
//disclaimers
//data from geo.mot.gov.il, openstreetmap
//this is a simulation, not real data
//link to the readme, which contains all the disclaimers
//------------------


/********************************************
 * Global Constants & Variables
 ********************************************/
const map = L.map('map').setView([32.0853, 34.7818], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const lineColours = {
    "M1": "#0971ce", // blue
    "M2": "#fd6b0d", // orange
    "M3": "#fec524", // yellow
    "R": "#ff0000", // red
    "P": "#800080", // purple
    "G": "#008000" // green
};

const lineData = {
    "M1": {
        length: 85,
        stations: 62
    },
    "M2": {
        length: 26,
        stations: 22
    },
    "M3": {
        length: 39,
        stations: 25
    },
    "R": {
        length: 24,
        stations: 38
    },
    "P": {
        length: 27,
        stations: 46
    },
    "G": {
        length: 39,
        stations: 62
    }
}
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
    "R1": "data/LRT/dankal_lrt_R1.geojson",
    "R23": "data/LRT/dankal_lrt_R23.geojson",
    "G1": "data/LRT/dankal_lrt_G1.geojson",
    "G2": "data/LRT/dankal_lrt_G2.geojson",
    "G3": "data/LRT/dankal_lrt_G3.geojson",
    "G4": "data/LRT/dankal_lrt_G4.geojson"
};

let simPaused = false;
let day, time;
let translations = {};
let currentLang = localStorage.getItem("language") || "en";
let scheduleData = null;
let serviceRoutes = {}; // Loaded from preprocessed_station_distances.json
let trains = [];
let showRoutes = true;
// Simulation constants:
const trainSpeed = 80 * 1000 / 3600; // 80 km/h in m/s
const timeScale = 60; // 1 real sec = 1 simulated minute
const DEFAULT_DWELL_TIME = 1; // seconds dwell at each station
const STATION_TOLERANCE = 30; // meters tolerance
const VEHICLE_SPEEDS = {
    METRO: 80 * 1000 / 3600,
    LRT: 60 * 1000 / 3600
};
const SERVICE_PATTERNS = {
    M1: {
        branches: ['M1_NESE', 'M1_NWSE', 'M1_NESW', 'M1_NWSW'],
        defaultFrequency: 20,
        branchFrequency: 1 / 4
    },
    M2: {
        branches: ['M2'],
        defaultFrequency: 20,
        branchFrequency: 1
    },
    M3: {
        branches: ['M3', 'M3_Shuttle'],
        defaultFrequency: 20,
        branchFrequency: 1
    },
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

/********************************************
 * Localization & Time Period Options
 ********************************************/
// Load translations from JSON and then update UI elements.
fetch("data/translations.json")
    .then(response => response.json())
    .then(data => {
        translations = data;
        updateLanguage(currentLang);
        updateTimePeriodOptions();
        updateLineInfo();
    })
    .catch(error => console.error("Error loading translations:", error));

function updateLanguage(lang) {
    currentLang = lang;
    // Update all elements with the data-i18n attribute.
    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (translations[lang] && translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    localStorage.setItem("language", lang);
    //repopulate time period options
    updateTimePeriodOptions();
}

function toggleLanguage() {
    const newLang = currentLang === "en" ? "he" : "en";
    updateLanguage(newLang);
}

function updateTimePeriodOptions() {
    const dayTypeSelect = document.getElementById("dayTypeSelect");
    const timePeriodSelect = document.getElementById("timePeriodSelect");
    const selectedDayType = dayTypeSelect.value;
    timePeriodSelect.innerHTML = "";
    if (translations[currentLang] && translations[currentLang].timePeriods && translations[currentLang].timePeriods[selectedDayType]) {
        const periods = translations[currentLang].timePeriods[selectedDayType];
        periods.forEach(option => {
            const opt = document.createElement("option");
            opt.value = option.value;
            opt.textContent = option.text;
            timePeriodSelect.appendChild(opt);
        });
    }
}

/********************************************
 * UI Controls: Pause, Settings, & Pop-up
 ********************************************/
// Pause controls
document.getElementById("pause").addEventListener("click", function () {
    simPaused = !simPaused;
    this.innerHTML = simPaused ? "<ion-icon name='play'></ion-icon>" : "<ion-icon name='pause'></ion-icon>";
});
document.addEventListener("keydown", function (event) {
    if (event.code === "Space" || event.key.toLowerCase() === "p") {
        simPaused = !simPaused;
        document.getElementById("pause").innerHTML = simPaused ? "<ion-icon name='play'></ion-icon>" : "<ion-icon name='pause'></ion-icon>";
        event.preventDefault();
    }
});

// Settings modal controls
const settingsButton = document.getElementById("settings");
const settingsModal = document.getElementById("settingsModal");
const closeModal = document.getElementsByClassName("close")[0];
settingsButton.addEventListener("click", function () {
    settingsModal.style.display = "block";
    simPaused = true;
    document.getElementById("pause").innerHTML = "<ion-icon name='play'></ion-icon>";
});
closeModal.addEventListener("click", function () {
    settingsModal.style.display = "none";
    simPaused = false;
    document.getElementById("pause").innerHTML = "<ion-icon name='pause'></ion-icon>";
});
window.addEventListener("click", function (event) {
    if (event.target === settingsModal) {
        settingsModal.style.display = "none";
        simPaused = false;
        document.getElementById("pause").innerHTML = "<ion-icon name='pause'></ion-icon>";
    }
});

function wrapLtr(text) { // Wrap text in a span with LTR direction (for numbers in RTL text)
    return `<span dir="ltr">${text}</span>`;
}

function updateLineInfo() {
    const dayType = document.getElementById("dayTypeSelect").value;
    const timePeriod = document.getElementById("timePeriodSelect").value;
    const container = document.getElementById("lineInfo");
    container.innerHTML = ""; // Clear previous info

    Object.keys(SERVICE_PATTERNS).forEach(lineId => {
        const pattern = SERVICE_PATTERNS[lineId];
        let frequency;
        if (lineId.startsWith("M")) { // Metro
            frequency = scheduleData?.["Metro"]?.[dayType]?.[timePeriod]?.tph || pattern.defaultFrequency;
        } else { // Light Rail
            frequency = scheduleData?.["Light Rail"]?.[dayType]?.[lineId[0]]?.[timePeriod]?.tph || pattern.defaultFrequency;
        }
        // Since schedule values are per-direction, no division is needed.
        const headway = Math.round((60 / frequency * 2) / 2); //round to the nearest 0.5
        // Use manual data for line length and stops.
        const line = lineData[lineId] || {
            length: "N/A",
            stations: "N/A"
        };
        // Create a container div for this line.
        const lineDiv = document.createElement("div");
        lineDiv.style.marginBottom = "10px";
        // Create a bullet element (a small circle with the line label).
        const bullet = document.createElement("span");
        bullet.classList.add("bullet");
        if (lineId.startsWith("M")) {
            bullet.style.backgroundColor = lineColours[lineId] || "#777";
            bullet.textContent = lineId.charAt(1);
        } else {
            bullet.style.backgroundColor = lineColours[lineId.charAt(0)] || "#777";
            bullet.textContent = lineId.charAt(0);
        }
        bullet.style.marginInlineEnd = "10px";
        
        bullet.style.color = "white";
        bullet.style.display = "inline-flex";
        // Create the info text
        const infoText = document.createTextNode(
            `${translations[currentLang]["frequency"]}: ${frequency} ${translations[currentLang]["tph"]}, ` +
            `${translations[currentLang]["headway"]}: ${headway} ${translations[currentLang]["mins"]}, ` +
            `${translations[currentLang]["length"]}: ${line.length} ${translations[currentLang]["km"]}, ` +
            `${translations[currentLang]["stations"]}: ${line.stations}`
        );
        lineDiv.appendChild(bullet);
        lineDiv.appendChild(infoText);
        container.appendChild(lineDiv);
    });
}
// Train info pop-up: clicking anywhere outside the pop-up closes it.
document.addEventListener('click', function (event) {
    const popup = document.getElementById("trainPopup");
    // If the popup or the marker itself was clicked, do nothing
    if (popup.contains(event.target) || event.target.closest(".train-marker")) {
        return;
    }

    hideTrainPopup();
});

function hideTrainPopup() {
    const popup = document.getElementById("trainPopup");
    popup.style.display = "none";
    popup.dataset.manualOpen = "false"; // Reset manual open state
}
/********************************************
 * Day/Time Controls & Operation Settings
 ********************************************/
document.getElementById("dayTypeSelect").addEventListener("change", function () {
    updateTimePeriodOptions();
    updateOperationSettings();
    updateLineInfo();
});
document.getElementById("timePeriodSelect").addEventListener("change", function () {
    updateOperationSettings();
    updateLineInfo();
});

function updateOperationSettings() {
    const dayType = document.getElementById("dayTypeSelect").value;
    const timePeriod = document.getElementById("timePeriodSelect").value;
    day = dayType;
    time = timePeriod;
    startSimulation();
}

/********************************************
 * Load Service Data & Start Simulation
 ********************************************/
Promise.all([
        fetch('data/schedule.json').then(res => {
            if (!res.ok) throw new Error("Failed to load schedule data");
            return res.json();
        }),
        fetch('data/preprocessed_station_distances.json').then(res => {
            if (!res.ok) throw new Error("Failed to load preprocessed station distances");
            return res.json();
        })
    ])
    .then(([schedule, routes]) => {
        scheduleData = schedule;
        serviceRoutes = routes;
        console.log("Loaded schedule data:", scheduleData);
        console.log("Loaded service routes:", serviceRoutes);

        // Visualize service routes and station markers
        if (showRoutes) {

            Object.keys(serviceRoutes).forEach(key => {
                let routeObj = serviceRoutes[key];
                const latlngs = routeObj.coords.map(coord => [coord[1], coord[0]]);
                L.polyline(latlngs, {
                    color: "green",
                    weight: 4,
                    opacity: 0.7,
                    dashArray: "5,5"
                }).addTo(map).bindPopup(`Service Route: ${key}`);
                let lineStr = turf.lineString(routeObj.coords);
                routeObj.stations.forEach(dist => {
                    let snapped = turf.along(lineStr, dist["distance"] / 1000, {
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
        }
        // Start the simulation 
        startSimulation();
    })
    .catch(error => console.error("Error loading data:", error));

/********************************************
 * Train Class
 ********************************************/
class Train {
    constructor(route, label, color, offset = 0) {
        // Extract the route coordinates.
        this.route = route.coords; // Array of [lon, lat]
        // Extract station distances as numbers.
        // Also keep the full station objects in stationData.
        this.stations = (route.stations && Array.isArray(route.stations)) ?
            route.stations.map(s => Number(s.distance)).sort((a, b) => a - b) :
            [];
        this.stationData = (route.stations && Array.isArray(route.stations)) ?
            route.stations.slice() // make a shallow copy of the station objects
            :
            [];

        this.label = label;
        this.color = color;
        this.totalDistance = turf.length(turf.lineString(this.route)) * 1000; // in meters
        this.distance = offset;
        this.direction = 1; // 1 for forward, -1 for reverse
        this.isDwelling = false;
        this.dwellUntil = 0;
        this.currentStationIndex = 0;
        // For next station lookup based on stationData.
        this.nextStationIndex = 1;
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

        // When train marker is clicked, show pop-up with route bullet and station info.
        this.marker.on("click", event => {
            event.originalEvent.stopPropagation();
            // Update station info before showing popup.
            this.updateStationInfo();
            const popup = document.getElementById("trainPopup");
            const routeBullet = document.getElementById("popupRouteBullet");
            const destElem = document.getElementById("popupDestination");
            const nsElem = document.getElementById("popupNextStop");

            routeBullet.textContent = this.label;
            routeBullet.style.backgroundColor = this.color;
            routeBullet.style.color = "white";

            destElem.textContent = `${translations[currentLang]["destination"]}: ${this.getCurrentDestination()}`;
            nsElem.textContent = `${translations[currentLang]["next-stop"]}: ${this.getNextStation()}`;

            popup.style.display = "flex";
            popup.dataset.manualOpen = "true"; // Mark as manually opened.
        });

        // On hover, show popup with auto-close after 4 seconds.
        this.marker.on("mouseover", event => {
            event.originalEvent.stopPropagation();
            this.updateStationInfo();
            const popup = document.getElementById("trainPopup");
            const routeBullet = document.getElementById("popupRouteBullet");
            const destElem = document.getElementById("popupDestination");
            const nsElem = document.getElementById("popupNextStop");

            routeBullet.textContent = this.label;
            routeBullet.style.backgroundColor = this.color;
            routeBullet.style.color = "white";

            destElem.textContent = `${translations[currentLang]["destination"]}: ${this.getCurrentDestination()}`;
            nsElem.textContent = `${translations[currentLang]["next-stop"]}: ${this.getNextStation()}`;

            popup.style.display = "flex";
            popup.dataset.manualOpen = "false";

            clearTimeout(window.trainPopupTimeout);
            window.trainPopupTimeout = setTimeout(() => {
                if (popup.dataset.manualOpen !== "true") {
                    hideTrainPopup();
                }
            }, 2500); //auto close after 2.5 seconds 
        });

        // Determine vehicle type (Metro if label is "1","2","3", else LRT)
        this.vehicleType = (this.label === "1" || this.label === "2" || this.label === "3") ?
            'METRO' :
            'LRT_SURFACE';
        this.minimumHeadway = 90; // Minimum separation in meters
        this.branchId = null; // To be set when spawning trains.
        this.ahead = null;
        this.behind = null;
    }

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

    getCurrentDestination() {
        // Assume destination is the terminal station.
        // For forward direction, use the last station's name; for reverse, the first.
        if (this.stationData.length === 0) return "";
        if (this.direction === 1) {
            return this.stationData[this.stationData.length - 1].name[currentLang];
        } else {
            return this.stationData[0].name[currentLang];
        }
    }

    getNextStation() {
        if (this.nextStationIndex >= 0 && this.nextStationIndex < this.stationData.length) {
            return this.stationData[this.nextStationIndex].name[currentLang];
        }
        return translations[currentLang]["terminus"];
    }

    updateStationInfo() {
        // Instead of recalculating the current station (which conflicts with updateNextStationIndex),
        // simply update the nextStationIndex based on the current station and direction.
        if (this.direction === 1) {
            this.nextStationIndex = this.currentStationIndex + 1;
            if (this.nextStationIndex >= this.stationData.length) {
                this.nextStationIndex = this.stationData.length - 1;
            }
        } else {
            this.nextStationIndex = this.currentStationIndex - 1;
            if (this.nextStationIndex < 0) {
                this.nextStationIndex = 0;
            }
        }
    }


    checkHeadway() {
        if (!this.ahead || this.ahead === this) return true;
        const aheadDist = this.ahead.distance;
        const myDist = this.distance;
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

        if (this.isDwelling) {
            if (Date.now() >= this.dwellUntil) {
                if (this.checkHeadway()) {
                    this.isDwelling = false;
                    this.updateNextStationIndex();
                    this.updateStationInfo();
                } else {
                    this.dwellUntil = Date.now() + 1000;
                }
            }
            return;
        }
        if (this.checkHeadway()) {
            const currentSpeed = (this.vehicleType === 'METRO') ?
                VEHICLE_SPEEDS.METRO :
                VEHICLE_SPEEDS.LRT;

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
            // Station check: if the train reaches (or passes) a station target, dwell.

            if (this.stations.length > 0) {
                let target = this.stations[this.currentStationIndex];
                if ((this.direction === 1 && this.distance >= target) ||
                    (this.direction === -1 && this.distance <= target)) {
                    this.distance = target;
                    this.isDwelling = true;
                    this.dwellUntil = Date.now() + DEFAULT_DWELL_TIME * 1000;
                    this.updateNextStationIndex();
                    this.updateStationInfo();
                }

            }
            let posFeature = turf.along(turf.lineString(this.route), this.distance / 1000, {
                units: "kilometers"
            });
            if (posFeature && posFeature.geometry && posFeature.geometry.coordinates) {
                let newPos = posFeature.geometry.coordinates;
                this.marker.setLatLng([newPos[1], newPos[0]]);
            }
        }
    }
}

/********************************************
 * Simulation Setup & Animation Loop
 ********************************************/
let frameId;

function startSimulation() {
    // Clear existing trains
    trains.forEach(train => train.marker.remove());
    trains = [];
    // Get current schedule settings
    const dayType = document.getElementById("dayTypeSelect").value;
    const timePeriod = document.getElementById("timePeriodSelect").value;
    console.log("Day Type:", dayType);
    console.log("Time Period:", timePeriod);
    console.log("Metro schedule:", scheduleData?.["Metro"]?.[dayType]?.[timePeriod]?.tph);
    Object.keys(SERVICE_PATTERNS).forEach(lineId => {
        const pattern = SERVICE_PATTERNS[lineId];
        let frequency;
        if (lineId.startsWith("M")) { // Metro
            frequency = scheduleData?.["Metro"]?.[dayType]?.[timePeriod]?.tph || pattern.defaultFrequency;
        } else { // Light Rail
            frequency = scheduleData?.["Light Rail"]?.[dayType]?.[lineId[0]]?.[timePeriod]?.tph || pattern.defaultFrequency;
        }
        console.log(`\nLine ${lineId}: Frequency=${frequency} tph, Headway=${60/frequency} minutes`);
        frequency *= pattern.branchFrequency; // Adjust frequency for branches
        const headway = 60 / frequency;

        pattern.branches.forEach(branchId => {
            const route = serviceRoutes[branchId];
            if (!route) {
                console.error(`Route data not found for branch: ${branchId}`);
                return;
            }
            const routeLength = turf.length(turf.lineString(route.coords)) * 1000;
            let vtype; // Vehicle type
            // Use a heuristic average speed to account for stopping, accelerating and decelerating.
            let avgSpeed;
            if (branchId.charAt(0) === 'M') {
                vtype = "METRO";
                if (branchId === 'M3_Shuttle') {
                    //do not decrease the average speed for the shuttle, as it makes no stops
                    avgSpeed = VEHICLE_SPEEDS[vtype]; 
                } else {
                    avgSpeed = VEHICLE_SPEEDS[vtype] * 0.5; 
                }
            } else {
                vtype = "LRT"; 
                avgSpeed = VEHICLE_SPEEDS[vtype] * 0.42;  
            } 
            const roundTripTime = (2 * routeLength) / avgSpeed;
            const trainsPerDirection = Math.ceil((roundTripTime / 60) / (headway));
            console.log(`Branch ${branchId}: Length=${Math.round(routeLength/1000)}km, Trains/direction=${trainsPerDirection}`);

            [-1, 1].forEach(direction => {
                const directionTrains = [];
                for (let i = 0; i < trainsPerDirection; i++) {
                    const spacing = routeLength / trainsPerDirection;
                    const offset = direction === 1 ? i * spacing : routeLength - (i * spacing);
                    let trainLabel;
                    if (lineId.startsWith('M')) {
                        trainLabel = lineId.charAt(1);
                    } else {
                        trainLabel = lineId.charAt(0);
                    }
                    let train = new Train(route, trainLabel, lineColours[lineId.split('_')[0]], offset);
                    train.direction = direction;
                    train.branchId = branchId;
                    directionTrains.push(train);
                }
                directionTrains.forEach((train, i) => {
                    train.ahead = directionTrains[(i + 1) % directionTrains.length];
                    train.behind = directionTrains[(i - 1 + directionTrains.length) % directionTrains.length];
                });
                trains.push(...directionTrains);
            });
        });
    });
    if (frameId) cancelAnimationFrame(frameId); // Stop previous animation loop to prevent multiple loops and sim slowing down
    let lastTime = Date.now();

    function animate() {
        const currentTime = Date.now();
        let deltaTime = (currentTime - lastTime) / 1000;
        if (deltaTime > 0.1) deltaTime = 0.1;
        lastTime = currentTime;
        if (!simPaused) {
            trains.forEach(train => train.update(deltaTime));
        }
        frameId = requestAnimationFrame(animate);
    }
    animate();
}