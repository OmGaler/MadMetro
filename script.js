import { buildGraph, dijkstraWithTransfers, reconstructPathWithTransfers } from './wayfinder.js';

/********************************************
 * Global Constants & Variables
 ********************************************/
const map = L.map('map').setView([32.0853, 34.7818], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

let routeLayersGroup = L.layerGroup().addTo(map);
let railTrainsLayerGroup = L.layerGroup().addTo(map);
let railRoutesLayerGroup = L.layerGroup().addTo(map);
let wayfindLayersGroup = L.layerGroup().addTo(map);
let stationDotsLayerGroup = L.layerGroup().addTo(map);
let wayfinderRouteStnsLayerGroup = L.layerGroup().addTo(map);

const lineColours = {
    "M1": "#0971ce", // blue
    "M2": "#fd6b0d", // orange
    "M3": "#fec524", // yellow
    "M3S": "#fec524", // yellow (BG shuttle)
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
let railServiceLegs = {}; // Loaded from service_legs.geojson
let railServiceStops = {}; // Loaded from service_stops.geojson
let mainlineOps = {};
let G = {}; // Network Graph
let gr;
let wayfinderActive = false;
let originStn = null;
let destinationStn = null;
let stationLookup;
let trains = [];
let showRoutes = document.getElementById("toggleRoutes").checked; //show lines and stations, default off
let activeLayers = "lrt-metro"; //default to lrt-metro, options: [lrt, lrt-metro, lrt-metro-rail]
let showRail = activeLayers === "lrt-metro-rail"; //show lines and stations, default off
let routesPreWF = showRoutes;
let railPreWF = showRail;
let isPredicting = false; // Flag to indicate if the user is currently predicting a station name - dont call getRoute if so
// Simulation constants:
// const trainSpeed = 80 * 1000 / 3600; // 80 km/h in m/s
let timeScale = 300; // 1 real sec = 5 simulated minutes
let DEFAULT_DWELL_TIME = 1; // seconds dwell at each station
const STATION_TOLERANCE = 30; // meters tolerance
const VEHICLE_SPEEDS = {
    METRO: 80 * 1000 / 3600, //80kmh
    LRT: 60 * 1000 / 3600, //60kmh
    MAINLINE: 120 * 1000 / 3600 //120kmh
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
        console.log("Loaded translations successfully");
        updateLanguage(currentLang);
    })
    .catch(error => console.error("Error loading translations:", error));

    function updateLanguage(lang) {
        currentLang = lang;        
        // Store the current selected values before updating
        const dayTypeSelect = document.getElementById("dayTypeSelect");
        const timePeriodSelect = document.getElementById("timePeriodSelect");
        const startStationSelect = document.getElementById("startStationSelect");
        const endStationSelect = document.getElementById("endStationSelect");
        const selectedDayType = dayTypeSelect.value;
        const selectedTimePeriod = timePeriodSelect.value;
        const selectedStartStation = startStationSelect.value;
        const selectedEndStation = endStationSelect.value;
        
        // Update all elements with the data-i18n attribute
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
        
        // Repopulate day and time period options
        updateCustomSelectOptions("dayTypeSelect");
        dayTypeSelect.value = selectedDayType;
        updateTimePeriodOptions();
        
        // Restore time period if exists in new options
        if (selectedTimePeriod) {
            const optionExists = Array.from(timePeriodSelect.options).some(
                option => option.value === selectedTimePeriod
            );
            if (optionExists) {
                timePeriodSelect.value = selectedTimePeriod;
                updateCustomSelectOptions("timePeriodSelect");
            }
        }
        
        // Update route icons direction
        const sicon = document.getElementById("start-icon");
        const eicon = document.getElementById("end-icon");
        if (lang === "he") {
            sicon.classList.add("flipped-icon");
            eicon.classList.add("flipped-icon");
        } else {
            sicon.classList.remove("flipped-icon");
            eicon.classList.remove("flipped-icon");
        }
        updateSpeed();
        // Repopulate station selects with the updated language
        populateWayfindingOptions();
        
        // Update any active route details
        const detailsContainer = document.querySelector(".route-details-container");
        if (detailsContainer && detailsContainer.firstChild) {
            // If there's an active route, recalculate and display it
            const start = startStationSelect.value;
            const end = endStationSelect.value;
            if (start && end && start !== end) {
                getRoute(start, end);
            }
        }
    
        // Update line info and speed display
        updateLineInfo();
        
    }
    

window.updateLanguage = updateLanguage;

function updateTimePeriodOptions() {
    const dayTypeSelect = document.getElementById("dayTypeSelect");
    const timePeriodSelect = document.getElementById("timePeriodSelect");
    const selectedDayType = dayTypeSelect.value;
    const previouslySelectedValue = timePeriodSelect.value; // Store current selection
    
    timePeriodSelect.innerHTML = "";
    if (translations[currentLang] && translations[currentLang].timePeriods && translations[currentLang].timePeriods[selectedDayType]) {
        const periods = translations[currentLang].timePeriods[selectedDayType];
        periods.forEach(option => {
            const opt = document.createElement("option");
            opt.value = option.value;
            opt.textContent = option.text;
            timePeriodSelect.appendChild(opt);
        });
        
        // Try to restore the previous selection if it exists
        if (previouslySelectedValue) {
            const optionExists = Array.from(timePeriodSelect.options).some(
                option => option.value === previouslySelectedValue
            );
            
            if (optionExists) {
                timePeriodSelect.value = previouslySelectedValue;
                updateCustomSelectOptions("timePeriodSelect");
            }
        }
    }
    updateCustomSelectOptions("timePeriodSelect");
}
// Helper function to merge multiline station names
function getMergedStationName(station) {
    const name = currentLang === "en" ? station.name.en : station.name.he; 
    if (typeof name === "string") {
        return name;
    } else if (typeof name === "object") {
        // Get all the names from the object values, then filter out duplicates
        const names = Object.values(name);
        const uniqueNames = [...new Set(names)];
        return uniqueNames.join("/");
    }
    return station.id.toString();
}

function getRouteBullet(line, showConnectionBullet = false) {
    const bullet = document.createElement("span");
    if (line === "IR") { // Israel Railways
        if (showConnectionBullet) {
            bullet.classList.add("bullet");
            bullet.style.backgroundColor = "#777";
        } 
        bullet.innerHTML = '<ion-icon name="train-sharp"></ion-icon>';
    } else if (line.startsWith("B")) { // Bus
        if (showConnectionBullet) {
            bullet.classList.add("bullet");
            bullet.style.backgroundColor = "#777";
        }
        bullet.innerHTML = '<ion-icon name="bus"></ion-icon>';
    } else if (line.startsWith("M")) { // Use the number 
        bullet.classList.add("bullet");
        bullet.style.backgroundColor = lineColours[line] || "#777";
        bullet.textContent = line.charAt(1);
    } else { // Use the letter
        bullet.classList.add("bullet");
        bullet.style.backgroundColor = lineColours[line.charAt(0)] || "#777";
        bullet.textContent = line.charAt(0);
    }
    return bullet;
}

// Helper to generate the inner HTML string for an option, including inline bullets.
function getStationRouteBullets(station, showConnectionBullet = false) {
    const container = document.createElement("span");
    container.style.display = "inline-flex";
    container.style.gap = "5px"; // Space between bullets
    station.lines.forEach(line => {
        container.appendChild(getRouteBullet(line, showConnectionBullet));
    });
    return container;
}


function activateSearchMode(selectId) {
    let hasExited = false;
    isPredicting = true; 
    const select = document.getElementById(selectId);
    const customSelect = select.closest('.custom-select');
    const input = customSelect.querySelector('.search-field');
    const selectItems = customSelect.querySelector('.select-items');
    const selectSelected = customSelect.querySelector('.select-selected');
    selectSelected.classList.add('focused');
    const oldStart = document.getElementById("startStationSelect").value;
    const oldEnd = document.getElementById("endStationSelect").value;
    // Show input, focus, and clear any previous text
    input.style.display = "block";
    input.value = '';
    input.focus();
    input.addEventListener('keydown', e => {
        e.stopPropagation(); // Prevent key events from bubbling up
    });
    // Live filtering
    input.addEventListener('input', () => {
        const query = input.value.normalize('NFC').toLocaleLowerCase();
        const options = Array.from(select.options);

        // startsWith preferred, fallback to includes
        let idx = options.findIndex(o =>
            o.text.normalize('NFC').toLocaleLowerCase().startsWith(query)
        );
        if (idx === -1) {
            idx = options.findIndex(o =>
            o.text.normalize('NFC').toLocaleLowerCase().includes(query)
            );
        }

        if (idx > -1) {
            Array.from(selectItems.children).forEach(i =>
            i.classList.remove('same-as-selected', 'selected')
            );
            const found = selectItems.children[idx];
            found.classList.add('selected');
            select.selectedIndex = idx;
            selectSelected.innerHTML = found.innerHTML;
            found.scrollIntoView({ block: 'nearest' });
            // select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    // Exit on blur or Enter
    function exit() {
        if (hasExited) return; // Prevent multiple exits
        hasExited = true; // Set flag to prevent multiple exits
        input.style.display = "none";
        input.value = '';
        selectSelected.classList.remove('focused');
        input.removeEventListener('blur', exit);
        input.removeEventListener('keydown', onKeyDown);
        isPredicting = false;
        const newStart = document.getElementById("startStationSelect").value
        const newEnd  = document.getElementById("endStationSelect").value
        if (newStart&& newEnd) {
            getRoute(newStart, newEnd);
        }
    }

    function onKeyDown(e) {
        if (e.key === 'Enter' || e.key === "Escape") {
            isPredicting = false;
            input.blur();
        }
    }

    input.addEventListener('blur', exit);
    input.addEventListener('keydown', onKeyDown);
}

const startSearchButton = document.getElementById('start-search');
    const endSearchButton   = document.getElementById('end-search');

    startSearchButton.addEventListener('click', () => {
        activateSearchMode('startStationSelect');
    });

    endSearchButton.addEventListener('click', () => {
        activateSearchMode('endStationSelect');
    });


// Function to update custom select display after options change
function updateCustomSelectOptions(selectId) {
    const select = document.getElementById(selectId);
    const customSelectContainer = select.closest('.custom-select');
    if (!customSelectContainer) return;

    const selectSelected = customSelectContainer.querySelector('.select-selected');
    const selectItems = customSelectContainer.querySelector('.select-items');
    
    // Only add keyboard navigation for station selects
    if (selectId === "startStationSelect" || selectId === "endStationSelect") {
        // Clear existing keyboard listeners
        if (customSelectContainer.keyListener) {
            selectSelected.removeEventListener('keydown', customSelectContainer.keyListener);
            selectItems.removeEventListener('keydown', customSelectContainer.keyListener);
        }
        // Type-ahead buffer (to search for stations)

        customSelectContainer.keyListener = function(e) {
            // Only when dropdown is open
            if (selectItems.style.display !== "block") return;
            const key = e.key;
            const now = Date.now();
            // Escape clears the buffer and closes the dropdown
            if (key === 'Escape') {
                e.preventDefault();
                // Clear buffer
                _searchBuffer = '';
                _lastKeyTime = 0;
                // Reset native <select> to its placeholder (select station)
                select.selectedIndex = 0;
                // update the fake header text
                selectSelected.textContent = currentLang === "en" ? 'Select station' : 'בחר תחנה';
                // Clear any highlighted item
                Array.from(selectItems.children).forEach(item =>
                    item.classList.remove('same-as-selected', 'selected')
                );
                // Close the dropdown
                selectItems.style.display = 'none';
                return;
            }
            // Handle any single printable character (EN+HE)
            if (key.length === 1) {
                e.preventDefault();
                e.stopPropagation();
                const char = key.normalize('NFC').toLocaleLowerCase();
                // Reset buffer if too slow
                if (now - _lastKeyTime > BUFFER_CLEAR_DELAY) {
                    _searchBuffer = char;
                } else {
                    _searchBuffer += char;
                }
                _lastKeyTime = now;
                // Find matching option
                const options = Array.from(select.options);

                let idx = options.findIndex(o => {
                    const text = o.text.normalize('NFC').toLocaleLowerCase();
                    return text.startsWith(_searchBuffer);
                });

                if (idx === -1) {
                    idx = options.findIndex(o => {
                        const text = o.text.normalize('NFC').toLocaleLowerCase();
                        return text.includes(_searchBuffer);
                    });
                }

                if (idx > -1) {
                    // Highlight in the list
                    const items = Array.from(selectItems.children);
                    items.forEach(i =>
                        i.classList.remove('same-as-selected', 'selected')
                    );
                    const found = items[idx];
                    found.classList.add('selected');
                    select.selectedIndex = idx;
                    selectSelected.innerHTML = found.innerHTML;
                    found.scrollIntoView({ block: 'nearest' });
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        };

        // Add the listener to both elements
        selectSelected.addEventListener('keydown', customSelectContainer.keyListener);
        selectItems.addEventListener('keydown', customSelectContainer.keyListener);
    }

    // Update the selected text display
    if (select.selectedIndex >= 0) {
        selectSelected.innerHTML = select.options[select.selectedIndex].innerHTML;
    }
    // Rebuild the dropdown items list
    selectItems.innerHTML = '';
    Array.from(select.options).forEach((option, index) => {
        const div = document.createElement('div');
        div.innerHTML = option.innerHTML;
        div.addEventListener('click', function() {
            select.selectedIndex = index;
            selectSelected.innerHTML = this.innerHTML;
            selectItems.style.display = "none";            
            const event = new Event('change', { bubbles: true });
            select.dispatchEvent(event);
        });
        selectItems.appendChild(div);
    });

    // Make sure both elements are focusable
    selectSelected.setAttribute('tabindex', '0');
    selectItems.setAttribute('tabindex', '0');
}

const toggleRoutesCheckbox = document.getElementById("toggleRoutes");
toggleRoutesCheckbox.addEventListener("change", function() {
    showRoutes = this.checked;
    toggleDisplayRoutes();
});

const layerBtns = document.querySelectorAll("#showLayers .seg-btn");
document.addEventListener("DOMContentLoaded", function () {

    layerBtns.forEach(button => {
        button.addEventListener("click", function () {
            activeLayers = this.getAttribute("data-layer");
            layerBtns.forEach(btn => btn.classList.remove("active"));
            this.classList.add("active");
            changeLayers();
        });
    });
});

function toggleDisplayRoutes() {
    if (showRoutes) {
        toggleRoutesCheckbox.checked = true;
        map.addLayer(routeLayersGroup);
        map.addLayer(stationDotsLayerGroup);
        if (activeLayers === "lrt-metro-rail") {
            map.addLayer(railRoutesLayerGroup);
        }
        changeLayers(false);
    } else {
        toggleRoutesCheckbox.checked = false;
        map.removeLayer(routeLayersGroup);
        map.removeLayer(stationDotsLayerGroup);
        changeLayers(false);
    }
}

function toggleDisplayRail() {
    if (activeLayers === "lrt-metro-rail") {
        // toggleRailCheckbox.checked = true;
        map.addLayer(railTrainsLayerGroup);
        if (showRoutes && !wayfinderActive) {
            map.addLayer(railRoutesLayerGroup);
        } else {
            map.removeLayer(railRoutesLayerGroup);
        }
    } else {
        // toggleRailCheckbox.checked = false;
        // Despawn mainline trains
        trains.forEach(train => {
            if (train.vehicleType === "MAINLINE") {
                // Remove the marker from the map
                railTrainsLayerGroup.removeLayer(train.marker); 
            }
        });
        trains = trains.filter(train => train.vehicleType !== "MAINLINE");
        map.removeLayer(railTrainsLayerGroup);
        map.removeLayer(railRoutesLayerGroup);
    }
}

// Drag the wayfinder panel up and down (mobile mode only)
document.addEventListener("DOMContentLoaded", function () {
    const wayfinderContent = document.querySelector(".wayfinder-content");

    // Create a larger drag region
    const dragRegion = document.createElement("div");
    dragRegion.classList.add("drag-region");

    const dragHandle = document.createElement("div");
    dragHandle.classList.add("drag-handle");
    dragRegion.appendChild(dragHandle);

    // Add route content div
    const routeContent = document.createElement("div");
    routeContent.classList.add("route-content");
    while (wayfinderContent.firstChild) {
        routeContent.appendChild(wayfinderContent.firstChild);
    }

    wayfinderContent.appendChild(dragRegion);
    wayfinderContent.appendChild(routeContent);

    let startY = 0;
    let currentHeight = 30; // Default height in vh

    dragRegion.addEventListener("mousedown", startDrag);
    dragRegion.addEventListener("touchstart", startDrag);

    function startDrag(e) {
        e.preventDefault(); // Prevent default touch scrolling
        // Disable scrolling on the wayfinder pane during drag
        wayfinderContent.style.overflow = "hidden";
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        document.addEventListener("mousemove", onDrag);
        document.addEventListener("mouseup", stopDrag);
        document.addEventListener("touchmove", onDrag);
        document.addEventListener("touchend", stopDrag);
    }

    function onDrag(e) {
        const moveY = e.touches ? e.touches[0].clientY : e.clientY;
        let delta = (startY - moveY) / window.innerHeight * 100; // Convert to vh
        let newHeight = Math.min(85, Math.max(30, currentHeight + delta)); // Limit between 30vh and 85vh
        wayfinderContent.style.height = newHeight + "vh";
    }

    function stopDrag() {
        currentHeight = parseFloat(wayfinderContent.style.height);
        // Restore scrolling after drag
        wayfinderContent.style.overflow = "auto";
        document.removeEventListener("mousemove", onDrag);
        document.removeEventListener("mouseup", stopDrag);
        document.removeEventListener("touchmove", onDrag);
        document.removeEventListener("touchend", stopDrag);
    }

    // Click anywhere in the drag region to toggle expand/collapse
    dragRegion.addEventListener("click", () => {
        if (wayfinderContent.classList.contains("expanded")) {
            wayfinderContent.classList.remove("expanded");
            wayfinderContent.style.height = "30vh";
            currentHeight = 30;
        } else {
            wayfinderContent.classList.add("expanded");
            wayfinderContent.style.height = "80vh";
            currentHeight = 80;
        }
    });
});


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
const realTimeInfo = document.getElementById("realTimeInfo");

let speedIndex = parseInt(speedSlider.value); // Track current speed index

// Function to update speed display
function updateSpeed() {
    let simSpeed = speedValues[speedIndex];
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
speedSlider.addEventListener("input", () => {
    speedIndex = parseInt(speedSlider.value);
    updateSpeed();

});

// Handle keypress for increasing/decreasing speed
document.addEventListener("keydown", (event) => {
    if (event.key === ">" || event.key === ".") {
        if (speedIndex < speedValues.length - 1) {
            speedIndex++;
        }
    } else if (event.key === "<" || event.key === ",") {
        if (speedIndex > 0) {
            speedIndex--;
        }
    } else {
        return;
    }
    speedSlider.value = speedIndex;
    updateSpeed();
});

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
    } else if (event.key.toLowerCase() === "w") { //wayfinder mode
        if (wayfinderPane.style.display === "flex") {//if wayfinder open, close it else open
            wayfinderPane.style.display = "none";
            wayfinderActive = false;
            exitWayfinder();
            event.preventDefault();
        } else {
            settingsModal.style.display = "none";
            wayfinderPane.style.display = "flex";
            simPaused = true;
            document.getElementById("pause").innerHTML = "<ion-icon name='play'></ion-icon>";
            event.preventDefault();
            wayfind();
        }
    } else if (event.key.toLowerCase() === "s") { //toggle settings
        if (settingsModal.style.display === "flex") { //if settings open, close it else open
            settingsModal.style.display = "none";
            simPaused = false;
            document.getElementById("pause").innerHTML = "<ion-icon name='pause'></ion-icon>";
            event.preventDefault();
        } else {
            wayfinderPane.style.display = "none";
            settingsModal.style.display = "flex";
            if (wayfinderActive) {
                wayfinderActive = false;
                exitWayfinder();
            } 
            // Reset show routes if necessary
            simPaused = true;
            document.getElementById("pause").innerHTML = "<ion-icon name='play'></ion-icon>";
            event.preventDefault();
        }
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "t" && !wayfinderActive) {
        event.preventDefault(); // Prevent unintended browser actions
        showRoutes = !showRoutes;
        toggleDisplayRoutes();
    }
    if (event.key.toLowerCase() === "r" && !wayfinderActive) {
        // event.preventDefault(); 
        showRail = !showRail;
        toggleDisplayRail();
        activeLayers = showRail ? "lrt-metro-rail" : "lrt-metro";
        layerBtns.forEach(btn => btn.classList.remove("active"));
        document.querySelector("#showLayers .seg-btn[data-layer='lrt-metro-rail']").classList.add("active");
        changeLayers();
    }
    if (event.key.toLowerCase() === "m" && !wayfinderActive) {  
        activeLayers = "lrt-metro";
        layerBtns.forEach(btn => btn.classList.remove("active"));
        document.querySelector("#showLayers .seg-btn[data-layer='lrt-metro']").classList.add("active");
        changeLayers();
    }
    if (event.key.toLowerCase() === "l" && !wayfinderActive) {
        activeLayers = "lrt";
        layerBtns.forEach(btn => btn.classList.remove("active"));
        document.querySelector("#showLayers .seg-btn[data-layer='lrt']").classList.add("active");
        changeLayers();
    } 
});

document.getElementById("pause").addEventListener("click", function () {
    simPaused = !simPaused;
    this.innerHTML = simPaused ? "<ion-icon name='play'></ion-icon>" : "<ion-icon name='pause'></ion-icon>";
});


// Settings modal controls
const settingsButton = document.getElementById("settings");
const wayfinderButton = document.getElementById("wayfinder");
const settingsModal = document.getElementById("settingsModal");
const wayfinderPane = document.getElementById("wayfinderPane");
const closeSettingsModal = document.getElementsByClassName("close")[0];
const closeWayfinder = document.getElementsByClassName("close")[1];

settingsButton.addEventListener("click", function () {
    if (wayfinderActive) { //close wayfinder first
        wayfinderPane.style.display = "none";
        wayfinderActive = false;
        exitWayfinder();
        startSimulation();
    }
    settingsModal.style.display = "flex";
    simPaused = true;
    document.getElementById("pause").innerHTML = "<ion-icon name='play'></ion-icon>";
});

wayfinderButton.addEventListener("click", function () {
    wayfinderPane.style.display = "flex";
    simPaused = true;
    wayfind();
    document.getElementById("pause").innerHTML = "<ion-icon name='play'></ion-icon>";
});
closeSettingsModal.addEventListener("click", function () {
    settingsModal.style.display = "none";
    simPaused = false;
    document.getElementById("pause").innerHTML = "<ion-icon name='pause'></ion-icon>";
});
closeWayfinder.addEventListener("click", function () {
    wayfinderPane.style.display = "none";
    exitWayfinder();
});
window.addEventListener("click", function (event) {
    if (event.target === settingsModal) {
        settingsModal.style.display = "none";
        simPaused = false;
        document.getElementById("pause").innerHTML = "<ion-icon name='pause'></ion-icon>";
    }
});

/********************************************
 * Wayfinder
 ********************************************/
function populateWayfindingOptions(lrtonly = false) {
    let stns = G.nodes;
    if (lrtonly) {
        // Filter out only Metro stations - that is any station without a line R, G or P
        stns = stns.filter(stn => stn.lines.some(line => line.startsWith("R") || line.startsWith("G") || line.startsWith("P")));
        // stns = stns.filter(stn => stn.lines.some(line => line.startsWith("M")));
    }
    stns.forEach(stn => {
        stn.mergedName = getMergedStationName(stn);
    });

    const sortedStations = stns.sort((a, b) => 
        a.mergedName.localeCompare(b.mergedName)
    );
    
    // Store the current selected values before updating
    const startStationSelect = document.getElementById("startStationSelect");
    const endStationSelect = document.getElementById("endStationSelect");
    const selectedStartStation = startStationSelect.value;
    const selectedEndStation = endStationSelect.value;
    
    // Clear existing options
    startStationSelect.innerHTML = "";
    endStationSelect.innerHTML = "";
    
    // First add the "Select station" option with proper translation
    const startDefaultOpt = document.createElement("option");
    startDefaultOpt.value = "";  // Empty value for validation purposes
    startDefaultOpt.text = translations[currentLang]["select-station"] || "Select station";
    startStationSelect.appendChild(startDefaultOpt);
    
    const endDefaultOpt = document.createElement("option");
    endDefaultOpt.value = "";
    endDefaultOpt.text = translations[currentLang]["select-station"] || "Select station";
    endStationSelect.appendChild(endDefaultOpt);
    
    // Then add all station options
    sortedStations.forEach(stn => {
        // For start station option
        const sopt = document.createElement("option");
        sopt.value = stn.id;
        // Create the HTML content directly
        let optionHTML = `
            <span style="display: inline-block; margin-right: 4px;">${getMergedStationName(stn)}</span>
            <span style="display: inline-flex; align-items: center; gap: 2px;">
        `;
        // Add bullet HTML for each line
        stn.lines.forEach(line => {
            if (lrtonly && line.startsWith("M")) {
                // Don't add metro bullets if lrt only
                return;
            }
            const bullet = getRouteBullet(line);
            // Configure bullet to be smaller before getting HTML
            if (bullet.classList.contains("bullet")) {
                bullet.style.width = "20px";
                bullet.style.height = "20px";
            } else { // Rail or bus icon, style differently
                bullet.style.fontSize = "12px";
                bullet.style.width = "22px";
                bullet.style.height = "22px";
                bullet.style.display = "inline-flex";
                bullet.style.alignItems = "center";
                bullet.style.justifyContent = "space-evenly";
                bullet.style.flexDirection= "column-reverse";
            }
            optionHTML += bullet.outerHTML;
        });
        optionHTML += '</span>';
        // Set the option's HTML content
        sopt.innerHTML = optionHTML;
        startStationSelect.appendChild(sopt);
        
        // Repeat for end station option
        const eopt = document.createElement("option");
        eopt.value = stn.id;
        eopt.innerHTML = optionHTML;
        endStationSelect.appendChild(eopt);
    });
    
    // Restore previously selected values if they exist
    if (selectedStartStation) {
        startStationSelect.value = selectedStartStation;
    }
    if (selectedEndStation) {
        endStationSelect.value = selectedEndStation;
    }
    updateCustomSelectOptions("startStationSelect");
    updateCustomSelectOptions("endStationSelect");
}

// Builds and returns an HTML element with route details 
function buildRouteDetails(route) {
    // Create a container element for the route details
    const container = document.createElement("div");
    container.classList.add("route-details");
     // --- 1. Journey Time ---
    const journeyTimeDiv = document.createElement("div");
    journeyTimeDiv.classList.add("journey-time");
    journeyTimeDiv.textContent = `${Math.round(route.journeyTime)} ${translations[currentLang]["mins"]}`; 
    container.appendChild(journeyTimeDiv);
     // --- 2. Route Summary: route bullets ---
    const routeSummaryDiv = document.createElement("div");
    routeSummaryDiv.classList.add("route-summary");
    routeSummaryDiv.style.display = "flex"; // Add flex display
    routeSummaryDiv.style.alignItems = "center"; // Align items vertically
    routeSummaryDiv.style.gap = "5px"; // Space between bullets and arrows
    // Add the first route bullet
    routeSummaryDiv.appendChild(getRouteBullet(route.path[0].line));
    // Add transfers if they exist
    if (route.transfers && route.transfers.length > 0) {
        route.transfers.forEach((transfer) => {
            // Create a span for the arrow
            const arrow = document.createElement("span");
            arrow.textContent = currentLang === "en" ? "▶" : "◀";
            routeSummaryDiv.appendChild(arrow);        
            // Add the transfer route bullet
            routeSummaryDiv.appendChild(getRouteBullet(transfer.to));
        });
    }
    container.appendChild(routeSummaryDiv);
    // --- 4. Extended Route Details ---
    const extendedDiv = document.createElement("div");
    extendedDiv.classList.add("extended-route-details");
    let currentLine = null;
    let currentSegment = [];
    route.path.forEach((item, index) => {
        // For the first element, initialise
        if (index === 0) {
            currentLine = item.line;
            currentSegment.push(item.station);
        } else {
            if (item.line === currentLine && (item.station !== route.path[index-1].station)) {
                currentSegment.push(item.station);
            } else { 
                // Transfer, so finish current segment and create a block for it
                extendedDiv.appendChild(createSegmentBlock(currentLine, currentSegment));
                // Reset for the new segment
                currentLine = item.line;
                currentSegment = [item.station];
            }
        }
    });
    // Append the last segment if exists
    if (currentSegment.length > 0) {
        extendedDiv.appendChild(createSegmentBlock(currentLine, currentSegment));
    }
    container.appendChild(extendedDiv);
    // --- 5. Disclaimer ---
    const disclaimerDiv = document.createElement("div");
    disclaimerDiv.classList.add("text-muted");
    disclaimerDiv.textContent = translations[currentLang]["route-disclaimer"] || 
        "Journey times are theoretical estimations only and accuracy is not guaranteed";
    container.appendChild(disclaimerDiv);
    // Return the populated container to be displayed
    return container;
}

/**
 * Creates a segment block for a group of consecutive stations served by the same line.
 * Returns an HTML element with:
 * - A label showing the line bullet (e.g., "(1)" for Metro)
 * - A list of station names in that segment.
 */
function createSegmentBlock(line, stationIds) {
    // Create container for the segment (flex container)
    const segmentDiv = document.createElement("div");
    segmentDiv.classList.add("line-segment");
    segmentDiv.style.display = "flex";
    segmentDiv.style.alignItems = "stretch"; // Ensure children (like vertical line) stretch
    segmentDiv.style.marginBottom = "10px";
    
    // Create the vertical line element.
    const verticalLine = document.createElement("div");
    verticalLine.classList.add("vertical-line");
    // Determine the colour based on the line type.
    let lineColor = "#777";
    if (line) {
        if (line.startsWith("M")) {
            lineColor = lineColours[line] || "#777";
        } else {
            lineColor = lineColours[line.charAt(0)] || "#777";
        }
    }
    verticalLine.style.borderLeft = `4px solid ${lineColor}`;
    verticalLine.style.marginRight = "10px";
    verticalLine.style.flexShrink = "0"; // prevent shrinking
    // Create a container for station rows.
    const stationListDiv = document.createElement("div");
    stationListDiv.classList.add("station-list");
    stationListDiv.style.flex = "1";

    // For each station in the segment, create a row with the station name.
    stationIds.forEach(stationId => {
        const station = stationLookup[stationId];
        const stationRow = document.createElement("div");
        stationRow.classList.add("station-row");
        stationRow.style.display = "flex";
        stationRow.style.alignItems = "center";
        stationRow.style.marginBottom = "4px";
        // Create station name element
        const nameSpan = document.createElement("span");
        if (typeof station.name.en === "string") {
            nameSpan.textContent = currentLang === "en" ? station.name.en : station.name.he;
        } else { // Multi-line station with different names
            nameSpan.textContent = currentLang === "en" ? station.name.en[line] : station.name.he[line];
        }
        // Append name to the station row
        stationRow.appendChild(nameSpan);
        stationListDiv.appendChild(stationRow);
    });
    
    segmentDiv.appendChild(verticalLine);
    segmentDiv.appendChild(stationListDiv);
    return segmentDiv;
}

/**
 * Highlights each computed segment of the route on the map.
 *
 * @param {Array} path - Array of objects representing the computed route.
 *        Each element should be of the form: { station: <stationID>, line: <lineCode> }
 */
function highlightWayfoundRoute(path) {
    // Clear previous route and station dot layers
    wayfindLayersGroup.clearLayers();
    wayfinderRouteStnsLayerGroup.clearLayers(); 
    // Iterate over consecutive pairs in the computed path
    for (let i = 0; i < path.length - 1; i++) {
        const stationAId = path[i].station;
        const stationBId = path[i + 1].station;
        const computedLine = path[i + 1].line;
        if (!computedLine) continue;
        // Fallback: use from-station line if available
        const segmentLine = path[i].line || computedLine;
        const highlightColour = lineColours[segmentLine] || "yellow";

        // Filter candidate service routes by computedLine
        let candidateRouteKeys = Object.keys(serviceRoutes).filter(key =>
            key.startsWith(computedLine.toUpperCase())
        );
        if (!candidateRouteKeys.length) {
            candidateRouteKeys = Object.keys(serviceRoutes);
        }

        let routeObj = null;
        let stationAObj = null;
        let stationBObj = null;
        for (const key of candidateRouteKeys) {
            const route = serviceRoutes[key];
            stationAObj = route.stations.find(s => s.id == stationAId);
            stationBObj = route.stations.find(s => s.id == stationBId);
            if (stationAObj && stationBObj) {
                routeObj = route;
                break;
            }
        }
        if (!routeObj || !stationAObj || !stationBObj) continue;

        const lineStr = turf.lineString(routeObj.coords);
        let fromDistance = stationAObj.distance / 1000;
        let toDistance = stationBObj.distance / 1000;
        if (fromDistance > toDistance) [fromDistance, toDistance] = [fromDistance, toDistance];

        const fromPoint = turf.along(lineStr, fromDistance, { units: "kilometers" });
        const toPoint = turf.along(lineStr, toDistance, { units: "kilometers" });
        let subLine = turf.lineSlice(fromPoint, toPoint, lineStr);
        let latlngs = [];
        if (!subLine || !subLine.geometry || !subLine.geometry.coordinates.length) {
            latlngs = [
                [fromPoint.geometry.coordinates[1], fromPoint.geometry.coordinates[0]],
                [toPoint.geometry.coordinates[1], toPoint.geometry.coordinates[0]]
            ];
        } else {
            latlngs = subLine.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        }

        // Draw the polyline for this segment
        L.polyline(latlngs, {
            color: highlightColour,
            weight: 6,
            opacity: 0.9
        }).addTo(wayfindLayersGroup);

        // Compute coordinates for the station dots
        const fromCoords = [fromPoint.geometry.coordinates[1], fromPoint.geometry.coordinates[0]];
        const toCoords = [toPoint.geometry.coordinates[1], toPoint.geometry.coordinates[0]];

        // Create and add small circle markers at the endpoints
        L.circleMarker(fromCoords, {
            radius: 6,
            color: highlightColour,
            weight: 1,
            fillColor: highlightColour,
            fillOpacity: 0.9
        }).addTo(wayfinderRouteStnsLayerGroup);

        L.circleMarker(toCoords, {
            radius: 6,
            color: highlightColour,
            weight: 1,
            fillColor: highlightColour,
            fillOpacity: 0.9
        }).addTo(wayfinderRouteStnsLayerGroup);
    }
}



function displayRoute(route) { // Visualises the computed path on the map by only highlighting the segments traversed
    if (wayfinderActive) {
        showRoutes = false;
        showRail = false;
        toggleDisplayRoutes();
        toggleDisplayRail();
        highlightWayfoundRoute(route.path);   
    }
    const detailsContainer = document.querySelector(".route-details-container");
    detailsContainer.innerHTML = ""; 
    const routeElement = buildRouteDetails(route);
    detailsContainer.appendChild(routeElement);
}

function getRoute(startNode, endNode) {
    if (startNode === endNode) {
        return;
    }
    // Get the routing preference
    const routingPref = routingToggle.checked ? "fewest_changes" : "quickest";
    // Call dijkstra algorithm with the appropriate parameters (quickest or fewest changes and whether to only use light rail)
    const { distances, previous } = dijkstraWithTransfers(gr, startNode, endNode, activeLayers === "lrt" ? true : false, routingPref);
    const route = reconstructPathWithTransfers(previous, distances, startNode, endNode);
    
    console.log("Route path:", route.path.map(p => `${stationLookup[p.station].name.en|| "Station not found"} (${p.line})`).join(" → "));
    console.log("Transfers:", route.transfers.length > 0 ? route.transfers : "No transfers needed.");
    console.log("Estimated travel time (minutes):", route.journeyTime);
    displayRoute(route);
    
}

// Restore various states upon leaving wayfinder 
function exitWayfinder() {
    wayfinderActive = false;
    // Clear route visual
    wayfindLayersGroup.clearLayers();
    wayfinderRouteStnsLayerGroup.clearLayers(); 
    // Restart simulation respawn all trains 
    simPaused = false;
    showRoutes = routesPreWF;
    showRail = railPreWF;
    toggleDisplayRoutes();
    toggleDisplayRail();
    startSimulation();
    document.getElementById("pause").innerHTML = "<ion-icon name='pause'></ion-icon>";
}

function wayfind() {
    // Despawn all trains
    // trains.forEach(train => train.marker.remove());
    trains.forEach(train => {
        if (train.vehicleType === "MAINLINE") {
            railTrainsLayerGroup.removeLayer(train.marker);
        } else {
            train.marker.remove();   
        }
    });
    trains = [];
    console.log("Entering wayfinder mode");
    gr = buildGraph(G.edges);
    wayfinderActive = true;
    // Toggle stations + routes on
    routesPreWF = showRoutes;
    railPreWF = showRail;
    showRail = false;
    showRoutes = true;
    toggleDisplayRoutes();
    toggleDisplayRail();
}

/********************************************
 * Line Info
 ********************************************/
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
        // Create a container div for this line
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

/********************************************
 * Train & Station Popups
 ********************************************/

function hideTrainPopup() {
    const popup = document.getElementById("trainPopup");
    popup.style.display = "none";
    popup.dataset.manualOpen = "false"; // Reset manual open state
}
function hideStationPopup() {
    const popup = document.getElementById("stationPopup");
    popup.style.display = "none";
    popup.dataset.manualOpen = "false"; // Reset manual open state
}
/********************************************
 * Day/Time Controls & Operation Settings
 ********************************************/
const customSelects = document.querySelectorAll(".custom-select");
let _searchBuffer = '';
let _lastKeyTime  = 0;
const BUFFER_CLEAR_DELAY = 999; // ms
        
customSelects.forEach(select => {
    const selectSelected = select.querySelector(".select-selected");
    const selectItems = select.querySelector(".select-items");
    const selectOptions = select.querySelectorAll(".select-items div");
    const originalSelect = select.querySelector("select");
    
    // Toggle dropdown visibility
    selectSelected.addEventListener("click", function(e) {
        e.stopPropagation();
        closeAllSelects(this);
        _searchBuffer = '';
        _lastKeyTime  = 0;
        selectItems.style.display = selectItems.style.display === "block" ? "none" : "block";
        this.classList.toggle("select-arrow-active");
    });
    // Handle option selection
    selectOptions.forEach((option, index) => {
        option.addEventListener("click", function(e) {
            // Update the original select
            originalSelect.selectedIndex = index;
            // Update the selected text
            selectSelected.innerHTML = this.innerHTML;
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

function stationSelection() {
    const start = document.getElementById("startStationSelect").value;
    const end = document.getElementById("endStationSelect").value;
    // Check if both dropdowns have a valid selection and are not the same
    if (start && end && start !== end && !isPredicting) {
        getRoute(start, end);
    }

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
document.getElementById("startStationSelect").addEventListener("change", stationSelection);
document.getElementById("endStationSelect").addEventListener("change", stationSelection);

const routingToggle = document.getElementById('routingPref');
const quickestLabel = document.getElementById('quickest-label');
const fewestLabel = document.getElementById('fewest-label');

function updateRoutingToggle() {
    if (routingToggle.checked) {
        // Fewer Changes selected
        quickestLabel.classList.remove('active');
        fewestLabel.classList.add('active');
    } else {
        // Quickest selected
        quickestLabel.classList.add('active');
        fewestLabel.classList.remove('active');
    }
}

routingToggle.addEventListener('change', () => {
    updateRoutingToggle();
    stationSelection();
});

quickestLabel.addEventListener('click', () => {
    routingToggle.checked = false;
    updateRoutingToggle();
});

fewestLabel.addEventListener('click', () => {
    routingToggle.checked = true;
    updateRoutingToggle();
});

updateRoutingToggle();


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
let heavyRailRoutes = {}; // Loaded from preprocessed_heavyrail_distances.json
Promise.all([
        fetch('data/schedule.json').then(res => {
            if (!res.ok) throw new Error("Failed to load schedule data");
            return res.json();
        }),
        fetch('data/network/preprocessed_station_distances.json').then(res => {
            if (!res.ok) throw new Error("Failed to load preprocessed station distances");
            return res.json();
        }),
        fetch('data/RAIL/rail.geojson').then(res => {
            if (!res.ok) throw new Error("Failed to load rail routes data");
            return res.json();
        }),
        fetch('data/RAIL/rail_stations.geojson').then(res => {
            if (!res.ok) throw new Error("Failed to load rail stations data");
            return res.json();
        }),
        fetch('data/RAIL/service_legs.geojson').then(res => {
            if (!res.ok) throw new Error("Failed to load rail service data");
            return res.json();
        }),
        fetch('data/RAIL/service_stops.geojson').then(res => {
            if (!res.ok) throw new Error("Failed to load rail service data");
            return res.json();
        }),
        fetch('data/RAIL/mainline_services.json').then(res => {
            if (!res.ok) throw new Error("Failed to load rail service data");
            return res.json();              
        }),
        fetch('data/network/network_graph.json').then(res => {
            if (!res.ok) throw new Error("Failed to load network graph");
            return res.json();
        }),
        fetch('data/network/preprocessed_mainline_distances.json').then(res => {
            if (!res.ok) throw new Error("Failed to load preprocessed mainline distances");
            return res.json();
        })
    ])
    .then(([schedule, routes, railroutes, railStations, legs, stops, heavyRailOps, graph, heavyRailPreproc]) => {
        scheduleData = schedule;
        console.log("Loaded schedule data:", scheduleData);
        serviceRoutes = routes;
        console.log("Loaded service routes:", serviceRoutes);
        railServiceLegs = legs;
        railServiceStops = stops;
        mainlineOps = heavyRailOps;
        heavyRailRoutes = heavyRailPreproc;
        console.log("Loaded rail data");
        // Initialise the network graph of edges and nodes, together with a lookup to get stations by id
        G = graph;
        stationLookup = Object.fromEntries(G.nodes.map(node => [node.id, node]));
        populateWayfindingOptions(); // Add station names to the wayfinder selects
        updateLineInfo(); // Update line info in settings with schedule 
        // Visualise service routes and station markers
            Object.keys(serviceRoutes).forEach(key => {
                let routeObj = serviceRoutes[key];
                const latlngs = routeObj.coords.map(coord => [coord[1], coord[0]]);
                let c = key.charAt(0) === "M" ? lineColours[key.substring(0, 2)] : lineColours[key.charAt(0)];
                L.polyline(latlngs, {
                    color: c,
                    weight: 4,
                    opacity: 0.75,
                }).addTo(routeLayersGroup);
                let lineStr = turf.lineString(routeObj.coords);
                routeObj.stations.forEach(dist => {
                    let snapped = turf.along(lineStr, dist["distance"] / 1000, {
                        units: "kilometers"
                    });
                    if (snapped && snapped.geometry && snapped.geometry.coordinates) {
                        let coord = snapped.geometry.coordinates;
                        const visibleMarker = L.circleMarker([coord[1], coord[0]], {
                            radius: 3,
                            color: "black", 
                            fillOpacity: 0.6
                        });
                        // Create an invisible larger hit area
                        const marker = L.circleMarker([coord[1], coord[0]], {
                            radius: 12.5, // larger clickable area
                            opacity: 0, // fully transparent outline
                            fillOpacity: 0  // fully transparent fill
                        });
                        visibleMarker.line = key.charAt(0);
                        marker.line = key.charAt(0);
                        marker.on("click", event => {
                            if (wayfinderActive) { // Clicking on a station with wayfinder active should set the station
                                if (!originStn) { // First click sets the origin station
                                    originStn = dist.id;
                                    const startSelect = document.getElementById("startStationSelect");
                                    if (startSelect) {
                                        startSelect.value = originStn;
                                        const customStartSelected = startSelect.parentElement.querySelector(".select-selected");
                                        if (customStartSelected) {
                                            customStartSelected.innerHTML = startSelect.options[startSelect.selectedIndex].innerHTML;
                                        }
                                    }
                                } else { // Second click sets the destination station
                                    destinationStn = dist.id;
                                    // Update the end station select element
                                    const endSelect = document.getElementById("endStationSelect");
                                    if (endSelect) {
                                        endSelect.value = destinationStn;
                                        const customEndSelected = endSelect.parentElement.querySelector(".select-selected");
                                        if (customEndSelected) {
                                            customEndSelected.innerHTML = endSelect.options[endSelect.selectedIndex].innerHTML;
                                        }
                                    }
                                    getRoute(originStn, destinationStn); 
                                    // Reset stations
                                    originStn = null;
                                    destinationStn = null;
                                }
                            } else {
                                hideTrainPopup(); // Hide any visible popup first
                                event.originalEvent.stopPropagation();
                                const popup = document.getElementById("stationPopup");
                                popup.innerHTML = "";
                                const container = document.createElement("div");
                                container.style.textAlign = "center"; 
                                // First line: station name
                                const nameLine = document.createElement("div");
                                nameLine.style.fontWeight = "bold"; 
                                nameLine.style.marginBottom = "4px"; 
                                nameLine.textContent = dist.name[currentLang];
                                container.appendChild(nameLine);
                                // Second line: route bullets 
                                const bulletsLine = document.createElement("div");
                                // Append the bullets container (returned by getStationRouteBullets)
                                bulletsLine.appendChild(getStationRouteBullets(stationLookup[dist.id], true));
                                container.appendChild(bulletsLine);
                                popup.appendChild(container);
                                popup.style.display = "flex";
                                popup.dataset.manualOpen = "true"; // Mark as manually opened
                            }
                        });
                        
                        marker.on("mouseover", event => {
                            hideTrainPopup(); // Hide any visible popup first
                            event.originalEvent.stopPropagation();
                            const popup = document.getElementById("stationPopup");
                            popup.innerHTML = "";
                            const container = document.createElement("div");
                            container.style.textAlign = "center"; 
                            // First line: station name
                            const nameLine = document.createElement("div");
                            nameLine.style.fontWeight = "bold"; 
                            nameLine.style.marginBottom = "4px"; 
                            nameLine.textContent = dist.name[currentLang];
                            container.appendChild(nameLine);
                            // Second line: route bullets 
                            const bulletsLine = document.createElement("div");
                            // Append the bullets container (returned by getStationRouteBullets)
                            bulletsLine.appendChild(getStationRouteBullets(stationLookup[dist.id], true));
                            container.appendChild(bulletsLine);
                            popup.appendChild(container);
                            popup.style.display = "flex";
                            popup.dataset.manualOpen = "false";
                            clearTimeout(window.trainPopupTimeout);
                            window.trainPopupTimeout = setTimeout(() => {
                                if (popup.dataset.manualOpen !== "true") {
                                    hideStationPopup();
                                }
                            }, 2500); // Auto close after 2.5 seconds
                        });
                        
                        visibleMarker.addTo(stationDotsLayerGroup); 
                        marker.addTo(stationDotsLayerGroup);
                        if (!showRoutes) {
                            map.removeLayer(stationDotsLayerGroup)
                        }
                    }
                });
            });
            // Visualise rail routes
            L.geoJSON(railroutes, {
                style: {
                    color: "#777",
                    weight: 6,
                    opacity: 1,
                }
            }).addTo(railRoutesLayerGroup);
            // and rail stations
            L.geoJSON(railStations, {
                pointToLayer: function (feature, latlng) {
                    const visibleMarker = L.circleMarker(latlng, {
                        radius: 6,
                        color: "#777",
                        fillOpacity: 1
                    });
                    const marker = L.circleMarker(latlng, {
                        radius: 12.5,
                        opacity: 0,
                        fillOpacity: 0
                    });

                    marker.on("click", event => {
                        hideTrainPopup();
                        hideStationPopup();
                        event.originalEvent.stopPropagation();
                        const popup = document.getElementById("stationPopup");
                        popup.innerHTML = "";
                        const container = document.createElement("div");
                        container.style.textAlign = "center";

                        const nameLine = document.createElement("div");
                        nameLine.style.fontWeight = "bold";
                        nameLine.style.marginBottom = "4px";
                        nameLine.textContent = feature.properties.name.find(n => n[currentLang])[currentLang];
                        container.appendChild(nameLine);

                        const bulletsLine = document.createElement("div");
                        bulletsLine.style.display = "flex";
                        bulletsLine.style.justifyContent = "center";
                        const bullet = document.createElement("span");
                        bullet.classList.add("bullet");
                        bullet.style.backgroundColor = "#777";
                        bullet.innerHTML = '<ion-icon name="train-sharp"></ion-icon>';
                        bulletsLine.appendChild(bullet);
                        container.appendChild(bulletsLine);

                        popup.appendChild(container);
                        popup.style.display = "flex";
                        popup.dataset.manualOpen = "true";
                    });

                    marker.on("mouseover", event => {
                        hideTrainPopup();
                        hideStationPopup();
                        event.originalEvent.stopPropagation();
                        const popup = document.getElementById("stationPopup");
                        popup.innerHTML = "";
                        const container = document.createElement("div");
                        container.style.textAlign = "center";
                        // First line: station name
                        const nameLine = document.createElement("div");
                        nameLine.style.fontWeight = "bold";
                        nameLine.style.marginBottom = "4px";
                        nameLine.textContent = feature.properties.name.find(n => n[currentLang])[currentLang];
                        container.appendChild(nameLine);
                        // Second line: route bullets
                        const bulletsLine = document.createElement("div");
                        bulletsLine.style.display = "flex";
                        bulletsLine.style.justifyContent = "center";

                        const bullet = document.createElement("span");
                        bullet.classList.add("bullet");
                        bullet.style.backgroundColor = "#777";
                        bullet.innerHTML = '<ion-icon name="train-sharp"></ion-icon>';
                        bulletsLine.appendChild(bullet);
                        container.appendChild(bulletsLine);

                        popup.appendChild(container);
                        popup.style.display = "flex";
                        popup.dataset.manualOpen = "false";

                        clearTimeout(window.trainPopupTimeout);
                        window.trainPopupTimeout = setTimeout(() => {
                            if (popup.dataset.manualOpen !== "true") {
                                hideStationPopup();
                            }
                        }, 2500);
                    });

                    marker.addTo(railRoutesLayerGroup);
                    visibleMarker.addTo(railRoutesLayerGroup);
                    return null;
                }
            });

            
            if (!showRoutes) {
                map.removeLayer(routeLayersGroup);
            }
            if (!showRail) {
                map.removeLayer(railRoutesLayerGroup);
            }
        
        // Start the simulation 
        startSimulation();
    })
    .catch(error => console.error("Error loading data:", error));
    
    function updateLegend() {
        const l = document.getElementById("lrtLegendRow");
        const m = document.getElementById("metroLegendRow");
        const r = document.getElementById("hrLegendRow");
        if (activeLayers === "lrt") {
            l.style.display = "flex";
            m.style.display = "none";
            r.style.display = "none";
        } else if (activeLayers === "lrt-metro") {
            l.style.display = "flex";
            m.style.display = "flex";
            r.style.display = "none";
        } else {
            l.style.display = "flex";
            m.style.display = "flex";
            r.style.display = "flex";
        }
    }

    // Change visibility of layers as required - either LRT only, LRT+Metro, or LRT+Metro+Rail
    function changeLayers(restartSim=true) {
        updateLegend();
        // Rail is only available with all layers visible
        if (activeLayers !== "lrt-metro-rail") {
            showRail = false;
            toggleDisplayRail(); 
        } else {
            showRail = true;
            toggleDisplayRail();
        }   
        // Hide all metro components when only LRT is selected
        if (activeLayers === "lrt") {
            // Hide all metro trains
            trains.forEach(train => {
                if (train.vehicleType === "METRO") {
                    train.marker.remove();
                }
            });
            // Hide all metro route lines and stations
            routeLayersGroup.eachLayer(layer => {
                // Check if this is a metro line (by color or other property)
                if (layer.options && layer.options.color && Object.values(lineColours).includes(layer.options.color)) {
                    // Metro lines use lineColours with keys starting with "M"
                    const isMetro = Object.entries(lineColours).some(([key, color]) => key.startsWith("M") && color === layer.options.color);
                    if (isMetro) {
                        map.removeLayer(layer);
                    }
                }
            });
            stationDotsLayerGroup.eachLayer(layer => {  
                if (layer.line && layer.line.startsWith("M")) { 
                    map.removeLayer(layer); // Remove metro station dots
                }
            });
            populateWayfindingOptions(true); // Update wayfinding options to only show LRT stations
        } else {
            // If not only LRT, ensure all metro lines and stations are visible
            if (showRoutes) {
                routeLayersGroup.eachLayer(layer => {
                if (layer.options && layer.options.color && Object.values(lineColours).includes(layer.options.color)) {
                    const isMetro = Object.entries(lineColours).some(([key, color]) => key.startsWith("M") && color === layer.options.color);
                    if (isMetro && !map.hasLayer(layer)) {
                        map.addLayer(layer);
                    }
                }
            });
            stationDotsLayerGroup.eachLayer(layer => {  
                if (layer.line && layer.line.startsWith("M")) { 
                    map.addLayer(layer); // Remove metro station dots
                }
            });
            }
            populateWayfindingOptions();
            if (restartSim) {
                startSimulation(); 
            }
            
        }
    }



/********************************************
 * Train Class
 ********************************************/
class Train {
    constructor(route, label, color, vtype, offset = 0) {
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
        this.lineString = turf.lineString(this.route); 
        this.vehicleType = vtype;
        this.minimumHeadway = 75; // Minimum separation in meters
        this.branchId = null; // To be set when spawning trains.
        this.ahead = null;
        this.behind = null;
        
        let posFeature = turf.along(this.lineString, this.distance / 1000, {
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
        });
        if (this.vehicleType === 'MAINLINE') {
            //TODO: despawn and unaminate trains when rail layer is hidden
            this.marker.addTo(railTrainsLayerGroup);
        } else {
            this.marker.addTo(map);

        }
        this.marker.getElement().style.backgroundColor = color;

        // When train marker is clicked, show pop-up with route bullet and station info.
        this.marker.on("click", event => {
            hideStationPopup(); //hide any visible popup first
            event.originalEvent.stopPropagation();
            // Update station info before showing popup.
            this.updateStationInfo();
            const popup = document.getElementById("trainPopup");
            const routeBullet = document.getElementById("popupRouteBullet");
            const destElem = document.getElementById("popupDestination");
            const nsElem = document.getElementById("popupNextStop");

            routeBullet.innerHTML = this.label;
            routeBullet.style.backgroundColor = this.color;
            routeBullet.style.color = "white";

            destElem.textContent = `${translations[currentLang]["destination"]}: ${this.getCurrentDestination()}`;
            nsElem.textContent = `${translations[currentLang]["next-stop"]}: ${this.getNextStation()}`;

            popup.style.display = "flex";
            popup.dataset.manualOpen = "true"; // Mark as manually opened.
        });

        // On hover, show popup with auto-close after 4 seconds.
        this.marker.on("mouseover", event => {
            hideStationPopup(); //hide any visible popup first
            event.originalEvent.stopPropagation();
            this.updateStationInfo();
            const popup = document.getElementById("trainPopup");
            const routeBullet = document.getElementById("popupRouteBullet");
            const destElem = document.getElementById("popupDestination");
            const nsElem = document.getElementById("popupNextStop");

            routeBullet.innerHTML = this.label;
            routeBullet.style.backgroundColor = this.color;
            routeBullet.style.color = "white";

            destElem.textContent = `${translations[currentLang]["destination"]}: ${this.getCurrentDestination()}`;
            nsElem.textContent = `${translations[currentLang]["next-stop"]}: ${this.getNextStation()}`;

            popup.style.display = "flex";
            popup.dataset.manualOpen = "false"; // Mark as manually opened.

            clearTimeout(window.trainPopupTimeout);
            window.trainPopupTimeout = setTimeout(() => {
                if (popup.dataset.manualOpen !== "true") {
                    hideTrainPopup();
                }
            }, 2500); //auto close after 2.5 seconds 
        });

       
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
        // For forward direction, use the last station's name; for reverse, the first.
        if (this.stationData.length === 0) return "";
        const dest = this.direction === 1
            ? this.stationData[this.stationData.length - 1]
            : this.stationData[0];
        try {
            console.log("Service:", dest.properties.service_id);       
        } catch (error) {}
        return (dest.name && dest.name[currentLang]) || dest.id || dest.properties.station_name;
    }
    
    getNextStation() {
        if (this.nextStationIndex >= 0 && this.nextStationIndex < this.stationData.length) {
            const next = this.stationData[this.nextStationIndex];
            return (next.name && next.name[currentLang]) || next.id || "Unknown";
        }
        return translations[currentLang]["terminus"] || "Terminus";
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
        if (!this.ahead) return true;
        // Debug logging to ensure both trains have the same direction:
        let separation;
        if (this.direction === 1) {
            separation = this.ahead.distance - this.distance;
            if (separation < 0) separation += this.totalDistance;
        } else {
            separation = this.distance - this.ahead.distance;
            if (separation < 0) separation += this.totalDistance;
        }
        if (separation < 200) {
            
            console.log(`Train ${this.label} (dir ${this.direction}) ahead is ${this.ahead.label} (dir ${this.ahead.direction})`);
            console.log(`Separation: ${separation}, Minimum required: ${this.minimumHeadway}`);
        }
        return separation >= this.minimumHeadway;
    }
    

    update(deltaTime) {

        if (this.isDwelling) {
            if (Date.now() >= this.dwellUntil) {
                // if (this.checkHeadway()) {
                    this.isDwelling = false;
                    this.updateNextStationIndex();
                    this.updateStationInfo();
                // } else {
                    this.dwellUntil = Date.now() + 1000;
                // }
            }
            return;
        }
        // if (this.checkHeadway()) {
            const currentSpeed = (this.vehicleType === 'METRO') ? VEHICLE_SPEEDS.METRO
                : (this.vehicleType === 'LRT') ? VEHICLE_SPEEDS.LRT
                : VEHICLE_SPEEDS.MAINLINE;

            this.distance += currentSpeed * deltaTime * timeScale * this.direction;
            let mainlineDwellMult = this.vehicleType !== "MAINLINE" ? 1 : 5; // Scalar for mainline reversals, as they tend to dwell longer
            // Terminal reversal check
            
            if (this.distance >= this.totalDistance) {
                this.distance = this.totalDistance;
                this.direction = -1;
                this.isDwelling = true;
                this.dwellUntil = Date.now() + mainlineDwellMult * DEFAULT_DWELL_TIME * 1000;
                this.currentStationIndex = this.stations.length - 1;
            } else if (this.distance <= 0) {
                this.distance = 0;
                this.direction = 1;
                this.isDwelling = true;
                this.dwellUntil = Date.now() + mainlineDwellMult * DEFAULT_DWELL_TIME * 1000;
                this.currentStationIndex = 0;
            }
            mainlineDwellMult = this.vehicleType !== "MAINLINE" ? 1 : 2; // Scalar for mainline stops, as they tend to dwell longer
            // Station check: if the train reaches (or passes) a station target, dwell.
            if (this.stations.length > 0) {
                let target = this.stations[this.currentStationIndex];
                if ((this.direction === 1 && this.distance >= target) ||
                    (this.direction === -1 && this.distance <= target)) {
                    this.distance = target;
                    this.isDwelling = true;
                    this.dwellUntil = Date.now() + mainlineDwellMult * DEFAULT_DWELL_TIME * 1000;
                    this.updateNextStationIndex();
                    this.updateStationInfo();
                }

            }
            let posFeature = turf.along(this.lineString, this.distance / 1000, {
                units: "kilometers"
            });
            if (posFeature && posFeature.geometry && posFeature.geometry.coordinates) {
                let newPos = posFeature.geometry.coordinates;
                this.marker.setLatLng([newPos[1], newPos[0]]);
            }
        // }
    }
}

/********************************************
 * Simulation Setup & Animation Loop
 ********************************************/
let frameId;

function startSimulation() {
    // Clear existing trains
    // trains.forEach(train => train.marker.remove());
    trains.forEach(train => {
        if (train.vehicleType === "MAINLINE") {
            railTrainsLayerGroup.removeLayer(train.marker);
        } else {
            train.marker.remove();  
        }
    });
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

            let oppositeDirOffset = (routeLength / totalTrains) / 2; // Offset to stagger opposite direction
            for (let i = 0; i < totalTrains; i++) {
                const direction = i % 2 === 0 ? 1 : -1; // Alternate directions
                const index = Math.floor(i / 2); // Half as many trains per direction
                let spacing;
                if (branchId === 'R23' && direction === 1 && timePeriod !== 'peaks') {
                    //use the short turn distance for short turning R23 trains
                    spacing = 11656 / trainsPerDirection; 
                } else {
                    spacing = routeLength / trainsPerDirection;
                }
                
                let offset;
                if (direction === 1) {
                    offset = index * spacing;
                } else {
                    offset = routeLength - (index * spacing) - oppositeDirOffset; // Stagger opposite direction
                }
                
                let trainLabel = lineId.startsWith('M') ? lineId.charAt(1) : lineId.charAt(0);
                let train = new Train(route, trainLabel, lineColours[lineId.split('_')[0]], vtype, offset);
                // Short turn southbound R3 trains at Elifelet outside of weekday peaks
                if (
                    branchId === 'R23' &&    // For the R23 branch
                    train.direction === 1 && // Southbound trains
                    timePeriod !== 'peaks'  // Only on weekday, outside peak periods
                ) {
                    const shortTurnDistance = 11656; //truncate the line to Elifelet
                    train.stations = train.stations.filter(dist => dist <= shortTurnDistance);
                    train.stationData = train.stationData.filter(station => Number(station.distance) <= shortTurnDistance);
                    train.totalDistance = shortTurnDistance
                }
                
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
    //Spawn heavy rail trains, if required
    if (showRail) {
        spawnHeavyRailTrains(mainlineOps);
    }
}

function spawnHeavyRailTrains(operatingDetails) {
    // Use preprocessed heavyRailRoutes
    if (Object.keys(heavyRailRoutes).length > 0) {
        Object.keys(heavyRailRoutes).forEach(serviceId => {
            const routeObj = heavyRailRoutes[serviceId];
            if (!routeObj) return;
            const coords = routeObj.coords;
            const stations = routeObj.stations;
            // Heavy rail parameters
            const heavyRailColor = "#444";
            const heavyRailLabel = "<ion-icon name='train-sharp'></ion-icon>";
            // Set the appropriate speed and frequency for heavy rail trains;
            let l = operatingDetails.lines.find(obj => obj.hasOwnProperty(serviceId))
            if (!l) return;
            const heavyRailSpeed = l[serviceId].speed * 1000 / 3600; // Convert km/h to m/s 
            const timePeriod = document.getElementById("timePeriodSelect").value
            // Mainline rail has only two time periods: peaks and off-peak
            const heavyRailFrequency = timePeriod === "peaks" ? l[serviceId].peakFreq : l[serviceId].offPeakFreq; // Frequency in tph
            const headway = 60 / heavyRailFrequency;

            const lineString = turf.lineString(coords);
            const routeLength = turf.length(lineString) * 1000;
            const avgSpeed = heavyRailSpeed * 0.5; // Very rough heuristic
            const roundTripTime = (2 * routeLength) / avgSpeed;
            const trainsPerDirection = Math.ceil((roundTripTime / 60) / headway / 2);
            const totalTrains = 2 * trainsPerDirection;
            console.log("Trains per direction for line", serviceId, trainsPerDirection);
            let oppositeDirOffset = (routeLength / totalTrains) / 2;
            for (let i = 0; i < totalTrains; i++) {
                const direction = i % 2 === 0 ? 1 : -1;
                const index = Math.floor(i / 2);
                const spacing = routeLength / trainsPerDirection;
                let offset;
                if (direction === 1) {
                    offset = index * spacing;
                } else {
                    offset = routeLength - (index * spacing) - oppositeDirOffset;
                }
                let train = new Train({ coords, stations }, heavyRailLabel, heavyRailColor, "MAINLINE", offset);
                train.direction = direction;
                trains.push(train);
            }
        });
    }
}