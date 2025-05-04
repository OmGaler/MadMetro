// wayfinder.js

/********************************************
 * Constants
 ********************************************/
export const SPEEDS = {
    "M": 80 * 0.27778, // 80 km/h in m/s ≈ 22.22 m/s
    "LRU": 70 * 0.27778, // 70 km/h in m/s ≈ 19.44 m/s (LRT Underground)
    "LRO": 60 * 0.27778 // 60 km/h in m/s ≈ 16.67 m/s (LRT Overground)
};

// Where branches diverge: R. Eliyahu, Sokolov, Aharonovitz, Ramat Efal, Einstein, Sokolov - West
// Keep track of continuous paths through them, if a path is not in these, it must involve a change+backtrack
const junctions = {
    15: [ // Ramat Eliyahu
        [14, 15, 16], // Northbound
        [52, 15, 16], // Northbound
        [16, 15, 14], // Southbound
        [16, 15, 52] // Southbound
    ],
    32: [ // Sokolov
        [31, 32, 33], // Northbound
        [31, 32, 53], // Northbound
        [33, 32, 31], // Southbound
        [53, 32, 31] // Southbound
    ],
    111: [ // Aharonovitz
        [110, 111, 112], // Westbound
        [136, 111, 112], // Westbound
        [112, 111, 110], // Eastbound
        [112, 111, 136] // Eastbound
    ],
    204: [ // Ramat Efal
        [203, 204, 205], // Eastbound
        [203, 204, 211], // Eastbound
        [205, 204, 203], // Westbound
        [211, 204, 203] // Westbound
    ],
    147: [ // Einstein
        [148, 147, 146], // Northbound
        [148, 147, 177], // Northbound
        [146, 147, 148], // Southbound
        [177, 147, 148] // Southbound
    ],
    159: [ // Sokolov - West
        [158, 159, 160], // Southbound
        [158, 159, 178], // Southbound
        [160, 159, 158], // Northbound
        [178, 159, 158] // Northbound
    ]
};
export const ACCEL = 0.8; // Acceleration (and deceleration) in m/s²
// Heuristic constants to adjust calculated journey times
const SCALAR = {"M": 1.1, "LRU": 1.35, "LRO": 1.5};
const DWELL_BUFFER = 0.5; //30 seconds dwell time per station
/********************************************
 * Convert edge weights to times using mechanics
 ********************************************/
export function calculateEdgeTime(distance, lineType) {
    // Get top speed for the given line type (default to LRO if unknown)
    const V = SPEEDS[lineType.toUpperCase()] || SPEEDS.LRO;
    // Time to reach top speed (acceleration phase)
    const tAccel = V / ACCEL;
    // Distance covered during acceleration: d = 0.5 * a * t²
    const dAccel = 0.5 * ACCEL * tAccel * tAccel;
    // Assume deceleration is symmetric:
    const tDecel = tAccel;
    const dDecel = dAccel;

    let totalTimeSec = 0;

    if (distance >= dAccel + dDecel) {
        // Top speed is reached so cruising phase exists
        const dCruise = distance - (dAccel + dDecel);
        const tCruise = dCruise / V;
        totalTimeSec = tAccel + tCruise + tDecel;
    } else {
        // If segment is too short to reach top speed,
        // use a triangular velocity profile:
        totalTimeSec = 2 * Math.sqrt(distance / ACCEL);
    }
    // Convert time to minutes
    totalTimeSec /= 60;
    // Adjust the physics-calculated time by adding a heuristic scalar and dwell buffer 
    // To better model real life operations
    return totalTimeSec * SCALAR[lineType] + DWELL_BUFFER;
}
/********************************************
 * Graph Building
 * Expects edges in the form:
 * { source: <number>, destination: <number>, distance: <meters>, type: <string> }
********************************************/
export function buildGraph(edges) {
    const graph = {};
    edges.forEach(edge => {
        const src = edge.source;
        const dst = edge.destination;
        const weight = calculateEdgeTime(edge.distance, edge.type);
        // Include the line type with each neighbor so we can detect transfers
        if (!graph[src]) graph[src] = [];
        if (!graph[dst]) graph[dst] = [];
        graph[src].push({
            node: dst,
            weight,
            line: edge.line,
            type: edge.type
        });
        graph[dst].push({
            node: src,
            weight,
            line: edge.line,
            type: edge.type
        });
    });
    return graph;
}

/********************************************
 * Priority Queue Implementation
 ********************************************/
export class PriorityQueue {
    constructor() {
        this.elements = [];
    }

    enqueue(element, priority) {
        this.elements.push({
            element,
            priority
        });
        this.elements.sort((a, b) => a.priority - b.priority);
    }

    dequeue() {
        return this.elements.shift();
    }

    isEmpty() {
        return this.elements.length === 0;
    }
}

/********************************************
 * Dijsktra's Algorithm with Transfer Penalty
 * This algorithm tracks the current line along each path.
 * When a transfer occurs (i.e. the line changes), it adds a transfer penalty (in minutes).
 ********************************************/
export function dijkstraWithTransfers(graph, start, end, pref = 'quickest') {
    const distances = {}; // Travel time
    const transfers = {}; // Number of transfers
    const previous = {};
    const queue = new PriorityQueue();

    // Initialize distances, transfers and previous mapping
    for (let node in graph) {
        distances[node] = Infinity;
        transfers[node] = Infinity;
        previous[node] = null;
    }

    // Start at the starting node with no assigned line
    distances[start] = 0;
    transfers[start] = 0;
    queue.enqueue({
        node: start,
        line: null,
        transferCount: 0
    }, 0);

    while (!queue.isEmpty()) {
        const currentObj = queue.dequeue().element;
        const current = currentObj.node;
        const currentLine = currentObj.line;
        const currentTransfers = currentObj.transferCount;

        if (current == end) break;

        for (const neighbor of graph[current]) {
            const { 
                node: nextNode,
                weight, 
                line 
            } = neighbor;

            let newTransfers = currentTransfers;
            // Add a transfer penalty if switching lines
            let transferPenalty = 0;
            if (currentLine && currentLine !== line) {
                newTransfers += 1;
                transferPenalty = 2; // 2 minutes for a transfer
            }
            const newDistance = distances[current] + weight + transferPenalty;
            // Set priority based on user preference
            let priority;
            if (pref === 'fewest_changes') {
                // For fewest changes: primary sort by transfers, secondary by time
                priority = (newTransfers * 1e5) + newDistance;
            } else {
                // For quickest: sort only by time 
                priority = newDistance + newTransfers;
            }

            // Check if this path is better than what we have
            const isBetterPath = 
                (pref === 'fewest_changes' && 
                    (newTransfers < transfers[nextNode] || 
                    (newTransfers === transfers[nextNode] && newDistance < distances[nextNode]))) ||
                (pref === 'quickest' && 
                    newDistance + transferPenalty < distances[nextNode]);

            if (isBetterPath) {
                // Update with the better path
                distances[nextNode] = newDistance;
                transfers[nextNode] = newTransfers;
                previous[nextNode] = {
                    station: current,
                    line: line
                };
                queue.enqueue({
                    node: nextNode,
                    line: line,
                    transferCount: newTransfers
                }, priority);
            }
        }
    }

    return {
        distances,
        transfers,
        previous
    };
}

/********************************************
 * Path Reconstruction with Transfers
 * Reconstructs the route and detects transfer points based on line changes.
 ********************************************/
export function reconstructPathWithTransfers(previous, distances, start, end) {
    let path = [];
    let transfers = [];
    let current = end;
    let lastLine = previous[current] ? previous[current].line : null;
    let lastStation = null;
    while (current !== null && previous[current] !== null) {
        // Insert current station with the associated line
        path.unshift({
            station: current,
            line: lastLine
        });
        
        // Check for a transfer: if the line used to arrive at the current station differs
        // from the line used at the previous station, record a transfer.
        if (previous[current].line !== lastLine) {
            // Add the station again
            path.unshift({
                station: current,
                line: previous[current].line
            });
            transfers.unshift({
                station: current,
                from: previous[current].line,
                to: lastLine
            });
        }

        // If we have a valid "three-station" sequence (previous station, current, and lastStation)
        if (lastStation !== null && junctions.hasOwnProperty(current.toString())) {
            // Build the sequence: previous station -> current -> lastStation.
            const seq = [
                previous[current].station.toString(), 
                current.toString(), 
                lastStation.toString()
            ];
            
            // Check if the sequence is one of the valid segments.
            const validSequences = junctions[current.toString()];
            const sequenceMatches = validSequences.some(validSeq =>
                validSeq[0].toString() === seq[0].toString() && validSeq[1].toString() === seq[1].toString() && validSeq[2].toString() === seq[2].toString()
            );

            console.log(validSequences, seq, sequenceMatches);  
            if (!sequenceMatches) {
                // console.log("Backtrack detected at junction: ", current, lastStation, previous[current].station);
                // Record a transfer if the sequence does not match a valid segment - it means we've backtracked at a junction
                transfers.unshift({
                    station: current,
                    from: lastLine,
                    to: previous[current].line
                });
                path.unshift({
                    station: current,
                    line: previous[current].line
                });
            }
        }
        
        lastStation = current;
    

        lastLine = previous[current].line;
        current = previous[current].station;
    }

    // Add the starting station to the beginning of the path
    path.unshift({
        station: start,
        line: lastLine
    });
    return {
        path,
        transfers,
        journeyTime: distances[end]
    };
}