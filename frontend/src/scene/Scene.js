/**
 * Main Three.js scene setup and management.
 */

import * as THREE from 'three';
import { Earth } from './Earth.js';
import { Rocket } from './Rocket.js';
import { Trajectory, OrbitPrediction } from './Trajectory.js';
import { CameraController } from './Camera.js';
import { COLORS } from '../utils/constants.js';

export class RocketScene {
    constructor(container) {
        this.container = container;

        // Three.js core
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cameraController = null;

        // Scene objects
        this.earth = null;
        this.rocket = null;
        this.trajectory = null;
        this.orbitPrediction = null;

        // Animation
        this.animationId = null;
        this.isRunning = false;

        this._init();
    }

    _init() {
        this._createScene();
        this._createCamera();
        this._createRenderer();
        this._createLights();
        this._createObjects();
        this._setupEventListeners();
    }

    _createScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(COLORS.background);

        // Add starfield
        this._createStarfield();
    }

    _createCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.01, 100);

        this.cameraController = new CameraController(
            this.camera,
            this.container
        );
    }

    _createRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
        });

        this.renderer.setSize(
            this.container.clientWidth,
            this.container.clientHeight
        );
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.container.appendChild(this.renderer.domElement);
    }

    _createLights() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0x404060, 0.5);
        this.scene.add(ambient);

        // Sun light (directional)
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        sunLight.position.set(5, 3, 5);
        this.scene.add(sunLight);

        // Fill light from opposite side
        const fillLight = new THREE.DirectionalLight(0x8888aa, 0.3);
        fillLight.position.set(-5, -3, -5);
        this.scene.add(fillLight);
    }

    _createObjects() {
        // Earth
        this.earth = new Earth();
        this.scene.add(this.earth.getObject());

        // Rocket
        this.rocket = new Rocket();
        this.scene.add(this.rocket.getObject());

        // Trajectory
        this.trajectory = new Trajectory();
        this.scene.add(this.trajectory.getObject());

        // Orbit prediction
        this.orbitPrediction = new OrbitPrediction();
        this.scene.add(this.orbitPrediction.getObject());

        // Add launch site marker (Cape Canaveral)
        this.earth.addMarker(28.562, -80.577, 0x00ff00);
    }

    _createStarfield() {
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 2000;
        const positions = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            // Random positions on a large sphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 50 + Math.random() * 20;

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
        }

        starGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3)
        );

        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.05,
            sizeAttenuation: true,
        });

        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);
    }

    _setupEventListeners() {
        window.addEventListener('resize', () => this._onResize());
    }

    _onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    /**
     * Start the render loop.
     */
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this._animate();
    }

    /**
     * Stop the render loop.
     */
    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    _animate() {
        if (!this.isRunning) return;

        this.animationId = requestAnimationFrame(() => this._animate());

        // Update camera controls
        this.cameraController.update();

        // Slowly rotate Earth (optional)
        // this.earth.getObject().rotation.y += 0.0001;

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Update rocket position from simulation state.
     *
     * @param {Object} state - Simulation state
     */
    updateRocket(state) {
        this.rocket.update(state);

        // Add point to trajectory
        if (state.position && state.altitude !== undefined) {
            this.trajectory.addPoint(state.position, state.altitude);
        }
    }

    /**
     * Update orbit prediction.
     *
     * @param {Object} orbit - Orbital elements
     */
    updateOrbit(orbit) {
        this.orbitPrediction.update(orbit);
    }

    /**
     * Reset the scene for a new simulation.
     */
    reset() {
        this.rocket.reset();
        this.trajectory.clear();
        this.orbitPrediction.hide();
        this.cameraController.reset();
    }

    /**
     * Focus camera on the rocket.
     */
    focusOnRocket() {
        if (this.rocket.visible) {
            this.cameraController.setFollowMode(this.rocket.getObject());
        }
    }

    /**
     * Set camera to Earth view.
     */
    setEarthView() {
        this.cameraController.setEarthView();
    }

    /**
     * Get the camera controller.
     */
    getCameraController() {
        return this.cameraController;
    }
}
