/**
 * UI Controls for the rocket simulator.
 */

export class Controls {
    constructor(simulationState, simulationClient) {
        this.state = simulationState;
        this.client = simulationClient;

        // DOM elements
        this.rocketSelect = document.getElementById('rocket-select');
        this.payloadMass = document.getElementById('payload-mass');
        this.targetAltitude = document.getElementById('target-altitude');
        this.targetInclination = document.getElementById('target-inclination');
        this.timeScale = document.getElementById('time-scale');
        this.timeScaleValue = document.getElementById('time-scale-value');
        this.btnStart = document.getElementById('btn-start');
        this.btnPause = document.getElementById('btn-pause');
        this.btnStop = document.getElementById('btn-stop');
        this.statusText = document.getElementById('status-text');

        this._bindEvents();
        this._updateTimeScaleDisplay();
    }

    _bindEvents() {
        // Rocket selection
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

        // Time scale
        this.timeScale.addEventListener('input', () => {
            this.state.timeAcceleration = parseFloat(this.timeScale.value) || 1;
            this._updateTimeScaleDisplay();

            // Update server if running
            if (this.state.isRunning) {
                this.client.setSpeed(this.state.timeAcceleration);
            }
        });

        // Start button
        this.btnStart.addEventListener('click', () => this._onStart());

        // Pause button
        this.btnPause.addEventListener('click', () => this._onPause());

        // Stop button
        this.btnStop.addEventListener('click', () => this._onStop());
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
        this.timeScaleValue.textContent = `${this.state.timeAcceleration}x`;
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
        if (this.state.isPaused) {
            this.state.resume();
            this.client.resume();
            this.btnPause.textContent = 'Pause';
            this._setStatus('Running');
        } else {
            this.state.pause();
            this.client.pause();
            this.btnPause.textContent = 'Resume';
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
        this.rocketSelect.disabled = true;
        this.payloadMass.disabled = true;
        this.targetAltitude.disabled = true;
        this.targetInclination.disabled = true;

        this.btnStart.textContent = 'Launching...';
        this._setStatus('Launching');
    }

    _setReadyState() {
        this.btnStart.disabled = false;
        this.btnPause.disabled = true;
        this.btnStop.disabled = true;
        this.rocketSelect.disabled = false;
        this.payloadMass.disabled = false;
        this.targetAltitude.disabled = false;
        this.targetInclination.disabled = false;

        this.btnStart.textContent = 'Launch';
        this.btnPause.textContent = 'Pause';
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
}
