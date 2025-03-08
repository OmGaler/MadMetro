//TODO spread out on spawn more


//TODO: short R23 turns at elifelet

//TODO: enforce headway separation -Before spawning a new train or allowing a train to depart from a station, check the distance to the train ahead.
//TODO: extreme bunching (irrespective of branching??)
//TODO: headways still not being enforced


//TODO: hide all UI elements on 'f'? 

//TODO: hide trainpopup on mouseoff

//todo: perhaps, If bunching is detected, you could gently adjust speeds or extend dwell times at the terminal to restore proper spacing.

//TODO: Some sort of bug where switching the service time will not update the trains or settings modal properly

// TODO: on occasion frequencies will not load so default to rush hour

//add (c) on bottom, of settings more info page 

//------------------
//TODO: settings screen-
//other 
    //link to source code
    //link to the readme, which contains all the disclaimers
    //link to readme for usage instructions
    //disclaimers
    //data from geo.mot.gov.il, openstreetmap
    //this is a simulation, not real data
//appearance
    //languages
//simulation
    //DATE/time
    //sim speed

//------------------


/********************************************
 * Global Constants & Variables
 ********************************************/
const map = L.map('map').setView([32.0853, 34.7818], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
let routeLayersGroup = L.layerGroup().addTo(map);

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
let showRoutes = document.getElementById("toggleRoutes").checked; //show lines and stations, default off
// Simulation constants:
const trainSpeed = 80 * 1000 / 3600; // 80 km/h in m/s
// const timeScale = 30; // 1 real sec = 30 simulated seconds
// let timeScale = 60; // 1 real sec = 1 simulated minute
let timeScale = 300; // 1 real sec = 5 simulated minutes
let DEFAULT_DWELL_TIME = 1; // seconds dwell at each station
const STATION_TOLERANCE = 30; // meters tolerance
const VEHICLE_SPEEDS = {
    METRO: 80 * 1000 / 3600, //80kmh
    LRT: 60 * 1000 / 3600 //60kmh
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
    R: {
        branches: ['R1', 'R23'],
        defaultFrequency: 17,
        branchFrequency: 1 / 2
    },
    P: {
        branches: ['P1', 'P2'],
        defaultFrequency: 20,
        branchFrequency: 1 / 2
    },
    G: {
        branches: ['G1', 'G2', 'G3', 'G4'],
        defaultFrequency: 20,
        branchFrequency: 1 / 4
    }
};

/********************************************
 * Localisation & Time Period Options
 ********************************************/
// Load translations from JSON and then update UI elements.
fetch("data/translations.json")
    .then(response => response.json())
    .then(data => {
        translations = data;
        updateLanguage(currentLang);
        updateTimePeriodOptions();
        updateLineInfo();
        updateSpeed();

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
    document.getElementById("readmelink").href = translations[lang]["readme-link"];
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    localStorage.setItem("language", lang);
    //repopulate day and time period options
    updateCustomSelectOptions("dayTypeSelect");
    updateTimePeriodOptions();
    updateLineInfo();
    updateSpeed();
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
    updateCustomSelectOptions("timePeriodSelect");
}

// Function to update custom select display after options change
function updateCustomSelectOptions(selectId) {
    const select = document.getElementById(selectId);
    const customSelectContainer = select.closest('.custom-select');
    if (!customSelectContainer) return;
    // Update the selected text display based on the actual select value
    const selectSelected = customSelectContainer.querySelector('.select-selected');
    // Set it to the currently selected option text
    if (select.selectedIndex >= 0) {
        selectSelected.textContent = select.options[select.selectedIndex].textContent;
    }
    // Rebuild the dropdown items list
    const selectItems = customSelectContainer.querySelector('.select-items');
    selectItems.innerHTML = '';
    Array.from(select.options).forEach((option, index) => {
        const div = document.createElement('div');
        div.textContent = option.textContent;
        div.addEventListener('click', function() {
            select.selectedIndex = index;
            selectSelected.textContent = this.textContent;
            selectItems.style.display = "none";            
            const event = new Event('change', { bubbles: true });
            select.dispatchEvent(event);
        });
        selectItems.appendChild(div);
    });
    
}

const toggleRoutesCheckbox = document.getElementById("toggleRoutes");
toggleRoutesCheckbox.addEventListener("change", function() {
    showRoutes = this.checked;
    toggleDisplayRoutes();
});

function toggleDisplayRoutes() {
    if (showRoutes) {
        map.addLayer(routeLayersGroup);
    } else {
        map.removeLayer(routeLayersGroup);
    }
}

// Tab Switching Logic
document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll('.tab-link').forEach(link => {
        link.addEventListener('click', function() {
            // Remove active class from all tab links and content
            document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            // Activate the clicked tab
            this.classList.add('active');
            const targetTab = this.getAttribute('data-tab');
            document.getElementById(targetTab).classList.add('active');
        });
    });
    updateTimePeriodOptions();
    // Manually trigger a day change to update line details
    document.getElementById("dayTypeSelect").dispatchEvent(new Event("change"));
});
    
// Define allowed simulation speeds
const speedValues = [30, 60, 180, 300, 420];
const speedSlider = document.getElementById("speedSlider");
// const speedValue = document.getElementById("speedValue");
const realTimeInfo = document.getElementById("realTimeInfo");

// Function to update speed display
function updateSpeed() {
    let index = parseInt(speedSlider.value);
    let simSpeed = speedValues[index];
    // speedValue.textContent = `${simSpeed}x`;
    realTimeInfo.textContent = `${translations[currentLang]["seconds"]} = ${simSpeed / 60} ${translations[currentLang]["minutes"]}`;
    timeScale = simSpeed; 
    if (timeScale > 100) {
        DEFAULT_DWELL_TIME = 0.25;
    } else {
        DEFAULT_DWELL_TIME = 1;
    }
    console.log("Simulation speed updated to:", timeScale, "simulation seconds per real second");
}

// Update on slider change
speedSlider.addEventListener("input", updateSpeed);

// Dark Mode Logic
document.getElementById('darkModeButton').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode') ? 'enabled' : null);
});
// Load dark mode preference
if (localStorage.getItem("darkMode") === "enabled") {
    document.getElementById('darkModeButton').checked = true;
    document.body.classList.add("dark-mode");
}

/********************************************
 * UI Controls: Pause, Settings, & Pop-up
 ********************************************/
// Pause controls
document.addEventListener("keydown", function (event) {
    if (event.code === "Space" || event.key.toLowerCase() === "p") {
        simPaused = !simPaused;
        document.getElementById("pause").innerHTML = simPaused ? "<ion-icon name='play'></ion-icon>" : "<ion-icon name='pause'></ion-icon>";
        event.preventDefault();
    } else if (event.key.toLowerCase() === "f") {
        
    } else if (event.key.toLowerCase() === "s") { //toggle settings
        if (settingsModal.style.display === "block") { //if settings open, close it else open
            settingsModal.style.display = "none";
            simPaused = false;
            document.getElementById("pause").innerHTML = "<ion-icon name='pause'></ion-icon>";
            event.preventDefault();
        } else {
            settingsModal.style.display = "flex";
            simPaused = true;
            document.getElementById("pause").innerHTML = "<ion-icon name='play'></ion-icon>";
            event.preventDefault();
        }
    }
});

document.getElementById("pause").addEventListener("click", function () {
    simPaused = !simPaused;
    this.innerHTML = simPaused ? "<ion-icon name='play'></ion-icon>" : "<ion-icon name='pause'></ion-icon>";
});

// Settings modal controls
const settingsButton = document.getElementById("settings");
const settingsModal = document.getElementById("settingsModal");
const closeModal = document.getElementsByClassName("close")[0];
settingsButton.addEventListener("click", function () {
    settingsModal.style.display = "flex";
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

// function wrapLtr(text) { // Wrap text in a span with LTR direction (for numbers in RTL text)
//     return `<span dir="ltr">${text}</span>`;
// }

function updateLineInfo() {
    const dayType = document.getElementById("dayTypeSelect").value;
    const timePeriod = document.getElementById("timePeriodSelect").value;
    const container = document.getElementById("lineContainer");
    container.innerHTML = ""; // Clear previous info

    Object.keys(SERVICE_PATTERNS).forEach(lineId => {
        const pattern = SERVICE_PATTERNS[lineId];
        let frequency;
        if (lineId.startsWith("M")) { // Metro
            frequency = scheduleData?.["Metro"]?.[dayType]?.[timePeriod]?.tph || pattern.defaultFrequency;
        } else { // Light Rail
            frequency = scheduleData?.["Light Rail"]?.[dayType]?.[lineId[0]]?.[timePeriod]?.tph || pattern.defaultFrequency;
        }
        const headway = Math.round((60 / frequency) * 2) / 2; //round to the nearest 0.5
        // Use manual data for line length and stops.
        const line = lineData[lineId] || {
            length: "N/A",
            stations: "N/A"
        };
        // Create a container div for this line.
        const lineDiv = document.createElement("div");
        lineDiv.style.marginBottom = "10px";
        lineDiv.style.display = "inline-flex";
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
const customSelects = document.querySelectorAll(".custom-select");
        
customSelects.forEach(select => {
    const selectSelected = select.querySelector(".select-selected");
    const selectItems = select.querySelector(".select-items");
    const selectOptions = select.querySelectorAll(".select-items div");
    const originalSelect = select.querySelector("select");
    
    // Toggle dropdown visibility
    selectSelected.addEventListener("click", function(e) {
        e.stopPropagation();
        closeAllSelects(this);
        selectItems.style.display = selectItems.style.display === "block" ? "none" : "block";
        this.classList.toggle("select-arrow-active");
    });
    // Handle option selection
    selectOptions.forEach((option, index) => {
        option.addEventListener("click", function(e) {
            // Update the original select
            originalSelect.selectedIndex = index;
            // Update the selected text
            selectSelected.textContent = this.textContent;
            // Close the dropdown
            selectItems.style.display = "none"; 
            // Trigger the change event on the original select
            const event = new Event('change', { bubbles: true });
            originalSelect.dispatchEvent(event);
        });
    });
    
    // Close dropdowns when clicking elsewhere
    document.addEventListener("click", closeAllSelects);
});

function closeAllSelects(elmnt) {
    const selectItems = document.querySelectorAll(".select-items");
    const selectSelected = document.querySelectorAll(".select-selected");
    
    selectItems.forEach((items, index) => {
        if (elmnt !== selectSelected[index]) {
            items.style.display = "none";
            selectSelected[index].classList.remove("select-arrow-active");
        }
    });
}

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
        // Visualise service routes and station markers
        // if (showRoutes) {
        
            Object.keys(serviceRoutes).forEach(key => {
                let routeObj = serviceRoutes[key];
                const latlngs = routeObj.coords.map(coord => [coord[1], coord[0]]);
                let c = key.charAt(0) === "M" ? lineColours[key.substring(0, 2)] : lineColours[key.charAt(0)];
                L.polyline(latlngs, {
                    color: c,
                    weight: 4,
                    opacity: 0.75,
                    // dashArray: "5,5"
                }).addTo(routeLayersGroup);
                let lineStr = turf.lineString(routeObj.coords);
                routeObj.stations.forEach(dist => {
                    let snapped = turf.along(lineStr, dist["distance"] / 1000, {
                        units: "kilometers"
                    });
                    if (snapped && snapped.geometry && snapped.geometry.coordinates) {
                        let coord = snapped.geometry.coordinates;
                        L.circleMarker([coord[1], coord[0]], {
                            radius: 2,
                            color: "black",
                            fillOpacity: 0.6
                        }).addTo(routeLayersGroup);
                    }
                });
            });
            if (!showRoutes) {
                map.removeLayer(routeLayersGroup);
            }
        // }
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
            'LRT';
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
            this.nextStationIndex = this.currentStationIndex;// + 1;
            if (this.nextStationIndex >= this.stationData.length) {
                this.nextStationIndex = this.stationData.length - 1;
            }
        } else {
            this.nextStationIndex = this.currentStationIndex//; - 1;
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
            //divide by two as trains per direction is half of total trains needed
            const trainsPerDirection = Math.ceil((roundTripTime / 60) / (headway)/2); 

            console.log(`Branch ${branchId}: Length=${Math.round(routeLength/1000)}km, Trains/direction=${trainsPerDirection}`);
            //Spawn required trains in each direction, but do it alternating between directions (plus offset) to 
            //spawn them spread out better (that is- trains of different directions aren't bunched together)
            const totalTrains = 2 * trainsPerDirection; // Total number of trains (both directions)
            const directionTrains = { "-1": [], "1": [] };

            const oppositeDirOffset = (routeLength / totalTrains) / 2; // Offset to stagger opposite direction

            for (let i = 0; i < totalTrains; i++) {
                const direction = i % 2 === 0 ? 1 : -1; // Alternate directions
                const index = Math.floor(i / 2); // Half as many trains per direction
                const spacing = routeLength / trainsPerDirection;
                
                let offset;
                if (direction === 1) {
                    offset = index * spacing;
                } else {
                    offset = routeLength - (index * spacing) - oppositeDirOffset; // Stagger opposite direction
                }
                
                let trainLabel = lineId.startsWith('M') ? lineId.charAt(1) : lineId.charAt(0);
                let train = new Train(route, trainLabel, lineColours[lineId.split('_')[0]], offset);
                train.direction = direction;
                train.branchId = branchId;
                
                directionTrains[direction].push(train);
            }

            // Link trains within each direction
            [-1, 1].forEach(direction => {
                const trainsInDir = directionTrains[direction];
                trainsInDir.forEach((train, i) => {
                    train.ahead = trainsInDir[(i + 1) % trainsInDir.length];
                    train.behind = trainsInDir[(i - 1 + trainsInDir.length) % trainsInDir.length];
                });
                trains.push(...trainsInDir);
            });

            // [-1, 1].forEach(direction => {
            //     const directionTrains = [];
            //     for (let i = 0; i < trainsPerDirection; i++) {
            //         const spacing = routeLength / trainsPerDirection;
            //         const offset = direction === 1 ? i * spacing : routeLength - (i * spacing);
            //         let trainLabel;
            //         if (lineId.startsWith('M')) {
            //             trainLabel = lineId.charAt(1);
            //         } else {
            //             trainLabel = lineId.charAt(0);
            //         }
            //         let train = new Train(route, trainLabel, lineColours[lineId.split('_')[0]], offset);
            //         train.direction = direction;
            //         train.branchId = branchId;
            //         directionTrains.push(train);
            //     }
            //     directionTrains.forEach((train, i) => {
            //         train.ahead = directionTrains[(i + 1) % directionTrains.length];
            //         train.behind = directionTrains[(i - 1 + directionTrains.length) % directionTrains.length];
            //     });
            //     trains.push(...directionTrains);
            // });
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