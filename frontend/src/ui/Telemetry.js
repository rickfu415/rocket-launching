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

        // New telemetry elements
        this.machEl = document.getElementById('tel-mach');
        this.twrEl = document.getElementById('tel-twr');
        this.totalMassEl = document.getElementById('tel-total-mass');
        this.stageFuelEl = document.getElementById('tel-stage-fuel');
        this.radialVelocityEl = document.getElementById('tel-radial-velocity');

        // 3D vector elements
        this.velocity3DEl = document.getElementById('tel-velocity-3d');
        this.acceleration3DEl = document.getElementById('tel-acceleration-3d');

        // Force elements
        this.forceThrustEl = document.getElementById('tel-force-thrust');
        this.forceGravityEl = document.getElementById('tel-force-gravity');
        this.forceDragEl = document.getElementById('tel-force-drag');
        this.forceTotalEl = document.getElementById('tel-force-total');

        // Event log
        this.eventLog = document.getElementById('event-log');

        // Orbit panel
        this.orbitPanel = document.getElementById('orbit-panel');
        this.orbitPeriapsis = document.getElementById('orbit-periapsis');
        this.orbitApoapsis = document.getElementById('orbit-apoapsis');
        this.orbitInclination = document.getElementById('orbit-inclination');
        this.orbitPeriod = document.getElementById('orbit-period');

        // Orbit status indicator
        this.orbitIndicator = document.getElementById('orbit-indicator');
        this.orbitStatusText = document.getElementById('orbit-status-text');
        this.previousAltitude = 0;
        this.isInOrbit = false;

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

        // Mach number
        if (this.machEl) {
            this.machEl.textContent = this.state.mach.toFixed(2);
        }

        // Thrust to weight ratio
        if (this.twrEl) {
            this.twrEl.textContent = this.state.twr.toFixed(2);
        }

        // Total mass (in tonnes)
        if (this.totalMassEl) {
            const massT = this.state.totalMass / 1000;
            this.totalMassEl.textContent = `${massT.toFixed(1)} t`;
        }

        // Stage fuel (used / total in tonnes)
        if (this.stageFuelEl) {
            const fuelUsedT = this.state.stageFuelUsed / 1000;
            const fuelTotalT = this.state.stageFuelTotal / 1000;
            const fuelRemainingT = fuelTotalT - fuelUsedT;
            this.stageFuelEl.textContent = `${fuelRemainingT.toFixed(1)} / ${fuelTotalT.toFixed(1)} t`;
        }

        // Radial (vertical) velocity
        if (this.radialVelocityEl) {
            const rv = this.state.radialVelocity;
            const sign = rv >= 0 ? '+' : '';
            this.radialVelocityEl.textContent = `${sign}${rv.toFixed(1)} m/s`;
            // Color based on ascending/descending
            if (rv > 10) {
                this.radialVelocityEl.style.color = '#00ff88';  // Ascending
            } else if (rv < -10) {
                this.radialVelocityEl.style.color = '#ff6666';  // Descending
            } else {
                this.radialVelocityEl.style.color = '#00d4ff';  // Near zero (orbit!)
            }
        }

        // 3D vectors
        if (this.velocity3DEl) {
            this.velocity3DEl.textContent = this.state.getFormattedVelocity3D();
        }
        if (this.acceleration3DEl) {
            this.acceleration3DEl.textContent = this.state.getFormattedAcceleration3D();
        }

        // Forces (show magnitudes for cleaner display)
        const forces = this.state.getForceMagnitudes();
        if (this.forceThrustEl) {
            this.forceThrustEl.textContent = `${forces.thrust.toFixed(1)} kN`;
        }
        if (this.forceGravityEl) {
            this.forceGravityEl.textContent = `${forces.gravity.toFixed(1)} kN`;
        }
        if (this.forceDragEl) {
            this.forceDragEl.textContent = `${forces.drag.toFixed(1)} kN`;
        }
        if (this.forceTotalEl) {
            this.forceTotalEl.textContent = `${forces.total.toFixed(1)} kN`;
        }

        // Update orbit status indicator
        this._updateOrbitStatus();
    }

    /**
     * Update the orbit status indicator based on current flight state.
     */
    _updateOrbitStatus() {
        if (!this.orbitIndicator || !this.orbitStatusText) return;

        const altitude = this.state.altitude;
        const velocity = this.state.velocity;
        const flightPathAngle = this.state.flightPathAngle;

        // Remove all status classes
        this.orbitIndicator.classList.remove('ascending', 'in-orbit', 'descending', 'landed', 'failed');

        // Karman line is at 100 km
        const KARMAN_LINE = 100000;
        // Orbital velocity at 400km is about 7.67 km/s
        const MIN_ORBITAL_VELOCITY = 7000;

        // Determine status
        let status = 'ascending';
        let statusText = 'Ascending';

        if (this.state.inOrbit) {
            // In orbit - show orbit count
            status = 'in-orbit';
            statusText = `Orbit ${this.state.orbitNumber}/5`;
            this.isInOrbit = true;
        } else if (altitude < 100) {
            // On the ground
            status = 'landed';
            statusText = 'On Ground';
        } else if (altitude >= KARMAN_LINE && velocity >= MIN_ORBITAL_VELOCITY && Math.abs(flightPathAngle) < 10) {
            // Check if in orbit: above Karman line, high velocity, near horizontal flight
            status = 'in-orbit';
            statusText = 'In Orbit';
            this.isInOrbit = true;
        } else if (altitude >= KARMAN_LINE) {
            // Above Karman line but not in stable orbit
            if (flightPathAngle < -5) {
                status = 'descending';
                statusText = 'Descending';
            } else {
                status = 'ascending';
                statusText = 'In Space';
            }
        } else if (altitude > this.previousAltitude) {
            status = 'ascending';
            statusText = 'Ascending';
        } else if (altitude < this.previousAltitude && altitude > 1000) {
            status = 'descending';
            statusText = 'Descending';
        }

        this.orbitIndicator.classList.add(status);
        this.orbitStatusText.textContent = statusText;
        this.previousAltitude = altitude;
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
            // Update orbit status to show mission complete
            if (this.orbitIndicator && this.orbitStatusText) {
                this.orbitIndicator.classList.remove('ascending', 'descending', 'landed', 'failed');
                this.orbitIndicator.classList.add('in-orbit');
                this.orbitStatusText.textContent = '5 Orbits Complete!';
                this.isInOrbit = true;
            }
        } else {
            // Mission failed
            if (this.orbitIndicator && this.orbitStatusText) {
                this.orbitIndicator.classList.remove('ascending', 'in-orbit', 'descending', 'landed');
                this.orbitIndicator.classList.add('failed');
                this.orbitStatusText.textContent = 'Mission Failed';
            }
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

        // Reset new telemetry fields
        if (this.machEl) {
            this.machEl.textContent = '0.0';
        }
        if (this.twrEl) {
            this.twrEl.textContent = '0.0';
        }
        if (this.totalMassEl) {
            this.totalMassEl.textContent = '0 t';
        }
        if (this.stageFuelEl) {
            this.stageFuelEl.textContent = '0 / 0 t';
        }

        // Reset 3D vectors
        if (this.velocity3DEl) {
            this.velocity3DEl.textContent = '(0, 0, 0) m/s';
        }
        if (this.acceleration3DEl) {
            this.acceleration3DEl.textContent = '(0, 0, 0) m/s²';
        }

        // Reset forces
        if (this.forceThrustEl) {
            this.forceThrustEl.textContent = '0 kN';
        }
        if (this.forceGravityEl) {
            this.forceGravityEl.textContent = '0 kN';
        }
        if (this.forceDragEl) {
            this.forceDragEl.textContent = '0 kN';
        }
        if (this.forceTotalEl) {
            this.forceTotalEl.textContent = '0 kN';
        }

        // Clear event log
        this.eventLog.innerHTML = '';

        // Hide orbit panel
        this.orbitPanel.classList.add('hidden');

        // Reset orbit status
        this.previousAltitude = 0;
        this.isInOrbit = false;
        if (this.orbitIndicator && this.orbitStatusText) {
            this.orbitIndicator.classList.remove('ascending', 'in-orbit', 'descending', 'failed');
            this.orbitIndicator.classList.add('landed');
            this.orbitStatusText.textContent = 'On Ground';
        }
    }
}
