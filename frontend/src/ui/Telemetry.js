/**
 * Telemetry display for real-time simulation data.
 */

export class Telemetry {
    constructor(simulationState) {
        this.state = simulationState;

        // DOM elements
        this.timeEl = document.getElementById('tel-time');
        this.altitudeEl = document.getElementById('tel-altitude');
        this.velocityEl = document.getElementById('tel-velocity');
        this.accelerationEl = document.getElementById('tel-acceleration');
        this.stageEl = document.getElementById('tel-stage');
        this.fuelBar = document.getElementById('fuel-bar');
        this.dynamicPressureEl = document.getElementById('tel-dynamic-pressure');
        this.flightPathEl = document.getElementById('tel-flight-path');

        // Event log
        this.eventLog = document.getElementById('event-log');

        // Orbit panel
        this.orbitPanel = document.getElementById('orbit-panel');
        this.orbitPeriapsis = document.getElementById('orbit-periapsis');
        this.orbitApoapsis = document.getElementById('orbit-apoapsis');
        this.orbitInclination = document.getElementById('orbit-inclination');
        this.orbitPeriod = document.getElementById('orbit-period');

        // Subscribe to state changes
        this.state.on('state', (data) => this._updateDisplay(data));
        this.state.on('event', (event) => this._addEvent(event));
        this.state.on('complete', (result) => this._handleComplete(result));
        this.state.on('reset', () => this._reset());
    }

    _updateDisplay(data) {
        // Time
        this.timeEl.textContent = this.state.getFormattedTime();

        // Altitude
        this.altitudeEl.textContent = this.state.getFormattedAltitude();

        // Velocity
        this.velocityEl.textContent = this.state.getFormattedVelocity();

        // Acceleration
        this.accelerationEl.textContent = this.state.getFormattedAcceleration();

        // Stage
        this.stageEl.textContent = (this.state.stageIndex + 1).toString();

        // Fuel
        const fuelPercent = Math.max(0, Math.min(100, this.state.fuelRemaining * 100));
        this.fuelBar.style.width = `${fuelPercent}%`;

        // Change fuel bar color based on level
        if (fuelPercent < 20) {
            this.fuelBar.style.background = 'linear-gradient(90deg, #ff4444, #ff6666)';
        } else if (fuelPercent < 50) {
            this.fuelBar.style.background = 'linear-gradient(90deg, #ffaa00, #ffcc00)';
        } else {
            this.fuelBar.style.background = 'linear-gradient(90deg, #00d4ff, #00ff88)';
        }

        // Dynamic pressure
        const qKpa = this.state.dynamicPressure / 1000;
        this.dynamicPressureEl.textContent = `${qKpa.toFixed(1)} kPa`;

        // Flight path angle
        this.flightPathEl.textContent = `${this.state.flightPathAngle.toFixed(1)}°`;
    }

    _addEvent(event) {
        const eventEl = document.createElement('div');
        eventEl.className = 'event-item';

        // Format time
        const minutes = Math.floor(event.time / 60);
        const seconds = Math.floor(event.time % 60);
        const timeStr = `T+${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Format event name
        const eventNames = {
            'liftoff': 'LIFTOFF',
            'max_q': 'MAX-Q',
            'meco': 'MECO',
            'stage_separation': 'STAGE SEP',
            'seco': 'SECO',
            'fairing_jettison': 'FAIRING',
            'orbit_insertion': 'ORBIT',
            'mission_complete': 'COMPLETE',
            'mission_failure': 'FAILURE',
        };

        const eventName = eventNames[event.event] || event.event.toUpperCase();

        // Determine event class
        let eventClass = '';
        if (event.event === 'mission_complete' || event.event === 'orbit_insertion') {
            eventClass = 'success';
        } else if (event.event === 'mission_failure') {
            eventClass = 'failure';
        }

        eventEl.innerHTML = `
            <span class="event-time">${timeStr}</span>
            <span class="event-name ${eventClass}">${eventName}</span>
        `;

        this.eventLog.appendChild(eventEl);
        this.eventLog.scrollTop = this.eventLog.scrollHeight;
    }

    _handleComplete(result) {
        if (result.success && result.orbit) {
            this._showOrbitInfo(result.orbit);
        }
    }

    _showOrbitInfo(orbit) {
        // Format periapsis
        const periapsis = orbit.periapsis_altitude / 1000;
        this.orbitPeriapsis.textContent = `${periapsis.toFixed(1)} km`;

        // Format apoapsis
        if (orbit.apoapsis_altitude) {
            const apoapsis = orbit.apoapsis_altitude / 1000;
            this.orbitApoapsis.textContent = `${apoapsis.toFixed(1)} km`;
        } else {
            this.orbitApoapsis.textContent = '∞';
        }

        // Format inclination
        this.orbitInclination.textContent = `${orbit.inclination.toFixed(1)}°`;

        // Format period
        if (orbit.orbital_period) {
            const periodMin = orbit.orbital_period / 60;
            this.orbitPeriod.textContent = `${periodMin.toFixed(1)} min`;
        } else {
            this.orbitPeriod.textContent = '--';
        }

        // Show panel
        this.orbitPanel.classList.remove('hidden');
    }

    _reset() {
        // Reset display values
        this.timeEl.textContent = '00:00:00';
        this.altitudeEl.textContent = '0 m';
        this.velocityEl.textContent = '0 m/s';
        this.accelerationEl.textContent = '0 g';
        this.stageEl.textContent = '1';
        this.fuelBar.style.width = '100%';
        this.fuelBar.style.background = 'linear-gradient(90deg, #00d4ff, #00ff88)';
        this.dynamicPressureEl.textContent = '0 kPa';
        this.flightPathEl.textContent = '90.0°';

        // Clear event log
        this.eventLog.innerHTML = '';

        // Hide orbit panel
        this.orbitPanel.classList.add('hidden');
    }
}
