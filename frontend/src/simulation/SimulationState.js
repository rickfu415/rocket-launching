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
        this.timeAcceleration = 5;

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
        this.acceleration = data.acceleration || 0;
        this.stageIndex = data.stage_index || 0;
        this.fuelRemaining = data.fuel_remaining || 0;
        this.dynamicPressure = data.dynamic_pressure || 0;
        this.flightPathAngle = data.flight_path_angle || 0;
        this.position = data.position || [0, 0, 0];
        this.isBurning = data.is_burning || false;

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
}
