/**
 * Camera controller for the 3D scene.
 *
 * Provides orbit controls and camera follow modes.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    CAMERA_INITIAL_DISTANCE,
    CAMERA_MIN_DISTANCE,
    CAMERA_MAX_DISTANCE,
} from '../utils/constants.js';

export class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.controls = new OrbitControls(camera, domElement);

        this._setupControls();

        // Camera modes
        this.mode = 'orbit'; // 'orbit', 'follow', 'earth'
        this.followTarget = null;
        this.followOffset = new THREE.Vector3(0, 0.5, 1);
    }

    _setupControls() {
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;

        // Distance limits
        this.controls.minDistance = CAMERA_MIN_DISTANCE;
        this.controls.maxDistance = CAMERA_MAX_DISTANCE;

        // Rotation limits (optional)
        // this.controls.maxPolarAngle = Math.PI * 0.9;

        // Initial position
        this.camera.position.set(
            CAMERA_INITIAL_DISTANCE,
            CAMERA_INITIAL_DISTANCE * 0.5,
            CAMERA_INITIAL_DISTANCE
        );
        this.controls.update();
    }

    /**
     * Update camera each frame.
     */
    update() {
        if (this.mode === 'follow' && this.followTarget) {
            // Calculate camera position relative to target
            const targetPos = this.followTarget.position.clone();
            const offset = this.followOffset.clone();

            // Get direction from Earth center to target
            const dir = targetPos.clone().normalize();

            // Position camera above and behind target
            const cameraPos = targetPos.clone();
            cameraPos.add(dir.multiplyScalar(this.followOffset.y));
            cameraPos.add(new THREE.Vector3(this.followOffset.x, 0, this.followOffset.z));

            // Smoothly move camera
            this.camera.position.lerp(cameraPos, 0.1);
            this.controls.target.lerp(targetPos, 0.1);
        }

        this.controls.update();
    }

    /**
     * Set camera to orbit mode (free rotation around Earth).
     */
    setOrbitMode() {
        this.mode = 'orbit';
        this.followTarget = null;
        this.controls.target.set(0, 0, 0);
    }

    /**
     * Set camera to follow a target object.
     *
     * @param {THREE.Object3D} target - Object to follow
     */
    setFollowMode(target) {
        this.mode = 'follow';
        this.followTarget = target;
    }

    /**
     * Set camera to Earth-centered view.
     */
    setEarthView() {
        this.mode = 'earth';
        this.followTarget = null;
        this.controls.target.set(0, 0, 0);
        this.camera.position.set(
            CAMERA_INITIAL_DISTANCE * 2,
            CAMERA_INITIAL_DISTANCE,
            CAMERA_INITIAL_DISTANCE * 2
        );
    }

    /**
     * Focus camera on a specific position.
     *
     * @param {THREE.Vector3} position - Position to focus on
     * @param {number} distance - Distance from position
     */
    focusOn(position, distance = 0.5) {
        const dir = position.clone().normalize();
        const cameraPos = position.clone().add(dir.multiplyScalar(distance));

        // Animate camera movement
        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();

        const animate = (t) => {
            if (t >= 1) {
                this.camera.position.copy(cameraPos);
                this.controls.target.copy(position);
                return;
            }

            this.camera.position.lerpVectors(startPos, cameraPos, t);
            this.controls.target.lerpVectors(startTarget, position, t);

            requestAnimationFrame(() => animate(t + 0.02));
        };

        animate(0);
    }

    /**
     * Reset camera to initial position.
     */
    reset() {
        this.mode = 'orbit';
        this.followTarget = null;
        this.controls.target.set(0, 0, 0);
        this.camera.position.set(
            CAMERA_INITIAL_DISTANCE,
            CAMERA_INITIAL_DISTANCE * 0.5,
            CAMERA_INITIAL_DISTANCE
        );
    }

    /**
     * Get current camera mode.
     */
    getMode() {
        return this.mode;
    }
}
