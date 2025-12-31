/**
 * Camera controller for the 3D scene.
 *
 * Provides orbit controls and camera follow modes.
 * Includes rocket-following camera for early flight phases.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    CAMERA_INITIAL_DISTANCE,
    CAMERA_MIN_DISTANCE,
    CAMERA_MAX_DISTANCE,
    KARMAN_LINE,
} from '../utils/constants.js';

// Altitude threshold for switching from rocket view to Earth view (100 km)
const CAMERA_SWITCH_ALTITUDE = KARMAN_LINE;

export class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.controls = new OrbitControls(camera, domElement);

        this._setupControls();

        // Camera modes: 'orbit', 'rocket', 'earth', 'transition'
        this.mode = 'orbit';
        this.followTarget = null;
        this.followOffset = new THREE.Vector3(0, 0.5, 1);

        // Rocket follow state
        this.rocketFollowEnabled = false;
        this.currentAltitude = 0;
        this.hasSwitchedToEarth = false;
        this.rocketVelocity = new THREE.Vector3();

        // Transition animation
        this.transitioning = false;
        this.transitionProgress = 0;
        this.transitionStartPos = new THREE.Vector3();
        this.transitionEndPos = new THREE.Vector3();
        this.transitionStartTarget = new THREE.Vector3();
        this.transitionEndTarget = new THREE.Vector3();
        this.transitionDuration = 2.0; // seconds
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

        // Initial position - facing Cape Canaveral launch site
        // Cape Canaveral: lat 28.562°, lon -80.577°
        // Position camera to see North America / Florida area
        this._setInitialCameraPosition();
        this.controls.update();
    }

    /**
     * Set initial camera position to face the launch site.
     */
    _setInitialCameraPosition() {
        // Cape Canaveral coordinates
        const launchLat = 28.562 * Math.PI / 180;
        const launchLon = -80.577 * Math.PI / 180;

        // Calculate launch site position on Earth surface (in scene coords)
        // Scene uses Y-up, so we convert from spherical
        const launchX = Math.cos(launchLat) * Math.cos(launchLon);
        const launchY = Math.sin(launchLat);  // Up in scene
        const launchZ = Math.cos(launchLat) * Math.sin(launchLon);

        // Position camera at a distance, looking toward launch site
        const distance = CAMERA_INITIAL_DISTANCE;
        this.camera.position.set(
            launchX * distance,
            launchY * distance + distance * 0.3,  // Slightly above
            launchZ * distance
        );

        // Look at Earth center
        this.controls.target.set(0, 0, 0);
    }

    /**
     * Update camera each frame.
     *
     * @param {number} deltaTime - Time since last frame (seconds)
     */
    update(deltaTime = 0.016) {
        // Handle smooth transition between camera modes
        if (this.transitioning) {
            this._updateTransition(deltaTime);
            this.controls.update();
            return;
        }

        // Rocket-following camera mode
        if (this.mode === 'rocket' && this.followTarget) {
            this._updateRocketCamera();
        }
        // Legacy follow mode
        else if (this.mode === 'follow' && this.followTarget) {
            const targetPos = this.followTarget.position.clone();
            const dir = targetPos.clone().normalize();
            const cameraPos = targetPos.clone();
            cameraPos.add(dir.multiplyScalar(this.followOffset.y));
            cameraPos.add(new THREE.Vector3(this.followOffset.x, 0, this.followOffset.z));
            this.camera.position.lerp(cameraPos, 0.1);
            this.controls.target.lerp(targetPos, 0.1);
        }

        this.controls.update();
    }

    /**
     * Update rocket-following camera with close-up view.
     * Starts very close and gradually pulls back as altitude increases.
     */
    _updateRocketCamera() {
        const targetPos = this.followTarget.position.clone();

        // Direction from Earth center to rocket (radial/up direction)
        const radial = targetPos.clone().normalize();

        // Get "behind" direction from velocity
        // Behind = opposite of velocity direction, projected perpendicular to radial
        let behind = new THREE.Vector3();

        if (this.rocketVelocity.lengthSq() > 100) {
            // Use velocity to determine behind direction
            const velDir = this.rocketVelocity.clone().normalize();
            // Project velocity onto plane perpendicular to radial
            behind = velDir.clone().sub(radial.clone().multiplyScalar(velDir.dot(radial)));
            if (behind.lengthSq() > 0.01) {
                behind.normalize().negate(); // Behind is opposite of horizontal velocity
            } else {
                // Velocity is mostly radial, use arbitrary perpendicular
                behind.set(1, 0, 0);
                if (Math.abs(radial.dot(behind)) > 0.9) {
                    behind.set(0, 0, 1);
                }
                behind.cross(radial).normalize();
            }
        } else {
            // No velocity yet, use arbitrary direction perpendicular to radial
            behind.set(1, 0, 0);
            if (Math.abs(radial.dot(behind)) > 0.9) {
                behind.set(0, 0, 1);
            }
            behind.cross(radial).normalize();
        }

        // Camera distance scales smoothly with altitude using logarithmic curve
        // This gives a very close view at start, gradually pulling back
        const altitudeKm = this.currentAltitude / 1000;

        // Use logarithmic scaling for smooth gradual pullback
        // At 0km: ~0.0005 (very close)
        // At 10km: ~0.002
        // At 50km: ~0.005
        // At 100km: ~0.008
        const minDistance = 0.0005;  // Very close at liftoff
        const maxDistance = 0.015;   // Maximum before switching to Earth view

        // Logarithmic interpolation for smooth gradual increase
        // log(1 + x) grows slowly, giving gradual pullback effect
        const logFactor = Math.log10(1 + altitudeKm * 0.5) / Math.log10(51); // Normalized to 0-1 over 100km
        const distanceScale = minDistance + (maxDistance - minDistance) * Math.min(1, logFactor);

        // Position camera behind and slightly above the rocket
        const cameraPos = targetPos.clone();
        cameraPos.add(radial.clone().multiplyScalar(distanceScale * 0.4)); // Above
        cameraPos.add(behind.clone().multiplyScalar(distanceScale));        // Behind

        // Very smooth camera movement - lower lerp value = smoother
        this.camera.position.lerp(cameraPos, 0.08);

        // Keep rocket exactly centered
        this.controls.target.copy(targetPos);
    }

    /**
     * Update transition animation between camera modes.
     */
    _updateTransition(deltaTime) {
        this.transitionProgress += deltaTime / this.transitionDuration;

        if (this.transitionProgress >= 1.0) {
            // Transition complete
            this.transitionProgress = 1.0;
            this.transitioning = false;
            this.camera.position.copy(this.transitionEndPos);
            this.controls.target.copy(this.transitionEndTarget);
            return;
        }

        // Smooth easing (ease-in-out)
        const t = this._easeInOutCubic(this.transitionProgress);

        // Interpolate camera position and target
        this.camera.position.lerpVectors(this.transitionStartPos, this.transitionEndPos, t);
        this.controls.target.lerpVectors(this.transitionStartTarget, this.transitionEndTarget, t);
    }

    /**
     * Cubic ease-in-out function.
     */
    _easeInOutCubic(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    /**
     * Set camera to orbit mode (free rotation around Earth).
     */
    setOrbitMode() {
        this.mode = 'orbit';
        this.followTarget = null;
        this.rocketFollowEnabled = false;
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
     * Enable rocket-following camera for launch sequence.
     * Camera is positioned once but user has full control after that.
     *
     * @param {THREE.Object3D} target - Rocket object to follow
     * @param {boolean} smoothTransition - Whether to smoothly transition camera
     */
    setRocketFollowMode(target, smoothTransition = false) {
        // Switch to orbit mode - no auto-following, user has full control
        this.mode = 'orbit';
        this.followTarget = null;
        this.rocketFollowEnabled = false;
        this.hasSwitchedToEarth = false;

        // Reset camera near/far planes to orbital view defaults
        this.camera.near = 0.01;
        this.camera.far = 100;
        this.camera.updateProjectionMatrix();

        // Reset distance limits to orbital view defaults
        this.controls.minDistance = CAMERA_MIN_DISTANCE;
        this.controls.maxDistance = CAMERA_MAX_DISTANCE;

        // Keep orbit controls enabled so user can adjust view manually
        this.controls.enabled = true;
        this.controls.enableZoom = true;
        this.controls.enableRotate = true;
        this.controls.enablePan = true;

        if (smoothTransition && target) {
            // Smooth transition to view the rocket, then let user control
            this._transitionToRocketView(target);
        }
    }

    /**
     * Smoothly transition camera to view the rocket (centered).
     */
    _transitionToRocketView(target) {
        const targetPos = target.position.clone();

        // Check if rocket position is valid (not at origin/center of Earth)
        // Rocket should be at Earth surface, so length should be ~1.0 in scene units
        if (targetPos.length() < 0.5) {
            // Rocket position not set properly, skip transition
            console.warn('Rocket position invalid:', targetPos.x, targetPos.y, targetPos.z);
            this.mode = 'orbit';
            return;
        }

        // Calculate end position - position camera to see the rocket clearly
        // The rocket is on the Earth's surface, we want to view it from a good angle
        const radial = targetPos.clone().normalize();

        // Position camera at a distance where we can see the rocket and trajectory
        const viewDistance = 0.5;  // Good distance to see rocket on Earth

        // Camera end position: offset from rocket position along radial direction
        this.transitionEndPos.copy(targetPos);
        this.transitionEndPos.add(radial.clone().multiplyScalar(viewDistance));

        // Look at the rocket position (rocket stays centered)
        this.transitionEndTarget.copy(targetPos);

        // When coming from ground view, camera position is in different coordinate scale
        // Start from a sensible orbital view position (far from Earth, looking at rocket)
        const startDistance = 3.0;  // Start from 3 Earth radii distance
        this.transitionStartPos.copy(targetPos);
        this.transitionStartPos.add(radial.clone().multiplyScalar(startDistance));

        // Start looking at the rocket
        this.transitionStartTarget.copy(targetPos);

        // Immediately set camera to start position (jump out of ground view coords)
        this.camera.position.copy(this.transitionStartPos);
        this.controls.target.copy(this.transitionStartTarget);

        // Start transition
        this.transitioning = true;
        this.transitionProgress = 0;
        this.transitionDuration = 1.5;

        // Note: When transition completes in _updateTransition,
        // the camera and controls.target will be set to the end positions
    }

    /**
     * Update altitude and velocity for camera control.
     *
     * @param {number} altitude - Current altitude in meters
     * @param {number[]} velocity - Velocity vector [vx, vy, vz] in ECI (optional)
     */
    updateAltitude(altitude, velocity = null) {
        this.currentAltitude = altitude;

        // Store velocity for camera orientation (convert ECI to scene coords)
        if (velocity) {
            this.rocketVelocity.set(
                velocity[0],
                velocity[2],  // ECI Z -> Scene Y
                velocity[1]   // ECI Y -> Scene Z
            );
        }

        // No automatic camera switching - user controls the view
    }

    /**
     * Smoothly transition from rocket view to Earth view.
     */
    _transitionToEarthView() {
        this.hasSwitchedToEarth = true;
        this.rocketFollowEnabled = false;

        // Store start position
        this.transitionStartPos.copy(this.camera.position);
        this.transitionStartTarget.copy(this.controls.target);

        // Calculate end position (Earth view)
        this.transitionEndPos.set(
            CAMERA_INITIAL_DISTANCE * 1.5,
            CAMERA_INITIAL_DISTANCE * 0.8,
            CAMERA_INITIAL_DISTANCE * 1.5
        );
        this.transitionEndTarget.set(0, 0, 0);

        // Start transition
        this.transitioning = true;
        this.transitionProgress = 0;
        this.mode = 'transition';

        // Re-enable orbit controls after transition
        setTimeout(() => {
            this.controls.enabled = true;
            this.mode = 'orbit';
        }, this.transitionDuration * 1000 + 100);
    }

    /**
     * Set camera to Earth-centered view.
     */
    setEarthView() {
        this.mode = 'earth';
        this.followTarget = null;
        this.rocketFollowEnabled = false;
        this.controls.enabled = true;
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
     * Set camera for ground view mode.
     * Camera follows the rocket vertically, keeping it centered.
     *
     * @param {THREE.Object3D} groundViewObject - The ground view group
     */
    setGroundViewMode(groundViewObject) {
        this.mode = 'ground';
        this.followTarget = groundViewObject;
        this.controls.enabled = true;
        this.controls.enableZoom = true;
        this.controls.enableRotate = true;
        this.controls.enablePan = true;

        // Adjust camera near/far planes for ground view to prevent clipping
        this.camera.near = 0.1;
        this.camera.far = 2000;
        this.camera.updateProjectionMatrix();

        // Initial camera position - will be updated to follow rocket
        this.camera.position.set(50, 40, 50);
        this.controls.target.set(0, 5, 0);

        // Adjust controls for ground view - allow zoom with wider range
        this.controls.minDistance = 5;
        this.controls.maxDistance = 500;

        // Store ground view specific state
        this.groundViewRocketY = 5;
    }

    /**
     * Update ground view camera to follow rocket vertically.
     * @param {number} rocketY - Y position of rocket in ground view scene units
     */
    updateGroundViewTarget(rocketY) {
        if (this.mode !== 'ground') return;

        this.groundViewRocketY = rocketY;

        // Keep camera target on the rocket (centered)
        const currentTarget = this.controls.target.clone();
        currentTarget.y = rocketY;
        this.controls.target.copy(currentTarget);

        // Move camera up with rocket to keep it in view
        const cameraY = rocketY + 35;  // Camera stays above rocket
        this.camera.position.y = cameraY;
    }

    /**
     * Reset camera to initial position.
     */
    reset() {
        this.mode = 'orbit';
        this.followTarget = null;
        this.rocketFollowEnabled = false;
        this.hasSwitchedToEarth = false;
        this.currentAltitude = 0;
        this.transitioning = false;
        this.controls.enabled = true;

        // Reset camera near/far planes to orbital view defaults
        this.camera.near = 0.01;
        this.camera.far = 100;
        this.camera.updateProjectionMatrix();

        // Reset distance limits to orbital view defaults
        this.controls.minDistance = CAMERA_MIN_DISTANCE;
        this.controls.maxDistance = CAMERA_MAX_DISTANCE;

        this._setInitialCameraPosition();
    }

    /**
     * Get current camera mode.
     */
    getMode() {
        return this.mode;
    }
}
