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

        // Rocket specs elements
        this.specsPanel = document.getElementById('rocket-specs');
        this.specsRocketName = document.getElementById('specs-rocket-name');

        // Selected rocket
        this.selectedRocket = 'falcon9';

        // Default payloads for each rocket
        this.defaultPayloads = {
            'falcon9': 15000,
            'saturn_v': 50000,
            'electron': 200,
            'starship': 100000,
        };

        // Rocket specifications database
        this.rocketSpecs = {
            'falcon9': {
                name: 'Falcon 9 Block 5',
                stages: [
                    { dryMass: 25.6, propellant: 411.0, thrustSL: 7.61, thrustVac: 8.23, ispSL: 282, ispVac: 311, engines: 9, burnTime: 162 },
                    { dryMass: 4.0, propellant: 107.5, thrustVac: 0.98, ispVac: 348, engines: 1, burnTime: 397 }
                ],
                totalMass: 565,
                deltaV: '~9.4'
            },
            'saturn_v': {
                name: 'Saturn V',
                stages: [
                    { dryMass: 131.0, propellant: 2160.0, thrustSL: 33.85, thrustVac: 38.70, ispSL: 263, ispVac: 304, engines: 5, burnTime: 168 },
                    { dryMass: 40.1, propellant: 456.1, thrustVac: 5.14, ispVac: 421, engines: 5, burnTime: 367 }
                ],
                totalMass: 2970,
                deltaV: '~15.0'
            },
            'electron': {
                name: 'Electron',
                stages: [
                    { dryMass: 0.95, propellant: 9.25, thrustSL: 0.162, thrustVac: 0.192, ispSL: 303, ispVac: 343, engines: 9, burnTime: 155 },
                    { dryMass: 0.25, propellant: 2.05, thrustVac: 0.026, ispVac: 343, engines: 1, burnTime: 256 }
                ],
                totalMass: 12.5,
                deltaV: '~9.0'
            },
            'starship': {
                name: 'Starship + Super Heavy',
                stages: [
                    { dryMass: 200.0, propellant: 3400.0, thrustSL: 74.4, thrustVac: 82.0, ispSL: 330, ispVac: 350, engines: 33, burnTime: 180 },
                    { dryMass: 100.0, propellant: 1200.0, thrustVac: 14.7, ispVac: 380, engines: 6, burnTime: 360 }
                ],
                totalMass: 5000,
                deltaV: '~10.5'
            }
        };

        this._bindEvents();
        this._updateRocketSpecs('falcon9');
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

        // Update rocket specifications display
        this._updateRocketSpecs(this.selectedRocket);
    }

    _updateRocketSpecs(rocketId) {
        const specs = this.rocketSpecs[rocketId];
        if (!specs) return;

        // Update rocket name
        if (this.specsRocketName) {
            this.specsRocketName.textContent = specs.name;
        }

        // Helper to format numbers
        const fmt = (val, decimals = 1) => {
            if (val === undefined || val === null) return '--';
            return val.toFixed ? val.toFixed(decimals) : val;
        };

        // Stage 1 specs
        const s1 = specs.stages[0];
        this._setSpec('s1-dry-mass', `${fmt(s1.dryMass)} t`);
        this._setSpec('s1-propellant', `${fmt(s1.propellant)} t`);
        this._setSpec('s1-thrust-sl', s1.thrustSL ? `${fmt(s1.thrustSL, 2)} MN` : '--');
        this._setSpec('s1-thrust-vac', `${fmt(s1.thrustVac, 2)} MN`);
        this._setSpec('s1-isp', s1.ispSL ? `${s1.ispSL}/${s1.ispVac} s` : `${s1.ispVac} s`);
        this._setSpec('s1-engines', s1.engines);
        this._setSpec('s1-burn-time', `${s1.burnTime} s`);

        // Stage 2 specs
        const s2 = specs.stages[1];
        this._setSpec('s2-dry-mass', `${fmt(s2.dryMass)} t`);
        this._setSpec('s2-propellant', `${fmt(s2.propellant)} t`);
        this._setSpec('s2-thrust-vac', `${fmt(s2.thrustVac, 2)} MN`);
        this._setSpec('s2-isp', `${s2.ispVac} s`);
        this._setSpec('s2-engines', s2.engines);
        this._setSpec('s2-burn-time', `${s2.burnTime} s`);

        // Totals
        this._setSpec('total-mass', `${fmt(specs.totalMass, 0)} t`);
        this._setSpec('total-dv', `${specs.deltaV} km/s`);
    }

    _setSpec(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
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
