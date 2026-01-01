/**
 * UI Controls for the rocket simulator.
 */

export class Controls {
    constructor(simulationState, simulationClient) {
        this.state = simulationState;
        this.client = simulationClient;

        // DOM elements - hidden inputs for compatibility
        this.rocketSelect = document.getElementById('rocket-select');
        this.payloadMass = document.getElementById('payload-mass');
        this.targetAltitude = document.getElementById('target-altitude');
        this.targetInclination = document.getElementById('target-inclination');
        this.timeScale = document.getElementById('time-scale');
        this.timeScaleValue = document.getElementById('time-scale-value');

        // Action buttons
        this.btnStart = document.getElementById('btn-start');
        this.btnPause = document.getElementById('btn-pause');
        this.btnStop = document.getElementById('btn-stop');
        this.statusText = document.getElementById('status-text');

        // Action panel
        this.actionPanel = document.getElementById('action-panel');
        this.statusPanel = document.getElementById('status-panel');

        // Flight info panel elements
        this.flightRocket = document.getElementById('flight-rocket');
        this.flightPayload = document.getElementById('flight-payload');
        this.flightTarget = document.getElementById('flight-target');
        this.flightStage = document.getElementById('flight-stage');
        this.flightStatus = document.getElementById('flight-status');
        this.flightTwr = document.getElementById('flight-twr');
        this.flightMach = document.getElementById('flight-mach');
        this.flightMass = document.getElementById('flight-mass');
        this.flightFuel = document.getElementById('flight-fuel');
        this.flightFuelFill = document.getElementById('flight-fuel-fill');

        // Speed control buttons
        this.speedButtons = document.querySelectorAll('.speed-btn');

        // Rocket name mapping
        this.rocketNames = {
            'falcon9': 'Falcon 9',
            'saturn_v': 'Saturn V',
            'electron': 'Electron',
            'starship': 'Starship'
        };

        this._bindEvents();
        this._updateTimeScaleDisplay();
    }

    _bindEvents() {
        // Rocket selection (hidden, but still functional)
        this.rocketSelect.addEventListener('change', () => {
            this.state.rocketName = this.rocketSelect.value;
            this._updateDefaultPayload();
        });

        // Payload mass
        this.payloadMass.addEventListener('change', () => {
            this.state.payloadMass = parseFloat(this.payloadMass.value) || 0;
        });

        // Target altitude (convert km to m)
        this.targetAltitude.addEventListener('change', () => {
            this.state.targetAltitude = (parseFloat(this.targetAltitude.value) || 400) * 1000;
        });

        // Target inclination
        this.targetInclination.addEventListener('change', () => {
            this.state.targetInclination = parseFloat(this.targetInclination.value) || 28.5;
        });

        // Time scale (hidden range input)
        this.timeScale.addEventListener('input', () => {
            this.state.timeAcceleration = parseFloat(this.timeScale.value) || 1;
            this._updateTimeScaleDisplay();

            // Update server if running
            if (this.state.isRunning) {
                this.client.setSpeed(this.state.timeAcceleration);
            }
        });

        // Speed control buttons
        this.speedButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const speed = parseInt(btn.dataset.speed);
                this._setSpeed(speed);
            });
        });

        // Start button
        this.btnStart.addEventListener('click', () => this._onStart());

        // Pause button
        this.btnPause.addEventListener('click', () => this._onPause());

        // Stop button
        this.btnStop.addEventListener('click', () => this._onStop());

        // Subscribe to state changes to update flight info
        this.state.on('state', () => this._updateFlightInfo());
    }

    _setSpeed(speed) {
        this.state.timeAcceleration = speed;
        this.timeScale.value = speed;

        // Update button states
        this.speedButtons.forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.speed) === speed);
        });

        // Update server if running
        if (this.state.isRunning) {
            this.client.setSpeed(speed);
        }
    }

    _updateFlightInfo() {
        if (!this.state.isRunning) return;

        // Update stage
        if (this.flightStage) {
            this.flightStage.textContent = (this.state.stageIndex + 1).toString();
        }

        // Update status (burning/coast)
        if (this.flightStatus) {
            if (this.state.isBurning) {
                this.flightStatus.textContent = 'BURNING';
                this.flightStatus.className = 'value status-burning';
            } else {
                this.flightStatus.textContent = 'COAST';
                this.flightStatus.className = 'value status-coast';
            }
        }

        // Update TWR
        if (this.flightTwr) {
            this.flightTwr.textContent = this.state.twr.toFixed(2);
        }

        // Update Mach
        if (this.flightMach) {
            this.flightMach.textContent = this.state.mach.toFixed(1);
        }

        // Update mass
        if (this.flightMass) {
            const massT = this.state.totalMass / 1000;
            this.flightMass.textContent = `${massT.toFixed(1)} t`;
        }

        // Update stage fuel
        if (this.flightFuel) {
            const fuelRemainingT = (this.state.stageFuelTotal - this.state.stageFuelUsed) / 1000;
            this.flightFuel.textContent = `${fuelRemainingT.toFixed(1)} t`;
        }

        // Update fuel bar
        if (this.flightFuelFill) {
            const fuelPct = this.state.stageFuelTotal > 0
                ? ((this.state.stageFuelTotal - this.state.stageFuelUsed) / this.state.stageFuelTotal) * 100
                : 0;
            this.flightFuelFill.style.width = `${Math.max(0, Math.min(100, fuelPct))}%`;

            // Change color based on level
            if (fuelPct < 20) {
                this.flightFuelFill.style.background = 'linear-gradient(90deg, #ff4444, #ff6666)';
            } else if (fuelPct < 50) {
                this.flightFuelFill.style.background = 'linear-gradient(90deg, #ffaa00, #ffcc00)';
            } else {
                this.flightFuelFill.style.background = 'linear-gradient(90deg, #00d4ff, #00ff88)';
            }
        }
    }

    _updateDefaultPayload() {
        const defaults = {
            'falcon9': 15000,
            'saturn_v': 50000,
            'electron': 200,
            'starship': 100000,
        };

        const defaultPayload = defaults[this.state.rocketName] || 10000;
        this.payloadMass.value = defaultPayload;
        this.state.payloadMass = defaultPayload;
    }

    _updateTimeScaleDisplay() {
        if (this.timeScaleValue) {
            this.timeScaleValue.textContent = `${this.state.timeAcceleration}x`;
        }
    }

    /**
     * Set mission parameters from start menu config.
     */
    setMissionConfig(config) {
        this.rocketSelect.value = config.rocket;
        this.payloadMass.value = config.payloadMass;
        this.targetAltitude.value = config.targetAltitude / 1000; // Convert m to km
        this.targetInclination.value = config.targetInclination;

        // Set time acceleration
        this._setSpeed(config.timeAcceleration);

        // Update flight info panel with mission details
        if (this.flightRocket) {
            this.flightRocket.textContent = this.rocketNames[config.rocket] || config.rocket;
        }
        if (this.flightPayload) {
            this.flightPayload.textContent = `${config.payloadMass.toLocaleString()} kg`;
        }
        if (this.flightTarget) {
            this.flightTarget.textContent = `${(config.targetAltitude / 1000).toFixed(0)} km`;
        }
    }

    _onStart() {
        // Update state from inputs
        this.state.rocketName = this.rocketSelect.value;
        this.state.payloadMass = parseFloat(this.payloadMass.value) || 0;
        this.state.targetAltitude = (parseFloat(this.targetAltitude.value) || 400) * 1000;
        this.state.targetInclination = parseFloat(this.targetInclination.value) || 28.5;
        this.state.timeAcceleration = parseFloat(this.timeScale.value) || 1;

        // Reset state
        this.state.reset();
        this.state.start();

        // Start simulation
        this.client.startSimulation({
            rocket: this.state.rocketName,
            payloadMass: this.state.payloadMass,
            targetAltitude: this.state.targetAltitude,
            targetInclination: this.state.targetInclination,
            timeAcceleration: this.state.timeAcceleration,
        });

        // Update UI
        this._setRunningState();
    }

    _onPause() {
        const pauseText = this.btnPause.querySelector('.action-text');
        const pauseIcon = this.btnPause.querySelector('.action-icon');

        if (this.state.isPaused) {
            this.state.resume();
            this.client.resume();
            if (pauseText) pauseText.textContent = 'PAUSE';
            if (pauseIcon) pauseIcon.textContent = '⏸';
            this._setStatus('Running');
        } else {
            this.state.pause();
            this.client.pause();
            if (pauseText) pauseText.textContent = 'RESUME';
            if (pauseIcon) pauseIcon.textContent = '▶';
            this._setStatus('Paused');
        }
    }

    _onStop() {
        this.state.stop();
        this.client.stop();
        this._setReadyState();
    }

    _setRunningState() {
        this.btnStart.disabled = true;
        this.btnPause.disabled = false;
        this.btnStop.disabled = false;

        const startText = this.btnStart.querySelector('.action-text');
        if (startText) startText.textContent = 'LAUNCHED';

        this._setStatus('Launching');
    }

    _setReadyState() {
        this.btnStart.disabled = false;
        this.btnPause.disabled = true;
        this.btnStop.disabled = true;

        const startText = this.btnStart.querySelector('.action-text');
        const pauseText = this.btnPause.querySelector('.action-text');
        const pauseIcon = this.btnPause.querySelector('.action-icon');

        if (startText) startText.textContent = 'LAUNCH';
        if (pauseText) pauseText.textContent = 'PAUSE';
        if (pauseIcon) pauseIcon.textContent = '⏸';

        this._setStatus('Ready');
    }

    _setStatus(status) {
        this.statusText.textContent = status;

        // Color based on status
        if (status === 'Running' || status === 'Launching') {
            this.statusText.style.color = '#00d4ff';
        } else if (status === 'Paused') {
            this.statusText.style.color = '#ffaa00';
        } else if (status === 'Success') {
            this.statusText.style.color = '#00ff88';
        } else if (status === 'Failed') {
            this.statusText.style.color = '#ff4444';
        } else {
            this.statusText.style.color = '#00d4ff';
        }

        // Update flight status indicator
        if (this.flightStatus && (status === 'Success' || status === 'Failed')) {
            this.flightStatus.textContent = status.toUpperCase();
            this.flightStatus.className = status === 'Success' ? 'value status-complete' : 'value status-burning';
        }
    }

    /**
     * Handle simulation completion.
     */
    handleComplete(result) {
        this._setReadyState();

        if (result.success) {
            this._setStatus('Success');
        } else {
            this._setStatus('Failed');
        }
    }

    /**
     * Set status message.
     */
    setStatus(status) {
        this._setStatus(status);
    }

    /**
     * Show action panel.
     */
    showActionPanel() {
        if (this.actionPanel) {
            this.actionPanel.classList.remove('hidden');
        }
        if (this.statusPanel) {
            this.statusPanel.classList.remove('hidden');
        }
    }

    /**
     * Hide action panel.
     */
    hideActionPanel() {
        if (this.actionPanel) {
            this.actionPanel.classList.add('hidden');
        }
        if (this.statusPanel) {
            this.statusPanel.classList.add('hidden');
        }
    }
}
