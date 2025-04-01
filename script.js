import { buildGraph, dijkstraWithTransfers, reconstructPathWithTransfers } from './wayfinder.js';


/********************************************
 * Global Constants & Variables
 ********************************************/
const map = L.map('map').setView([32.0853, 34.7818], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
let routeLayersGroup = L.layerGroup().addTo(map);
let wayfindLayersGroup = L.layerGroup().addTo(map);
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
let G = {}; // Network Graph
let gr;
let wayfinderActive = false;
let originStn = null;
let destinationStn = null;
let stationLookup;
let trains = [];
let showRoutes = document.getElementById("toggleRoutes").checked; //show lines and stations, default off
let routesPreWF = showRoutes;
// Simulation constants:
const trainSpeed = 80 * 1000 / 3600; // 80 km/h in m/s
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
        console.log("Loaded translations successfully");
        updateLanguage(currentLang);
    })
    .catch(error => console.error("Error loading translations:", error));

function updateLanguage(lang) {
    currentLang = lang;        
    // Store the current selected values before updating
    const dayTypeSelect = document.getElementById("dayTypeSelect");
    const timePeriodSelect = document.getElementById("timePeriodSelect");
    const selectedDayType = dayTypeSelect.value;
    const selectedTimePeriod = timePeriodSelect.value;
    
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
    
    // Repopulate day and time period options
    updateCustomSelectOptions("dayTypeSelect");
    // Ensure dayTypeSelect keeps its value
    dayTypeSelect.value = selectedDayType;
    // Update time period options based on the preserved day type
    updateTimePeriodOptions();
    // Restore the previously selected time period if it exists in the new options
    if (selectedTimePeriod) {
        // Check if the option exists in the updated select
        const optionExists = Array.from(timePeriodSelect.options).some(
            option => option.value === selectedTimePeriod
        );
        
        if (optionExists) {
            timePeriodSelect.value = selectedTimePeriod;
            // Update the custom select display to reflect this
            updateCustomSelectOptions("timePeriodSelect");
        }
    }
    // Update station drop downs
    // populateWayfindingOptions();
    // updateCustomSelectOptions("startStationSelect");
    // updateCustomSelectOptions("endStationSelect");
    // Update route icons
    const sicon = document.getElementById("start-icon");
    const eicon = document.getElementById("end-icon");
    if (lang === "he") {
        sicon.classList.add("flipped-icon");
        eicon.classList.add("flipped-icon");
    } else {
        sicon.classList.remove("flipped-icon");
        eicon.classList.remove("flipped-icon");
    }
    // Repopulate station selects
    updateLineInfo();
    updateSpeed();
}

window.updateLanguage = updateLanguage;

function toggleLanguage() {
    const newLang = currentLang === "en" ? "he" : "en";
    updateLanguage(newLang);
}

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


function getRouteBullet(line) {
    // TODO: reuse bullet logic
    //TODO; fix new lines on custom drop downs
    const bullet = document.createElement("span");
    bullet.classList.add("bullet");
    if (line.startsWith("M")) { // Use the number 
        bullet.style.backgroundColor = lineColours[line] || "#777";
        bullet.textContent = line.charAt(1);
    } else { // Use the letter
        bullet.style.backgroundColor = lineColours[line.charAt(0)] || "#777";
        bullet.textContent = line.charAt(0);
    }
    return bullet;
}

// Helper to generate the inner HTML string for an option, including inline bullets.
function getStationRouteBullets(station) {
    const container = document.createElement("span");
    container.style.display = "inline-flex";
    container.style.gap = "5px"; // Space between bullets
    station.lines.forEach(line => {
        container.appendChild(getRouteBullet(line));
    });
    return container;
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
        selectSelected.innerHTML = select.options[select.selectedIndex].innerHTML;
    }
    // Rebuild the dropdown items list
    const selectItems = customSelectContainer.querySelector('.select-items');
    selectItems.innerHTML = '';
    Array.from(select.options).forEach((option, index) => {
        const div = document.createElement('div');
        div.innerHTML = option.innerHTML;
        // div.textContent = option.textContent;
        div.addEventListener('click', function() {
            select.selectedIndex = index;
            selectSelected.innerHTML = this.innerHTML;
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
        toggleRoutesCheckbox.checked = true;
        map.addLayer(routeLayersGroup);
    } else {
        toggleRoutesCheckbox.checked = false;
        map.removeLayer(routeLayersGroup);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const wayfinderContent = document.querySelector(".wayfinder-content");
    const dragHandle = document.createElement("div");
    dragHandle.classList.add("drag-handle");
    wayfinderContent.prepend(dragHandle);

    let startY = 0;
    let currentHeight = 30; // Default height in vh

    dragHandle.addEventListener("mousedown", startDrag);
    dragHandle.addEventListener("touchstart", startDrag);

    function startDrag(e) {
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
        document.removeEventListener("mousemove", onDrag);
        document.removeEventListener("mouseup", stopDrag);
        document.removeEventListener("touchmove", onDrag);
        document.removeEventListener("touchend", stopDrag);
    }

    // Click to toggle between states
    dragHandle.addEventListener("click", () => {
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
// const speedValue = document.getElementById("speedValue");
const realTimeInfo = document.getElementById("realTimeInfo");

let speedIndex = parseInt(speedSlider.value); //track current speed index

// Function to update speed display
function updateSpeed() {
    // let index = parseInt(speedSlider.value);
    let simSpeed = speedValues[speedIndex];
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
    if (event.key.toLowerCase() === "t") {
        event.preventDefault(); // Prevent unintended browser actions
        showRoutes = !showRoutes;
        toggleDisplayRoutes();
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

function populateWayfindingOptions() {
    const stns = G.nodes;
    stns.forEach(stn => {
        stn.mergedName = getMergedStationName(stn);
    });
    const sortedStations = stns.sort((a, b) => 
        a.mergedName.localeCompare(b.mergedName)
    );
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
            const bullet = getRouteBullet(line);
            // Configure bullet to be smaller before getting HTML
            bullet.style.width = "20px";
            bullet.style.height = "20px";
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
    updateCustomSelectOptions("startStationSelect");
    updateCustomSelectOptions("endStationSelect");
}

// Builds and returns an HTML element with route details 
function buildRouteDetails(route) {
    //TODO: add a disclaimer at the bottom of wayfinder pane in dim style. something along the lines of 
    // journey times are estimations only and accuracy is not guaranteed 
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
    // --- 3. Transfer Details ---
    // if (route.transfers && route.transfers.length > 0) {
    //     const transferDiv = document.createElement("div");
    //     transferDiv.classList.add("transfer-details");
    //     route.transfers.forEach((transfer) => {
    //         // Look up the station name via stationLookup:
    //         const station = stationLookup[transfer.station];
    //         const p = document.createElement("p");
    //         // TODO: change -.- to commit icon
    //         p.innerHTML = `-.- Change to ${getRouteBullet(transfer.to).outerHTML} at ${station ? station.mergedName : transfer.station}`;
    //         transferDiv.appendChild(p);
    //     });
    // container.appendChild(transferDiv);
    // }
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
            if (item.line === currentLine) {
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
    //TODO: add a dot at beginning and end of route to indicate start/end point 
    // Clear any previous highlighted route segments
    wayfindLayersGroup.clearLayers();
    
    // Iterate over consecutive pairs in the computed path
    for (let i = 0; i < path.length - 1; i++) {
        const stationAId = path[i].station;
        const stationBId = path[i + 1].station;
        // Use computed line from the second station for candidate filtering…
        const computedLine = path[i + 1].line;
        if (!computedLine) continue;

        // Fallback: use from-station line if available, otherwise computedLine.
        const segmentLine = path[i].line || computedLine;
        const highlightColour = lineColours[segmentLine] || "yellow";

        // Filter candidate service routes by computedLine.
        let candidateRouteKeys = Object.keys(serviceRoutes).filter(key =>
            key.startsWith(computedLine.toUpperCase())
        );
        // Fallback to all service routes if no candidate keys were found.
        if (!candidateRouteKeys.length) {
            candidateRouteKeys = Object.keys(serviceRoutes);
        }

        let routeObj = null;
        let stationAObj = null;
        let stationBObj = null;

        // Look for a service route that contains both station IDs.
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

        // Create a Turf lineString from the route's coordinates.
        const lineStr = turf.lineString(routeObj.coords);

        // Turf's along expects distances in kilometers.
        let fromDistance = stationAObj.distance / 1000;
        let toDistance = stationBObj.distance / 1000;

        // If the distances are in reverse order, swap them.
        if (fromDistance > toDistance) {
            [fromDistance, toDistance] = [toDistance, fromDistance];
        }

        // Get the points on the line corresponding to the station distances.
        const fromPoint = turf.along(lineStr, fromDistance, { units: "kilometers" });
        const toPoint = turf.along(lineStr, toDistance, { units: "kilometers" });

        // Extract the sub-line between these two points.
        let subLine = turf.lineSlice(fromPoint, toPoint, lineStr);
        let latlngs = [];
        if (!subLine || !subLine.geometry || !subLine.geometry.coordinates.length) {
            // Fallback: if lineSlice fails, use the two points.
            latlngs = [
                [fromPoint.geometry.coordinates[1], fromPoint.geometry.coordinates[0]],
                [toPoint.geometry.coordinates[1], toPoint.geometry.coordinates[0]]
            ];
        } else {
            // Convert Turf coordinates ([lng, lat]) to Leaflet latlngs ([lat, lng])
            latlngs = subLine.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        }

        // Create and add the highlighted polyline segment to the map.
        L.polyline(latlngs, {
            color: highlightColour,
            weight: 6,
            opacity: 0.9
        }).addTo(wayfindLayersGroup);
    }
}


function displayRoute(route) { // Visualises the computed path on the map by only highlighting the segments traversed
    showRoutes = false;
    toggleDisplayRoutes();
    highlightWayfoundRoute(route.path);   
    const detailsContainer = document.querySelector(".route-details-container");
    detailsContainer.innerHTML = ""; 
    const routeElement = buildRouteDetails(route);
    detailsContainer.appendChild(routeElement);
}

function getRoute(startNode, endNode) {
    if (startNode === endNode) {
        return;
    }
    const { distances, previous } = dijkstraWithTransfers(gr, startNode, endNode);
    // const { path, transfers, journeyTime } = reconstructPathWithTransfers(previous, distances, startNode, endNode);
    const route = reconstructPathWithTransfers(previous, distances, startNode, endNode);
    console.log("Route path:", route.path.map(p => `${stationLookup[p.station].name.en|| "Station not found"} (${p.line})`).join(" → "));
    console.log("Transfers:", route.transfers.length > 0 ? route.transfers : "No transfers needed.");
    console.log("Estimated travel time (minutes):", route.journeyTime);
    displayRoute(route);
}

// Restore various states upon leaving wayfinder 
function exitWayfinder() {
    // Clear route visual
    wayfindLayersGroup.clearLayers();
    // Restart simulation respawn all trains 
    simPaused = false;
    showRoutes = routesPreWF;
    toggleDisplayRoutes();
    startSimulation()
    document.getElementById("pause").innerHTML = "<ion-icon name='pause'></ion-icon>";
}

function wayfind() {
    //TODO: make the stations easier to click
    // Despawn all trains
    trains.forEach(train => train.marker.remove());
    trains = [];
    console.log("Entering wayfinder mode");
    gr = buildGraph(G.edges);
    wayfinderActive = true;
    // Toggle stations + routes on
    routesPreWF = showRoutes;
    showRoutes = true;
    toggleDisplayRoutes();
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
    if (start && end && start !== end) {
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
        fetch('data/network/preprocessed_station_distances.json').then(res => {
            if (!res.ok) throw new Error("Failed to load preprocessed station distances");
            return res.json();
        }),
        fetch('data/network/network_graph.json').then(res => {
            if (!res.ok) throw new Error("Failed to load network graph");
            return res.json();
        })
    ])
    .then(([schedule, routes, graph]) => {
        scheduleData = schedule;
        console.log("Loaded schedule data:", scheduleData);
        serviceRoutes = routes;
        console.log("Loaded service routes:", serviceRoutes);
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
                        const marker = L.circleMarker([coord[1], coord[0]], {
                            radius: 2,
                            color: "black", //TODO: change  to line colour when in wayfinder showing route, remove lat, long from graph
                            fillOpacity: 0.6
                        });
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
                                bulletsLine.appendChild(getStationRouteBullets(stationLookup[dist.id]));
                                container.appendChild(bulletsLine);
                                popup.appendChild(container);
                                popup.style.display = "flex";
                                popup.dataset.manualOpen = "true"; // Mark as manually opened.
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
                            bulletsLine.appendChild(getStationRouteBullets(stationLookup[dist.id]));
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
                        marker.addTo(routeLayersGroup);
                        // bindPopup(`Station Name: ${dist.name.en}`)
                    }
                });
            });
            if (!showRoutes) {
                map.removeLayer(routeLayersGroup);
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
            hideStationPopup(); //hide any visible popup first
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
            hideStationPopup(); //hide any visible popup first
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
        this.minimumHeadway = 75; // Minimum separation in meters
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
        // }
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
                let train = new Train(route, trainLabel, lineColours[lineId.split('_')[0]], offset);
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