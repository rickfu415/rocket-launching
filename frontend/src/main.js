/**
 * Main entry point for the Rocket Launch Simulator frontend.
 */

import { RocketScene } from './scene/Scene.js';
import { SimulationClient } from './simulation/WebSocketClient.js';
import { SimulationState } from './simulation/SimulationState.js';
import { Controls } from './ui/Controls.js';
import { Telemetry } from './ui/Telemetry.js';
import { StartMenu } from './ui/StartMenu.js';

class RocketSimulatorApp {
    constructor() {
        this.scene = null;
        this.client = null;
        this.state = null;
        this.controls = null;
        this.telemetry = null;
        this.startMenu = null;

        this._init();
    }

    async _init() {
        // Create simulation state
        this.state = new SimulationState();

        // Create 3D scene
        const container = document.getElementById('scene-container');
        this.scene = new RocketScene(container);
        this.scene.start();

        // Create WebSocket client
        this.client = new SimulationClient({
            onState: (data) => this._onState(data),
            onEvent: (event) => this._onEvent(event),
            onComplete: (result) => this._onComplete(result),
            onError: (error) => this._onError(error),
            onConnect: () => this._onConnect(),
            onDisconnect: () => this._onDisconnect(),
            onInfo: (info) => this._onInfo(info),
        });

        // Create Start Menu
        this.startMenu = new StartMenu((config) => this._onMenuLaunch(config));

        // Create UI controllers (hidden initially)
        this.controls = new Controls(this.state, this.client);
        this.telemetry = new Telemetry(this.state);

        // Connect to server
        try {
            await this.client.connect();
            console.log('Connected to simulation server');
        } catch (error) {
            console.error('Failed to connect:', error);
        }

        // Subscribe to state reset for scene reset
        this.state.on('reset', () => {
            this.scene.reset();
        });

        // Subscribe to simulation complete to show menu again
        this.state.on('complete', () => {
            // Show start menu after a delay
            setTimeout(() => {
                this._showMenu();
            }, 3000);
        });
    }

    /**
     * Handle launch from start menu.
     */
    _onMenuLaunch(config) {
        // Show UI panels
        this._showSimulationUI();

        // Update state with config
        this.state.rocketName = config.rocket;
        this.state.payloadMass = config.payloadMass;
        this.state.targetAltitude = config.targetAltitude;
        this.state.targetInclination = config.targetInclination;
        this.state.timeAcceleration = config.timeAcceleration;

        // Sync control panel values
        this._syncControlPanel(config);

        // Reset and start
        this.state.reset();
        this.scene.reset();
        this.state.start();

        // Start simulation via WebSocket
        this.client.startSimulation(config);

        // Update control panel state
        this.controls._setRunningState();
    }

    /**
     * Sync control panel inputs with menu config.
     */
    _syncControlPanel(config) {
        const rocketSelect = document.getElementById('rocket-select');
        const payloadMass = document.getElementById('payload-mass');
        const targetAltitude = document.getElementById('target-altitude');
        const targetInclination = document.getElementById('target-inclination');
        const timeScale = document.getElementById('time-scale');
        const timeScaleValue = document.getElementById('time-scale-value');

        if (rocketSelect) rocketSelect.value = config.rocket;
        if (payloadMass) payloadMass.value = config.payloadMass;
        if (targetAltitude) targetAltitude.value = config.targetAltitude / 1000;
        if (targetInclination) targetInclination.value = config.targetInclination;
        if (timeScale) timeScale.value = config.timeAcceleration;
        if (timeScaleValue) timeScaleValue.textContent = `${config.timeAcceleration}x`;
    }

    /**
     * Show simulation UI panels.
     */
    _showSimulationUI() {
        document.getElementById('control-panel').classList.remove('hidden');
        document.getElementById('telemetry-panel').classList.remove('hidden');
        document.getElementById('event-panel').classList.remove('hidden');
    }

    /**
     * Hide simulation UI and show menu.
     */
    _showMenu() {
        document.getElementById('control-panel').classList.add('hidden');
        document.getElementById('telemetry-panel').classList.add('hidden');
        document.getElementById('event-panel').classList.add('hidden');
        document.getElementById('orbit-panel').classList.add('hidden');
        this.startMenu.show();
    }

    _onState(data) {
        // Update state
        this.state.updateFromServer(data);

        // Update 3D scene
        this.scene.updateRocket({
            position: data.position,
            velocity: data.velocity,
            altitude: data.altitude,
            is_burning: data.is_burning,
        });
    }

    _onEvent(event) {
        console.log('Event:', event);
        this.state.addEvent(event);
    }

    _onComplete(result) {
        console.log('Simulation complete:', result);
        this.state.handleComplete(result);
        this.controls.handleComplete(result);

        // Show orbit prediction if successful
        if (result.success && result.orbit) {
            this.scene.updateOrbit(result.orbit);
        }
    }

    _onError(error) {
        console.error('Simulation error:', error);
        this.controls.setStatus('Error');
    }

    _onConnect() {
        console.log('Connected to server');
        this.controls.setStatus('Ready');
    }

    _onDisconnect() {
        console.log('Disconnected from server');
        this.controls.setStatus('Disconnected');
    }

    _onInfo(info) {
        console.log('Server info:', info);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new RocketSimulatorApp();
});
