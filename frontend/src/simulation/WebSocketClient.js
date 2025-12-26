/**
 * WebSocket client for real-time simulation communication.
 */

import { WS_URL } from '../utils/constants.js';

export class SimulationClient {
    constructor(options = {}) {
        this.url = options.url || WS_URL;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;

        // Callbacks
        this.onState = options.onState || (() => {});
        this.onEvent = options.onEvent || (() => {});
        this.onComplete = options.onComplete || (() => {});
        this.onError = options.onError || (() => {});
        this.onConnect = options.onConnect || (() => {});
        this.onDisconnect = options.onDisconnect || (() => {});
        this.onInfo = options.onInfo || (() => {});
    }

    /**
     * Connect to the WebSocket server.
     *
     * @returns {Promise<void>}
     */
    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);

                this.ws.onopen = () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.onConnect();
                    resolve();
                };

                this.ws.onclose = () => {
                    this.isConnected = false;
                    this.onDisconnect();
                    this._attemptReconnect();
                };

                this.ws.onerror = (error) => {
                    this.onError({ message: 'WebSocket error', error });
                    reject(error);
                };

                this.ws.onmessage = (event) => {
                    this._handleMessage(event.data);
                };

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Disconnect from the server.
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }

    _attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.onError({ message: 'Max reconnection attempts reached' });
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

        setTimeout(() => {
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            this.connect().catch(() => {});
        }, delay);
    }

    _handleMessage(data) {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'state':
                    this.onState(message);
                    break;

                case 'event':
                    this.onEvent(message);
                    break;

                case 'complete':
                    this.onComplete(message);
                    break;

                case 'error':
                    this.onError(message);
                    break;

                case 'info':
                    this.onInfo(message);
                    break;

                default:
                    console.warn('Unknown message type:', message.type);
            }

        } catch (error) {
            console.error('Failed to parse message:', error);
        }
    }

    /**
     * Send a command to the server.
     *
     * @param {Object} command - Command object
     */
    send(command) {
        if (!this.isConnected) {
            console.warn('Not connected to server');
            return;
        }

        this.ws.send(JSON.stringify(command));
    }

    /**
     * Start a simulation.
     *
     * @param {Object} config - Simulation configuration
     */
    startSimulation(config) {
        this.send({
            action: 'start',
            rocket: config.rocket || 'falcon9',
            payload_mass: config.payloadMass,
            target_altitude: config.targetAltitude,
            target_inclination: config.targetInclination,
            time_acceleration: config.timeAcceleration || 1,
            custom_config: config.customConfig,
        });
    }

    /**
     * Pause the simulation.
     */
    pause() {
        this.send({ action: 'pause' });
    }

    /**
     * Resume the simulation.
     */
    resume() {
        this.send({ action: 'resume' });
    }

    /**
     * Stop the simulation.
     */
    stop() {
        this.send({ action: 'stop' });
    }

    /**
     * Set simulation speed.
     *
     * @param {number} speed - Speed multiplier
     */
    setSpeed(speed) {
        this.send({ action: 'set_speed', speed });
    }
}
