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

// Train info pop-up: clicking anywhere outside the pop-up closes it.
document.addEventListener('click', function () {
    document.getElementById("trainPopup").style.display = "none";
});

/********************************************
 * Day/Time Controls & Operation Settings
 ********************************************/
document.getElementById("dayTypeSelect").addEventListener("change", function () {
    updateTimePeriodOptions();
    updateOperationSettings();
});
document.getElementById("timePeriodSelect").addEventListener("change", updateOperationSettings);

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
        // Start the simulation
        startSimulation();
    })
    .catch(error => console.error("Error loading data:", error));

/********************************************
 * Train Class
 ********************************************/
class Train {
    constructor(route, label, color, offset = 0) {
        this.route = route.coords; // Array of [lon, lat]
        this.stations = route.stations; // Sorted station distances in meters
        this.label = label;
        this.color = color;
        this.totalDistance = turf.length(turf.lineString(this.route)) * 1000;
        this.distance = offset;
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

        // When train marker is clicked, show pop-up with route bullet and placeholders.
        this.marker.on('click', event => {
            event.originalEvent.stopPropagation();
            const popup = document.getElementById("trainPopup");
            const routeBullet = document.getElementById("popupRouteBullet");
            routeBullet.textContent = this.label;
            routeBullet.style.backgroundColor = this.color;
            routeBullet.style.color = "white";
            popup.style.display = "flex";
        });

        // Determine vehicle type (Metro if label is "1", "2", or "3", else LRT)
        this.vehicleType = (this.label === "1" || this.label === "2" || this.label === "3") ? 'METRO' : 'LRT_SURFACE';
        this.minimumHeadway = 90; // Minimum separation in meters
        this.branchId = null; // Set later when spawning trains
        this.ahead = null;
        this.behind = null;
    }

    updateNextStationIndex() {
        const epsilon = 5;
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
                } else {
                    this.dwellUntil = Date.now() + 1000;
                }
            }
            return;
        }
        if (this.checkHeadway()) {
            const currentSpeed = (this.vehicleType === 'METRO') ? VEHICLE_SPEEDS.METRO : VEHICLE_SPEEDS.LRT;
            this.distance += currentSpeed * deltaTime * timeScale * this.direction;
            // Terminal reversal
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
function startSimulation() {
    // Clear existing trains
    trains.forEach(train => train.marker.remove());
    trains = [];

    // Get current schedule settings
    const dayType = document.getElementById("dayTypeSelect").value;
    const timePeriod = document.getElementById("timePeriodSelect").value;
    console.log("Day Type:", dayType);
    console.log("Time Period:", timePeriod);
    console.log("Metro schedule:", scheduleData ?.["Metro"]?.[dayType] ?.[timePeriod]?.tph);

    Object.keys(SERVICE_PATTERNS).forEach(lineId => {
        const pattern = SERVICE_PATTERNS[lineId];
        let frequency;
        if (lineId.startsWith("M")) { // Metro
            frequency = scheduleData ?.["Metro"]?.[dayType]?.[timePeriod]?.tph || pattern.defaultFrequency;
        } else { // Light Rail
            frequency = scheduleData ?.["Light Rail"] ?.[dayType]?.[lineId[0]]?.[timePeriod]?.tph || pattern.defaultFrequency;
        }
        const headway = 60 / frequency;
        console.log(`Line ${lineId}: Frequency=${frequency} tph, Headway=${headway} minutes`);

        pattern.branches.forEach(branchId => {
            const route = serviceRoutes[branchId];
            if (!route) {
                console.error(`Route data not found for branch: ${branchId}`);
                return;
            }
            const routeLength = turf.length(turf.lineString(route.coords)) * 1000;
            const roundTripTime = (2 * routeLength) / VEHICLE_SPEEDS[route.type || 'METRO'];
            const trainsPerDirection = Math.ceil((roundTripTime / 60) / (2 * headway));
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

    let lastTime = Date.now();

    function animate() {
        const currentTime = Date.now();
        let deltaTime = (currentTime - lastTime) / 1000;
        if (deltaTime > 0.1) deltaTime = 0.1;
        lastTime = currentTime;
        if (!simPaused) {
            trains.forEach(train => train.update(deltaTime));
        }
        requestAnimationFrame(animate);
    }
    animate();
}