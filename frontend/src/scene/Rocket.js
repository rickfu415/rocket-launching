/**
 * Rocket marker for Three.js scene.
 *
 * Represents the rocket as a simple 3D marker with exhaust trail.
 * Size adjusts dynamically based on camera distance.
 */

import * as THREE from 'three';
import { eciToScene } from '../utils/coordinates.js';
import { COLORS } from '../utils/constants.js';

export class Rocket {
    constructor() {
        this.group = new THREE.Group();
        this.mesh = null;
        this.exhaust = null;
        this.light = null;

        // Base sizes for scaling
        this.baseRocketRadius = 0.008;
        this.baseRocketHeight = 0.03;
        this.baseExhaustRadius = 0.006;
        this.baseExhaustHeight = 0.04;

        this._createRocket();
        this._createExhaust();
        this._createLight();

        // Initial state
        this.visible = false;
        this.group.visible = false;
    }

    _createRocket() {
        // Simple cone shape for rocket
        const geometry = new THREE.ConeGeometry(0.008, 0.03, 8);
        const material = new THREE.MeshPhongMaterial({
            color: COLORS.rocket,
            emissive: 0xff2200,
            emissiveIntensity: 0.3,
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.group.add(this.mesh);
    }

    _createExhaust() {
        // Exhaust flame effect
        const exhaustGeometry = new THREE.ConeGeometry(0.006, 0.04, 8);
        const exhaustMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.8,
        });

        this.exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
        this.exhaust.rotation.x = Math.PI; // Point backwards
        this.exhaust.position.y = -0.025;
        this.group.add(this.exhaust);
    }

    _createLight() {
        // Point light to illuminate surroundings
        this.light = new THREE.PointLight(0xff6600, 0.5, 0.5);
        this.light.position.set(0, -0.02, 0);
        this.group.add(this.light);
    }

    /**
     * Update rocket position and orientation from simulation state.
     *
     * @param {Object} state - Simulation state with position and velocity
     */
    update(state) {
        if (!state || !state.position) return;

        // Update position
        const scenePos = eciToScene(state.position);
        this.group.position.copy(scenePos);

        // Orient rocket along velocity vector
        if (state.velocity) {
            const velocity = new THREE.Vector3(
                state.velocity[0],
                state.velocity[2], // ECI Z -> Scene Y
                state.velocity[1]  // ECI Y -> Scene Z
            );

            if (velocity.length() > 10) {
                velocity.normalize();
                // Point rocket in direction of travel
                const up = new THREE.Vector3(0, 1, 0);
                const quaternion = new THREE.Quaternion();
                quaternion.setFromUnitVectors(up, velocity);
                this.mesh.quaternion.copy(quaternion);
            }
        }

        // Update exhaust visibility based on burning state
        if (state.is_burning !== undefined) {
            this.exhaust.visible = state.is_burning;
            this.light.visible = state.is_burning;

            // Vary exhaust size slightly for visual effect
            if (state.is_burning) {
                const scale = 0.8 + Math.random() * 0.4;
                this.exhaust.scale.set(scale, scale, scale);
                this.light.intensity = 0.3 + Math.random() * 0.4;
            }
        }

        // Make visible
        if (!this.visible) {
            this.visible = true;
            this.group.visible = true;
        }
    }

    /**
     * Update rocket scale based on camera distance.
     * Maintains roughly constant screen size regardless of zoom level.
     *
     * @param {THREE.Camera} camera - The camera to calculate distance from
     */
    updateScale(camera) {
        if (!this.visible || !camera) return;

        // Calculate distance from camera to rocket
        const distance = camera.position.distanceTo(this.group.position);

        // Scale proportionally to distance to maintain constant screen size
        // At distance 1.0, scale = 1.0 (base size)
        // At distance 0.1 (close), scale = 0.1 (smaller in world, same on screen)
        // At distance 10 (far), scale = 10 (larger in world, same on screen)
        const baseDistance = 2.0;  // Reference distance where scale = 1
        const minScale = 0.1;
        const maxScale = 10.0;

        let scaleFactor = distance / baseDistance;
        scaleFactor = Math.max(minScale, Math.min(maxScale, scaleFactor));

        // Apply scale to mesh and exhaust
        this.mesh.scale.setScalar(scaleFactor);
        this.exhaust.scale.setScalar(scaleFactor);

        // Adjust exhaust position based on scale
        this.exhaust.position.y = -0.025 * scaleFactor;
    }

    /**
     * Reset rocket to invisible state.
     */
    reset() {
        this.visible = false;
        this.group.visible = false;
        this.group.position.set(0, 0, 0);
        this.mesh.scale.setScalar(1);
        this.exhaust.scale.setScalar(1);
    }

    /**
     * Get the Three.js group.
     */
    getObject() {
        return this.group;
    }
}
