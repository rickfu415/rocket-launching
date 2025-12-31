/**
 * Frontend state management for simulation.
 */

export class SimulationState {
    constructor() {
        // Current state
        this.isRunning = false;
        this.isPaused = false;
        this.isComplete = false;

        // Rocket configuration
        this.rocketName = 'falcon9';
        this.payloadMass = 15000;
        this.targetAltitude = 400000; // meters
        this.targetInclination = 28.5; // degrees
        this.timeAcceleration = 1;

        // Latest telemetry
        this.time = 0;
        this.altitude = 0;
        this.velocity = 0;
        this.acceleration = 0;
        this.stageIndex = 0;
        this.fuelRemaining = 1;
        this.dynamicPressure = 0;
        this.flightPathAngle = 90;
        this.position = [0, 0, 0];
        this.isBurning = false;

        // 3D velocity and acceleration vectors (ECI frame)
        this.velocity3D = [0, 0, 0];
        this.acceleration3D = [0, 0, 0];

        // Force breakdown (Newtons)
        this.forceTotal = [0, 0, 0];
        this.forceThrust = [0, 0, 0];
        this.forceGravity = [0, 0, 0];
        this.forceDrag = [0, 0, 0];

        // Acceleration breakdown (m/s^2)
        this.accelerationThrust = [0, 0, 0];
        this.accelerationGravity = [0, 0, 0];
        this.accelerationDrag = [0, 0, 0];

        // Mass and fuel tracking
        this.totalMass = 0;
        this.initialMass = 0;
        this.stageFuelTotal = 0;
        this.stageFuelUsed = 0;
        this.twr = 0;  // Thrust to weight ratio
        this.mach = 0; // Mach number

        // Events
        this.events = [];

        // Final orbit
        this.orbit = null;
        this.success = null;

        // Listeners
        this.listeners = {
            state: [],
            event: [],
            complete: [],
            reset: [],
            start: [],
        };
    }

    /**
     * Update state from server message.
     *
     * @param {Object} data - State data from server
     */
    updateFromServer(data) {
        this.time = data.time || 0;
        this.altitude = data.altitude || 0;
        this.velocity = data.speed || 0;
        this.stageIndex = data.stage_index || 0;
        this.fuelRemaining = data.fuel_remaining || 0;
        this.dynamicPressure = data.dynamic_pressure || 0;
        this.flightPathAngle = data.flight_path_angle || 0;
        this.position = data.position || [0, 0, 0];
        this.isBurning = data.is_burning || false;

        // 3D velocity (from server)
        this.velocity3D = data.velocity || [0, 0, 0];

        // 3D acceleration and force breakdown
        this.acceleration3D = data.acceleration || [0, 0, 0];
        this.accelerationThrust = data.acceleration_thrust || [0, 0, 0];
        this.accelerationGravity = data.acceleration_gravity || [0, 0, 0];
        this.accelerationDrag = data.acceleration_drag || [0, 0, 0];

        this.forceTotal = data.force_total || [0, 0, 0];
        this.forceThrust = data.force_thrust || [0, 0, 0];
        this.forceGravity = data.force_gravity || [0, 0, 0];
        this.forceDrag = data.force_drag || [0, 0, 0];

        // Mass and fuel tracking
        this.totalMass = data.total_mass || 0;
        this.initialMass = data.initial_mass || 0;
        this.stageFuelTotal = data.stage_fuel_total || 0;
        this.stageFuelUsed = data.stage_fuel_used || 0;
        this.twr = data.twr || 0;
        this.mach = data.mach || 0;

        // Compute scalar acceleration from 3D vector for backward compatibility
        this.acceleration = Math.sqrt(
            this.acceleration3D[0] ** 2 +
            this.acceleration3D[1] ** 2 +
            this.acceleration3D[2] ** 2
        );

        this._notify('state', data);
    }

    /**
     * Add an event.
     *
     * @param {Object} event - Event data
     */
    addEvent(event) {
        this.events.push(event);
        this._notify('event', event);
    }

    /**
     * Handle simulation completion.
     *
     * @param {Object} result - Completion result
     */
    handleComplete(result) {
        this.isRunning = false;
        this.isComplete = true;
        this.success = result.success;
        this.orbit = result.orbit;

        this._notify('complete', result);
    }

    /**
     * Set running state.
     */
    start() {
        this.isRunning = true;
        this.isPaused = false;
        this.isComplete = false;
        this.events = [];
        this.orbit = null;
        this.success = null;

        this._notify('start', {});
    }

    /**
     * Pause simulation.
     */
    pause() {
        this.isPaused = true;
    }

    /**
     * Resume simulation.
     */
    resume() {
        this.isPaused = false;
    }

    /**
     * Stop simulation.
     */
    stop() {
        this.isRunning = false;
        this.isPaused = false;
    }

    /**
     * Reset state for new simulation.
     */
    reset() {
        this.isRunning = false;
        this.isPaused = false;
        this.isComplete = false;
        this.time = 0;
        this.altitude = 0;
        this.velocity = 0;
        this.acceleration = 0;
        this.stageIndex = 0;
        this.fuelRemaining = 1;
        this.dynamicPressure = 0;
        this.flightPathAngle = 90;
        this.position = [0, 0, 0];
        this.isBurning = false;
        this.events = [];
        this.orbit = null;
        this.success = null;

        // Reset 3D vectors
        this.velocity3D = [0, 0, 0];
        this.acceleration3D = [0, 0, 0];
        this.forceTotal = [0, 0, 0];
        this.forceThrust = [0, 0, 0];
        this.forceGravity = [0, 0, 0];
        this.forceDrag = [0, 0, 0];
        this.accelerationThrust = [0, 0, 0];
        this.accelerationGravity = [0, 0, 0];
        this.accelerationDrag = [0, 0, 0];

        // Reset mass and fuel tracking
        this.totalMass = 0;
        this.initialMass = 0;
        this.stageFuelTotal = 0;
        this.stageFuelUsed = 0;
        this.twr = 0;
        this.mach = 0;

        this._notify('reset', {});
    }

    /**
     * Subscribe to state changes.
     *
     * @param {string} eventType - Event type ('state', 'event', 'complete', 'reset')
     * @param {Function} callback - Callback function
     */
    on(eventType, callback) {
        if (this.listeners[eventType]) {
            this.listeners[eventType].push(callback);
        }
    }

    /**
     * Unsubscribe from state changes.
     *
     * @param {string} eventType - Event type
     * @param {Function} callback - Callback function
     */
    off(eventType, callback) {
        if (this.listeners[eventType]) {
            const index = this.listeners[eventType].indexOf(callback);
            if (index > -1) {
                this.listeners[eventType].splice(index, 1);
            }
        }
    }

    _notify(eventType, data) {
        if (this.listeners[eventType]) {
            this.listeners[eventType].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Listener error:', error);
                }
            });
        }
    }

    /**
     * Format time as HH:MM:SS.
     */
    getFormattedTime() {
        const totalSeconds = Math.floor(this.time);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Get formatted altitude.
     */
    getFormattedAltitude() {
        if (this.altitude < 1000) {
            return `${this.altitude.toFixed(0)} m`;
        }
        return `${(this.altitude / 1000).toFixed(1)} km`;
    }

    /**
     * Get formatted velocity.
     */
    getFormattedVelocity() {
        if (this.velocity < 1000) {
            return `${this.velocity.toFixed(0)} m/s`;
        }
        return `${(this.velocity / 1000).toFixed(2)} km/s`;
    }

    /**
     * Get formatted acceleration in g.
     */
    getFormattedAcceleration() {
        const g = this.acceleration / 9.81;
        return `${g.toFixed(1)} g`;
    }

    /**
     * Format a 3D vector for display.
     * @param {number[]} vec - 3D vector [x, y, z]
     * @param {string} unit - Unit string
     * @param {number} precision - Decimal places
     */
    _formatVector(vec, unit = '', precision = 1) {
        const x = vec[0].toFixed(precision);
        const y = vec[1].toFixed(precision);
        const z = vec[2].toFixed(precision);
        return `(${x}, ${y}, ${z})${unit ? ' ' + unit : ''}`;
    }

    /**
     * Get formatted 3D velocity.
     */
    getFormattedVelocity3D() {
        return this._formatVector(this.velocity3D, 'm/s', 1);
    }

    /**
     * Get formatted 3D acceleration.
     */
    getFormattedAcceleration3D() {
        return this._formatVector(this.acceleration3D, 'm/s²', 2);
    }

    /**
     * Get formatted thrust force.
     */
    getFormattedForceThrust() {
        // Convert to kN for readability
        const kN = this.forceThrust.map(f => f / 1000);
        return this._formatVector(kN, 'kN', 1);
    }

    /**
     * Get formatted gravity force.
     */
    getFormattedForceGravity() {
        const kN = this.forceGravity.map(f => f / 1000);
        return this._formatVector(kN, 'kN', 1);
    }

    /**
     * Get formatted drag force.
     */
    getFormattedForceDrag() {
        const kN = this.forceDrag.map(f => f / 1000);
        return this._formatVector(kN, 'kN', 1);
    }

    /**
     * Get formatted total force.
     */
    getFormattedForceTotal() {
        const kN = this.forceTotal.map(f => f / 1000);
        return this._formatVector(kN, 'kN', 1);
    }

    /**
     * Get force magnitudes for quick display.
     */
    getForceMagnitudes() {
        const mag = (v) => Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
        return {
            thrust: mag(this.forceThrust) / 1000,  // kN
            gravity: mag(this.forceGravity) / 1000,
            drag: mag(this.forceDrag) / 1000,
            total: mag(this.forceTotal) / 1000,
        };
    }
}
