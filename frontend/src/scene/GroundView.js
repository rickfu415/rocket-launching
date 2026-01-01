/**
 * Ground view visualization for low altitude (< 20 km).
 * Shows a ground plane with the rocket as an arrow indicator.
 */

import * as THREE from 'three';

// Altitude threshold for ground view (50 km)
export const GROUND_VIEW_THRESHOLD = 50000;

export class GroundView {
    constructor() {
        this.group = new THREE.Group();
        this.visible = false;

        // Track trajectory points
        this.trajectoryPoints = [];

        this._createGround();
        this._createRocketArrow();
        this._createAltitudeMarkers();
        this._createGridLines();
        this._createTrajectoryLine();

        this.group.visible = false;
    }

    _createGround() {
        // Ground plane
        const groundGeometry = new THREE.PlaneGeometry(200, 200);
        const groundMaterial = new THREE.MeshPhongMaterial({
            color: 0x2d5a27,  // Dark green
            side: THREE.DoubleSide,
        });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = 0;
        this.group.add(this.ground);

        // Launch pad
        const padGeometry = new THREE.CircleGeometry(2, 32);
        const padMaterial = new THREE.MeshPhongMaterial({
            color: 0x555555,
            side: THREE.DoubleSide,
        });
        this.launchPad = new THREE.Mesh(padGeometry, padMaterial);
        this.launchPad.rotation.x = -Math.PI / 2;
        this.launchPad.position.y = 0.01;
        this.group.add(this.launchPad);
    }

    _createRocketArrow() {
        // Rocket represented as an arrow pointing up
        // Cone for the arrow head
        const coneGeometry = new THREE.ConeGeometry(0.8, 2, 16);
        const coneMaterial = new THREE.MeshPhongMaterial({
            color: 0xff6600,
            emissive: 0xff3300,
            emissiveIntensity: 0.3,
            depthTest: true,
            depthWrite: true,
        });
        this.arrowHead = new THREE.Mesh(coneGeometry, coneMaterial);
        this.arrowHead.renderOrder = 100;

        // Cylinder for the arrow body
        const cylinderGeometry = new THREE.CylinderGeometry(0.4, 0.4, 4, 16);
        const cylinderMaterial = new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            depthTest: true,
            depthWrite: true,
        });
        this.arrowBody = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
        this.arrowBody.position.y = -3;
        this.arrowBody.renderOrder = 100;

        // Group for the arrow
        this.rocket = new THREE.Group();
        this.rocket.add(this.arrowHead);
        this.rocket.add(this.arrowBody);
        this.rocket.position.y = 5;  // Start above ground
        this.rocket.renderOrder = 100;
        this.group.add(this.rocket);

        // Exhaust flame (when burning)
        const flameGeometry = new THREE.ConeGeometry(0.6, 3, 16);
        const flameMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.8,
        });
        this.flame = new THREE.Mesh(flameGeometry, flameMaterial);
        this.flame.rotation.x = Math.PI;  // Point downward
        this.flame.position.y = -6;
        this.flame.renderOrder = 99;
        this.rocket.add(this.flame);
    }

    _createTrajectoryLine() {
        // Yellow trajectory line that tracks rocket path
        const trajectoryMaterial = new THREE.LineBasicMaterial({
            color: 0xffff00,  // Yellow
            linewidth: 2,
            depthTest: true,
            depthWrite: true,
        });

        // Start with a simple geometry (will be updated dynamically)
        const trajectoryGeometry = new THREE.BufferGeometry();
        // Pre-allocate space for trajectory points
        const maxPoints = 10000;
        const positions = new Float32Array(maxPoints * 3);
        trajectoryGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        trajectoryGeometry.setDrawRange(0, 0);

        this.trajectoryLine = new THREE.Line(trajectoryGeometry, trajectoryMaterial);
        this.trajectoryLine.renderOrder = 50;
        this.trajectoryLine.frustumCulled = false;
        this.group.add(this.trajectoryLine);
    }

    _createAltitudeMarkers() {
        // Altitude markers every 10 km (for 50 km range)
        this.altitudeMarkers = new THREE.Group();

        for (let alt = 10; alt <= 50; alt += 10) {
            // Horizontal ring at each 10 km altitude
            const ringGeometry = new THREE.RingGeometry(18, 20, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: 0x4488aa,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.15,
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = alt * 10;  // Scale: 10 units = 1 km
            this.altitudeMarkers.add(ring);
        }

        this.group.add(this.altitudeMarkers);
    }

    _createGridLines() {
        // Grid on the ground
        const gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x333333);
        gridHelper.position.y = 0.02;
        this.group.add(gridHelper);
    }

    /**
     * Update the ground view based on simulation state.
     * @param {Object} state - Simulation state with altitude and isBurning
     * @returns {number} - The rocket Y position in scene units (for camera tracking)
     */
    update(state) {
        if (!state) return 2;

        const altitude = state.altitude || 0;
        const isBurning = state.isBurning || state.is_burning || false;

        // Scale: 10 scene units = 1 km real altitude
        const scaleFactor = 10 / 1000;  // 10 units per km
        const rocketY = Math.max(2, altitude * scaleFactor);  // Minimum 2 units above ground

        // Update rocket position
        this.rocket.position.y = rocketY;

        // Add point to trajectory line
        this._addTrajectoryPoint(0, rocketY, 0);

        // Update flame visibility
        this.flame.visible = isBurning;
        if (isBurning) {
            // Animate flame
            const time = Date.now() * 0.005;
            this.flame.scale.y = 0.8 + Math.sin(time) * 0.2;
            this.flame.material.opacity = 0.6 + Math.sin(time * 2) * 0.2;
        }

        // Scale rocket based on altitude for better visibility at higher altitudes
        const rocketScale = 1 + (altitude / GROUND_VIEW_THRESHOLD) * 0.5;
        this.rocket.scale.set(rocketScale, rocketScale, rocketScale);

        return rocketY;
    }

    /**
     * Add a point to the trajectory line.
     */
    _addTrajectoryPoint(x, y, z) {
        // Only add if there's meaningful distance from last point (avoid duplicates)
        if (this.trajectoryPoints.length > 0) {
            const last = this.trajectoryPoints[this.trajectoryPoints.length - 1];
            const dist = Math.sqrt(
                Math.pow(x - last.x, 2) +
                Math.pow(y - last.y, 2) +
                Math.pow(z - last.z, 2)
            );
            if (dist < 0.5) return;  // Skip if too close to last point
        }

        this.trajectoryPoints.push({ x, y, z });

        // Update the line geometry
        const positions = this.trajectoryLine.geometry.attributes.position.array;
        const index = (this.trajectoryPoints.length - 1) * 3;

        if (index < positions.length - 2) {
            positions[index] = x;
            positions[index + 1] = y;
            positions[index + 2] = z;

            this.trajectoryLine.geometry.attributes.position.needsUpdate = true;
            this.trajectoryLine.geometry.setDrawRange(0, this.trajectoryPoints.length);
        }
    }

    /**
     * Get current rocket Y position.
     */
    getRocketY() {
        return this.rocket.position.y;
    }

    /**
     * Show the ground view.
     */
    show() {
        this.visible = true;
        this.group.visible = true;
    }

    /**
     * Hide the ground view.
     */
    hide() {
        this.visible = false;
        this.group.visible = false;
    }

    /**
     * Check if ground view should be active based on altitude.
     * @param {number} altitude - Current altitude in meters
     * @returns {boolean}
     */
    shouldBeActive(altitude) {
        return altitude < GROUND_VIEW_THRESHOLD;
    }

    /**
     * Get the Three.js group object.
     */
    getObject() {
        return this.group;
    }

    /**
     * Reset the ground view to initial state.
     */
    reset() {
        this.rocket.position.y = 2;
        this.rocket.scale.set(1, 1, 1);
        this.flame.visible = false;

        // Clear trajectory
        this.trajectoryPoints = [];
        this.trajectoryLine.geometry.setDrawRange(0, 0);

        this.hide();
    }
}
