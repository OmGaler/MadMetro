// wayfinder.js

/********************************************
 * Constants
 ********************************************/
export const SPEEDS = {
    "M": 80 * 0.27778, // 80 km/h in m/s ≈ 22.22 m/s
    "LRU": 70 * 0.27778, // 70 km/h in m/s ≈ 19.44 m/s (LRT Underground)
    "LRO": 60 * 0.27778 // 60 km/h in m/s ≈ 16.67 m/s (LRT Overground)
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
export function dijkstraWithTransfers(graph, start, end) {
    const distances = {};
    const previous = {};
    const queue = new PriorityQueue();

    // Initialize distances and previous mapping
    for (let node in graph) {
        distances[node] = Infinity;
        previous[node] = null;
    }

    // Start at the starting node with no assigned line
    distances[start] = 0;
    queue.enqueue({
        node: start,
        line: null
    }, 0);

    while (!queue.isEmpty()) {
        const currentObj = queue.dequeue().element;
        const current = currentObj.node;
        const currentLine = currentObj.line;

        if (current == end) break;

        for (const neighbor of graph[current]) {
            const {
                node: nextNode,
                weight,
                line
            } = neighbor;

            // Apply a transfer penalty if switching lines
            let transferPenalty = 0;
            if (currentLine && currentLine !== line) {
                transferPenalty = 2; // 2 minute transfer penalty
            }

            const newTime = distances[current] + weight + transferPenalty;
            if (newTime < distances[nextNode]) {
                distances[nextNode] = newTime;
                previous[nextNode] = {
                    station: current,
                    line: line
                };
                queue.enqueue({
                    node: nextNode,
                    line: line
                }, newTime);
            }
        }
    }

    return {
        distances,
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