/**
 * Trajectory visualization for Three.js scene.
 *
 * Renders the rocket's path as a colored line.
 */

import * as THREE from 'three';
import { eciToScene, altitudeToColor } from '../utils/coordinates.js';
import { TRAJECTORY_MAX_POINTS } from '../utils/constants.js';

export class Trajectory {
    constructor() {
        this.points = [];
        this.colors = [];
        this.line = null;
        this.group = new THREE.Group();

        this._initLine();
    }

    _initLine() {
        // Create initial geometry with max capacity
        const geometry = new THREE.BufferGeometry();

        // Pre-allocate buffers
        const positions = new Float32Array(TRAJECTORY_MAX_POINTS * 3);
        const colors = new Float32Array(TRAJECTORY_MAX_POINTS * 3);

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setDrawRange(0, 0);

        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            linewidth: 2,
        });

        this.line = new THREE.Line(geometry, material);
        this.group.add(this.line);
    }

    /**
     * Add a point to the trajectory.
     *
     * @param {number[]} position - ECI position [x, y, z]
     * @param {number} altitude - Altitude in meters (for coloring)
     */
    addPoint(position, altitude) {
        if (this.points.length >= TRAJECTORY_MAX_POINTS) {
            // Remove oldest points if at capacity
            this.points.shift();
            this.colors.shift();
        }

        const scenePos = eciToScene(position);
        const color = altitudeToColor(altitude);

        this.points.push(scenePos);
        this.colors.push(color);

        this._updateGeometry();
    }

    _updateGeometry() {
        const geometry = this.line.geometry;
        const positionAttr = geometry.getAttribute('position');
        const colorAttr = geometry.getAttribute('color');

        for (let i = 0; i < this.points.length; i++) {
            const point = this.points[i];
            const color = this.colors[i];

            positionAttr.setXYZ(i, point.x, point.y, point.z);
            colorAttr.setXYZ(i, color.r, color.g, color.b);
        }

        positionAttr.needsUpdate = true;
        colorAttr.needsUpdate = true;
        geometry.setDrawRange(0, this.points.length);
    }

    /**
     * Clear the trajectory.
     */
    clear() {
        this.points = [];
        this.colors = [];

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
