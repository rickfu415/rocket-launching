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
        this._orbitShown = false;  // Track if we've shown orbit status

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
        // Only reset if explicitly starting a new simulation (not from menu)
        this.state.on('reset', () => {
            // Don't reset scene if we're just completing - only when starting fresh
            if (!this.state.isComplete) {
                this.scene.reset();
            }
        });

        // Subscribe to simulation complete - keep view, don't auto-return to menu
        this.state.on('complete', (result) => {
            // Keep the current view - user can manually return to menu
            // Don't auto-show menu anymore
        });

        // Setup panel folding
        this._setupPanelFolding();

        // Setup return to menu button
        this._setupMenuButton();
    }

    /**
     * Setup panel header click handlers for folding.
     */
    _setupPanelFolding() {
        const panelHeaders = document.querySelectorAll('.panel-header');
        panelHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const panel = header.closest('.panel');
                if (panel) {
                    panel.classList.toggle('collapsed');
                    const toggle = header.querySelector('.panel-toggle');
                    if (toggle) {
                        toggle.textContent = panel.classList.contains('collapsed') ? '+' : '-';
                    }
                }
            });
        });
    }

    /**
     * Setup return to menu button.
     */
    _setupMenuButton() {
        const menuBtn = document.getElementById('btn-menu');
        if (menuBtn) {
            menuBtn.addEventListener('click', () => {
                // Stop simulation if running
                if (this.state.isRunning) {
                    this.client.stopSimulation();
                    this.state.stop();
                }
                // Return to menu
                this._showMenu();
                // Reset scene
                this.scene.reset();
            });
        }
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
        this._orbitShown = false;  // Reset orbit status flag
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
        // Use the new setMissionConfig method to update all flight info
        this.controls.setMissionConfig(config);
    }

    /**
     * Show simulation UI panels.
     */
    _showSimulationUI() {
        document.getElementById('control-panel').classList.remove('hidden');
        document.getElementById('telemetry-panel').classList.remove('hidden');
        document.getElementById('event-panel').classList.remove('hidden');
        // Show action buttons panel
        this.controls.showActionPanel();
    }

    /**
     * Hide simulation UI and show menu.
     */
    _showMenu() {
        document.getElementById('control-panel').classList.add('hidden');
        document.getElementById('telemetry-panel').classList.add('hidden');
        document.getElementById('event-panel').classList.add('hidden');
        document.getElementById('orbit-panel').classList.add('hidden');
        // Hide action buttons panel
        this.controls.hideActionPanel();
        this.startMenu.show();
    }

    _onState(data) {
        // Ignore state updates after simulation completes
        // This keeps the scene frozen at the last position
        if (this.state.isComplete) {
            return;
        }

        // Update state
        this.state.updateFromServer(data);

        // Update 3D scene
        this.scene.updateRocket({
            position: data.position,
            velocity: data.velocity,
            altitude: data.altitude,
            is_burning: data.is_burning,
        });

        // If we just entered orbit, show orbit prediction and update UI
        if (data.in_orbit && !this._orbitShown) {
            this._orbitShown = true;
            this.controls.setStatus('In Orbit');
            // Request orbit info from any existing events
            const orbitEvent = this.state.events.find(e => e.event === 'orbit_insertion');
            if (orbitEvent) {
                console.log('Orbit insertion detected:', orbitEvent);
            }
        }
    }

    _onEvent(event) {
        console.log('Event:', event);
        this.state.addEvent(event);
    }

    _onComplete(result) {
        console.log('Simulation complete:', result);

        // FIRST: Mark simulation as complete to freeze the scene
        // This prevents any further updates from moving the rocket
        this.scene.setSimulationComplete();

        // Now handle state and UI updates
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
