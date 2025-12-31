/**
 * Trajectory visualization for Three.js scene.
 *
 * Renders the rocket's path as a yellow line.
 * The trajectory is static - it shows the complete path from launch.
 */

import * as THREE from 'three';
import { eciToScene } from '../utils/coordinates.js';

// Large capacity to hold entire flight trajectory without shifting
const TRAJECTORY_MAX_POINTS = 50000;

// Minimum distance between points to avoid clutter (in scene units)
const MIN_POINT_DISTANCE = 0.0001;

export class Trajectory {
    constructor() {
        this.points = [];
        this.line = null;
        this.group = new THREE.Group();
        this.lastPoint = null;

        this._initLine();
    }

    _initLine() {
        // Create initial geometry with max capacity
        const geometry = new THREE.BufferGeometry();

        // Pre-allocate buffers for entire trajectory
        const positions = new Float32Array(TRAJECTORY_MAX_POINTS * 3);

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0);

        const material = new THREE.LineBasicMaterial({
            color: 0xffff00,  // Yellow
            linewidth: 2,
        });

        this.line = new THREE.Line(geometry, material);
        this.line.frustumCulled = false;  // Always render
        this.group.add(this.line);
    }

    /**
     * Add a point to the trajectory.
     * Points are kept permanently - the trajectory shows the complete path from launch.
     *
     * @param {number[]} position - ECI position [x, y, z]
     * @param {number} altitude - Altitude in meters (unused, kept for API compatibility)
     */
    addPoint(position, altitude) {
        // Don't add if at capacity (trajectory is complete)
        if (this.points.length >= TRAJECTORY_MAX_POINTS) {
            return;
        }

        const scenePos = eciToScene(position);

        // Skip if too close to last point (avoid clutter)
        if (this.lastPoint) {
            const dist = scenePos.distanceTo(this.lastPoint);
            if (dist < MIN_POINT_DISTANCE) {
                return;
            }
        }

        // Store this point
        this.lastPoint = scenePos.clone();

        // Add point to array and update geometry directly (more efficient)
        const index = this.points.length;
        this.points.push(scenePos);

        const positionAttr = this.line.geometry.getAttribute('position');
        positionAttr.setXYZ(index, scenePos.x, scenePos.y, scenePos.z);
        positionAttr.needsUpdate = true;
        this.line.geometry.setDrawRange(0, this.points.length);
    }

    /**
     * Clear the trajectory.
     */
    clear() {
        this.points = [];
        this.lastPoint = null;

        const geometry = this.line.geometry;
        geometry.setDrawRange(0, 0);
    }

    /**
     * Get the number of points in the trajectory.
     */
    get length() {
        return this.points.length;
    }

    /**
     * Get the Three.js group.
     */
    getObject() {
        return this.group;
    }
}


/**
 * Orbit prediction line.
 *
 * Shows the predicted orbital path based on current state.
 */
export class OrbitPrediction {
    constructor() {
        this.line = null;
        this.group = new THREE.Group();
        this.visible = false;

        this._initLine();
    }

    _initLine() {
        // Create initial geometry with a dummy point (required for dashed lines)
        const initialPoints = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(initialPoints);

        const material = new THREE.LineDashedMaterial({
            color: 0xffff00,
            dashSize: 0.02,
            gapSize: 0.01,
            transparent: true,
            opacity: 0.6,
        });

        this.line = new THREE.Line(geometry, material);
        this.line.computeLineDistances();
        this.group.add(this.line);

        // Hide initially
        this.group.visible = false;
    }

    /**
     * Update the orbit prediction based on orbital elements.
     *
     * @param {Object} orbit - Orbital elements
     */
    update(orbit) {
        if (!orbit || orbit.eccentricity >= 1) {
            this.group.visible = false;
            return;
        }

        const { semi_major_axis, eccentricity, inclination, raan, argument_of_periapsis } = orbit;

        // Convert to scene scale
        const a = semi_major_axis / 6371000; // Scale to Earth radii
        const e = eccentricity;
        const i = inclination * Math.PI / 180;
        const omega = raan * Math.PI / 180;
        const w = argument_of_periapsis * Math.PI / 180;

        // Generate orbit points
        const points = [];
        const numPoints = 100;

        for (let j = 0; j <= numPoints; j++) {
            const theta = (j / numPoints) * 2 * Math.PI;

            // Radius at this true anomaly
            const r = a * (1 - e * e) / (1 + e * Math.cos(theta));

            // Position in orbital plane
            let x = r * Math.cos(theta);
            let y = r * Math.sin(theta);
            let z = 0;

            // Rotate by argument of periapsis
            const x1 = x * Math.cos(w) - y * Math.sin(w);
            const y1 = x * Math.sin(w) + y * Math.cos(w);

            // Rotate by inclination
            const y2 = y1 * Math.cos(i);
            const z2 = y1 * Math.sin(i);

            // Rotate by RAAN
            const x3 = x1 * Math.cos(omega) - y2 * Math.sin(omega);
            const y3 = x1 * Math.sin(omega) + y2 * Math.cos(omega);

            // Note: Three.js Y is up, need to swap
            points.push(new THREE.Vector3(x3, z2, y3));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.line.geometry.dispose();
        this.line.geometry = geometry;
        this.line.computeLineDistances();

        this.group.visible = true;
    }

    /**
     * Hide the orbit prediction.
     */
    hide() {
        this.group.visible = false;
    }

    /**
     * Get the Three.js group.
     */
    getObject() {
        return this.group;
    }
}
