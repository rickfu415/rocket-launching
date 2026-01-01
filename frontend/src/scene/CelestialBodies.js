/**
 * Sun and Moon visualization for the Earth view.
 *
 * The Sun provides realistic directional lighting on Earth.
 * The Moon orbits Earth at a realistic distance (scaled for visibility).
 */

import * as THREE from 'three';

// Real astronomical distances (in Earth radii for scene scale)
// Earth radius = 1 unit in scene
const SUN_DISTANCE = 30;  // Placed far but visible (real: 23,455 Earth radii)
const MOON_DISTANCE = 10;  // Scaled for visibility (real: 60 Earth radii)
const MOON_RADIUS = 0.27;  // Moon is about 0.27 Earth radii

export class Sun {
    constructor() {
        this.group = new THREE.Group();
        this.light = null;
        this.mesh = null;
        this.rays = [];
        this.time = 0;

        // Sun position (can be animated for day/night cycle)
        this.azimuth = 0;  // Angle around Earth
        this.elevation = 0.3;  // Slight elevation above orbital plane

        this._createSun();
        this._createLight();
        this._createRays();
        this._createCorona();
    }

    _createSun() {
        // Sun core - bright white/yellow center
        const coreGeometry = new THREE.SphereGeometry(1.5, 64, 64);
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0xfffef0,
        });
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        this.group.add(core);

        // Inner glow - yellow/orange
        this._addGlow(1.8, 0xffee55, 0.9);
        this._addGlow(2.2, 0xffcc33, 0.7);
        this._addGlow(2.6, 0xffaa22, 0.5);

        // Mid glow - orange
        this._addGlow(3.2, 0xff8811, 0.35);
        this._addGlow(4.0, 0xff6600, 0.25);

        // Outer glow - red/orange fade
        this._addGlow(5.0, 0xff4400, 0.15);
        this._addGlow(6.5, 0xff2200, 0.08);
        this._addGlow(8.0, 0xcc1100, 0.04);

        // Store mesh reference
        this.mesh = core;

        // Position sun
        this._updatePosition();
    }

    _addGlow(radius, color, opacity) {
        const glowGeometry = new THREE.SphereGeometry(radius, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            side: THREE.BackSide,
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.group.add(glow);
    }

    _createCorona() {
        // Main corona sprite
        const coronaTexture = this._createCoronaTexture();
        const coronaMaterial = new THREE.SpriteMaterial({
            map: coronaTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const corona = new THREE.Sprite(coronaMaterial);
        corona.scale.set(25, 25, 1);
        this.group.add(corona);

        // Secondary corona layer (slightly rotated for variation)
        const corona2Material = new THREE.SpriteMaterial({
            map: coronaTexture,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const corona2 = new THREE.Sprite(corona2Material);
        corona2.scale.set(30, 30, 1);
        corona2.material.rotation = Math.PI / 6;
        this.group.add(corona2);
    }

    _createCoronaTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        const cx = 256, cy = 256;

        // Main radial gradient - warm colors
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 256);
        gradient.addColorStop(0, 'rgba(255, 255, 240, 1)');
        gradient.addColorStop(0.05, 'rgba(255, 250, 200, 0.95)');
        gradient.addColorStop(0.1, 'rgba(255, 220, 150, 0.8)');
        gradient.addColorStop(0.2, 'rgba(255, 180, 80, 0.5)');
        gradient.addColorStop(0.35, 'rgba(255, 120, 40, 0.25)');
        gradient.addColorStop(0.5, 'rgba(255, 80, 20, 0.12)');
        gradient.addColorStop(0.7, 'rgba(200, 50, 10, 0.05)');
        gradient.addColorStop(1, 'rgba(150, 30, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);

        // Add radiating streaks
        ctx.globalCompositeOperation = 'lighter';
        const numStreaks = 24;
        for (let i = 0; i < numStreaks; i++) {
            const angle = (i / numStreaks) * Math.PI * 2;
            const length = 180 + Math.random() * 70;
            const width = 3 + Math.random() * 4;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);

            const streakGradient = ctx.createLinearGradient(30, 0, length, 0);
            streakGradient.addColorStop(0, 'rgba(255, 200, 100, 0.4)');
            streakGradient.addColorStop(0.3, 'rgba(255, 150, 50, 0.2)');
            streakGradient.addColorStop(0.7, 'rgba(255, 100, 30, 0.05)');
            streakGradient.addColorStop(1, 'rgba(255, 50, 0, 0)');

            ctx.fillStyle = streakGradient;
            ctx.beginPath();
            ctx.moveTo(30, -width / 2);
            ctx.lineTo(length, 0);
            ctx.lineTo(30, width / 2);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    _createRays() {
        // Create animated ray sprites that radiate outward
        const rayTexture = this._createRayTexture();

        for (let i = 0; i < 8; i++) {
            const rayMaterial = new THREE.SpriteMaterial({
                map: rayTexture,
                transparent: true,
                opacity: 0.3,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });
            const ray = new THREE.Sprite(rayMaterial);
            ray.scale.set(20, 20, 1);
            ray.material.rotation = (i / 8) * Math.PI * 2;
            this.rays.push(ray);
            this.group.add(ray);
        }
    }

    _createRayTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        const cx = 128, cy = 128;

        // Create radial rays pattern
        ctx.globalCompositeOperation = 'source-over';

        // Draw multiple ray beams
        const numRays = 6;
        for (let i = 0; i < numRays; i++) {
            const angle = (i / numRays) * Math.PI * 2;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);

            // Ray gradient
            const rayGradient = ctx.createLinearGradient(20, 0, 128, 0);
            rayGradient.addColorStop(0, 'rgba(255, 220, 150, 0.6)');
            rayGradient.addColorStop(0.4, 'rgba(255, 150, 80, 0.3)');
            rayGradient.addColorStop(0.8, 'rgba(255, 100, 50, 0.1)');
            rayGradient.addColorStop(1, 'rgba(255, 50, 0, 0)');

            ctx.fillStyle = rayGradient;
            ctx.beginPath();
            ctx.moveTo(20, -8);
            ctx.lineTo(128, 0);
            ctx.lineTo(20, 8);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        return new THREE.CanvasTexture(canvas);
    }

    _createLight() {
        // Main directional light from sun - warm white
        this.light = new THREE.DirectionalLight(0xfff8e8, 1.8);
        this.light.castShadow = false;
        this.group.add(this.light);

        // Position light at sun location
        this._updateLightPosition();
    }

    _updatePosition() {
        const x = SUN_DISTANCE * Math.cos(this.elevation) * Math.cos(this.azimuth);
        const y = SUN_DISTANCE * Math.sin(this.elevation);
        const z = SUN_DISTANCE * Math.cos(this.elevation) * Math.sin(this.azimuth);

        this.group.position.set(x, y, z);
    }

    _updateLightPosition() {
        // Light shines from sun toward Earth (origin)
        this.light.position.copy(this.group.position);
        this.light.target.position.set(0, 0, 0);
    }

    /**
     * Set sun position by angle (for day/night cycle).
     * @param {number} azimuth - Angle around Earth in radians
     * @param {number} elevation - Elevation angle in radians
     */
    setPosition(azimuth, elevation = 0.3) {
        this.azimuth = azimuth;
        this.elevation = elevation;
        this._updatePosition();
        this._updateLightPosition();
    }

    /**
     * Animate sun effects.
     * @param {number} deltaTime - Time since last frame
     */
    update(deltaTime = 0.016) {
        this.time += deltaTime;

        // Animate rays - slow rotation and pulsing
        for (let i = 0; i < this.rays.length; i++) {
            const ray = this.rays[i];
            // Slow rotation
            ray.material.rotation += deltaTime * 0.02 * (i % 2 === 0 ? 1 : -1);
            // Subtle pulsing opacity
            ray.material.opacity = 0.25 + Math.sin(this.time * 0.5 + i) * 0.1;
        }

        // Very slow rotation to simulate Earth's rotation relative to Sun
        // this.azimuth += deltaTime * 0.01;
        // this._updatePosition();
        // this._updateLightPosition();
    }

    /**
     * Get the directional light for scene lighting.
     */
    getLight() {
        return this.light;
    }

    /**
     * Get the Three.js group.
     */
    getObject() {
        return this.group;
    }
}


export class Moon {
    constructor() {
        this.group = new THREE.Group();
        this.mesh = null;

        // Moon orbital position
        this.orbitalAngle = Math.PI * 0.7;  // Starting position
        this.orbitalSpeed = 0.0001;  // Very slow orbit

        this._createMoon();
    }

    _createMoon() {
        // Moon sphere with crater-like texture
        const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 32, 32);

        // Create procedural moon texture
        const moonTexture = this._createMoonTexture();

        const moonMaterial = new THREE.MeshPhongMaterial({
            map: moonTexture,
            bumpMap: moonTexture,
            bumpScale: 0.02,
            color: 0xcccccc,
            emissive: 0x111111,
            emissiveIntensity: 0.1,
        });

        this.mesh = new THREE.Mesh(moonGeometry, moonMaterial);
        this.group.add(this.mesh);

        // Position moon
        this._updatePosition();
    }

    _createMoonTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Base gray color
        ctx.fillStyle = '#888888';
        ctx.fillRect(0, 0, 512, 256);

        // Add craters (darker circles)
        const craterCount = 50;
        for (let i = 0; i < craterCount; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 256;
            const radius = 5 + Math.random() * 20;

            // Crater shadow
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(60, 60, 60, ${0.3 + Math.random() * 0.3})`;
            ctx.fill();

            // Crater rim (lighter)
            ctx.beginPath();
            ctx.arc(x - radius * 0.2, y - radius * 0.2, radius * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(100, 100, 100, ${0.2 + Math.random() * 0.2})`;
            ctx.fill();
        }

        // Add some maria (dark patches)
        for (let i = 0; i < 5; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 256;
            const radius = 30 + Math.random() * 50;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(50, 50, 55, ${0.2 + Math.random() * 0.2})`;
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    _updatePosition() {
        // Moon orbits in a slightly inclined plane
        const inclination = 0.09;  // ~5 degrees inclination

        const x = MOON_DISTANCE * Math.cos(this.orbitalAngle);
        const y = MOON_DISTANCE * Math.sin(inclination) * Math.sin(this.orbitalAngle);
        const z = MOON_DISTANCE * Math.sin(this.orbitalAngle);

        this.group.position.set(x, y, z);

        // Moon always faces Earth (tidally locked)
        this.mesh.lookAt(0, 0, 0);
    }

    /**
     * Animate moon orbit.
     * @param {number} deltaTime - Time since last frame
     */
    update(deltaTime = 0.016) {
        // Slow orbital motion
        this.orbitalAngle += this.orbitalSpeed * deltaTime * 60;
        this._updatePosition();
    }

    /**
     * Get the Three.js group.
     */
    getObject() {
        return this.group;
    }
}
