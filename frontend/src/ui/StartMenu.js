/**
 * Starting menu for the rocket simulator.
 *
 * Handles rocket selection, mission parameters, and launching.
 */

export class StartMenu {
    constructor(onLaunch) {
        this.onLaunch = onLaunch;

        // DOM elements
        this.menu = document.getElementById('start-menu');
        this.rocketCards = document.getElementById('rocket-cards');
        this.payloadInput = document.getElementById('menu-payload');
        this.altitudeInput = document.getElementById('menu-altitude');
        this.inclinationInput = document.getElementById('menu-inclination');
        this.timeScaleSelect = document.getElementById('menu-time-scale');
        this.launchButton = document.getElementById('btn-launch-menu');

        // Selected rocket
        this.selectedRocket = 'falcon9';

        // Default payloads for each rocket
        this.defaultPayloads = {
            'falcon9': 15000,
            'saturn_v': 50000,
            'electron': 200,
            'starship': 100000,
        };

        this._bindEvents();
    }

    _bindEvents() {
        // Rocket card selection
        const cards = this.rocketCards.querySelectorAll('.rocket-card');
        cards.forEach(card => {
            card.addEventListener('click', () => this._selectRocket(card));
        });

        // Launch button
        this.launchButton.addEventListener('click', () => this._handleLaunch());

        // Enter key to launch
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !this.menu.classList.contains('hidden')) {
                this._handleLaunch();
            }
        });
    }

    _selectRocket(card) {
        // Remove selection from all cards
        const cards = this.rocketCards.querySelectorAll('.rocket-card');
        cards.forEach(c => c.classList.remove('selected'));

        // Select this card
        card.classList.add('selected');
        this.selectedRocket = card.dataset.rocket;

        // Update default payload
        const defaultPayload = this.defaultPayloads[this.selectedRocket] || 10000;
        this.payloadInput.value = defaultPayload;
    }

    _handleLaunch() {
        const config = {
            rocket: this.selectedRocket,
            payloadMass: parseFloat(this.payloadInput.value) || 15000,
            targetAltitude: (parseFloat(this.altitudeInput.value) || 400) * 1000, // Convert km to m
            targetInclination: parseFloat(this.inclinationInput.value) || 28.5,
            timeAcceleration: parseFloat(this.timeScaleSelect.value) || 5,
        };

        // Hide menu
        this.hide();

        // Call the launch callback
        if (this.onLaunch) {
            this.onLaunch(config);
        }
    }

    /**
     * Show the start menu.
     */
    show() {
        this.menu.classList.remove('hidden');
    }

    /**
     * Hide the start menu.
     */
    hide() {
        this.menu.classList.add('hidden');
    }

    /**
     * Check if menu is visible.
     */
    isVisible() {
        return !this.menu.classList.contains('hidden');
    }

    /**
     * Get current configuration.
     */
    getConfig() {
        return {
            rocket: this.selectedRocket,
            payloadMass: parseFloat(this.payloadInput.value) || 15000,
            targetAltitude: (parseFloat(this.altitudeInput.value) || 400) * 1000,
            targetInclination: parseFloat(this.inclinationInput.value) || 28.5,
            timeAcceleration: parseFloat(this.timeScaleSelect.value) || 5,
        };
    }
}
