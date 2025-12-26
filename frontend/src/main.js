/**
 * Main entry point for the Rocket Launch Simulator frontend.
 */

import { RocketScene } from './scene/Scene.js';
import { SimulationClient } from './simulation/WebSocketClient.js';
import { SimulationState } from './simulation/SimulationState.js';
import { Controls } from './ui/Controls.js';
import { Telemetry } from './ui/Telemetry.js';

class RocketSimulatorApp {
    constructor() {
        this.scene = null;
        this.client = null;
        this.state = null;
        this.controls = null;
        this.telemetry = null;

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

        // Create UI controllers
        this.controls = new Controls(this.state, this.client);
        this.telemetry = new Telemetry(this.state);

        // Connect to server
        try {
            await this.client.connect();
            console.log('Connected to simulation server');
        } catch (error) {
            console.error('Failed to connect:', error);
            this.controls.setStatus('Disconnected');
        }

        // Subscribe to state reset for scene reset
        this.state.on('reset', () => {
            this.scene.reset();
        });
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
