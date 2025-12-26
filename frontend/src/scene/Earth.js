/**
 * Earth model for Three.js scene.
 *
 * Creates a textured Earth sphere with optional atmosphere glow.
 */

import * as THREE from 'three';
import { COLORS } from '../utils/constants.js';

export class Earth {
    constructor() {
        this.mesh = null;
        this.atmosphere = null;
        this.group = new THREE.Group();
        this.markers = [];  // Track markers for dynamic scaling

        this._createEarth();
        this._createAtmosphere();
    }

    _createEarth() {
        // Earth sphere with radius = 1 (scaled in scene)
        const geometry = new THREE.SphereGeometry(1, 64, 64);

        // Create a procedural Earth texture (we can replace with real texture later)
        const material = new THREE.MeshPhongMaterial({
            color: COLORS.earth,
            emissive: 0x112244,
            emissiveIntensity: 0.1,
            shininess: 5,
        });

        // Add some visual detail with a wireframe overlay
        const wireGeometry = new THREE.SphereGeometry(1.001, 32, 32);
        const wireMaterial = new THREE.MeshBasicMaterial({
            color: 0x335588,
            wireframe: true,
            transparent: true,
            opacity: 0.1,
        });
        const wireframe = new THREE.Mesh(wireGeometry, wireMaterial);

        this.mesh = new THREE.Mesh(geometry, material);
        this.group.add(this.mesh);
        this.group.add(wireframe);

        // Add latitude/longitude lines
        this._addGridLines();
    }

    _addGridLines() {
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x4466aa,
            transparent: true,
            opacity: 0.3,
        });

        // Latitude lines
        for (let lat = -60; lat <= 60; lat += 30) {
            const latRad = lat * Math.PI / 180;
            const r = Math.cos(latRad);
            const y = Math.sin(latRad);

            const points = [];
            for (let lon = 0; lon <= 360; lon += 5) {
                const lonRad = lon * Math.PI / 180;
                points.push(new THREE.Vector3(
                    r * Math.cos(lonRad) * 1.002,
                    y * 1.002,
                    r * Math.sin(lonRad) * 1.002
                ));
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.group.add(line);
        }

        // Longitude lines
        for (let lon = 0; lon < 360; lon += 30) {
            const lonRad = lon * Math.PI / 180;
            const points = [];

            for (let lat = -90; lat <= 90; lat += 5) {
                const latRad = lat * Math.PI / 180;
                const r = Math.cos(latRad);
                const y = Math.sin(latRad);
                points.push(new THREE.Vector3(
                    r * Math.cos(lonRad) * 1.002,
                    y * 1.002,
                    r * Math.sin(lonRad) * 1.002
                ));
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.group.add(line);
        }

        // Equator (highlighted)
        const equatorMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
        });
        const equatorPoints = [];
        for (let lon = 0; lon <= 360; lon += 2) {
            const lonRad = lon * Math.PI / 180;
            equatorPoints.push(new THREE.Vector3(
                Math.cos(lonRad) * 1.003,
                0,
                Math.sin(lonRad) * 1.003
            ));
        }
        const equatorGeometry = new THREE.BufferGeometry().setFromPoints(equatorPoints);
        const equatorLine = new THREE.Line(equatorGeometry, equatorMaterial);
        this.group.add(equatorLine);
    }

    _createAtmosphere() {
        // Atmosphere glow effect using a larger transparent sphere
        const atmosphereGeometry = new THREE.SphereGeometry(1.015, 64, 64);
        const atmosphereMaterial = new THREE.MeshPhongMaterial({
            color: COLORS.atmosphere,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide,
        });

        this.atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        this.group.add(this.atmosphere);

        // Outer glow
        const glowGeometry = new THREE.SphereGeometry(1.05, 32, 32);
        const glowMaterial = new THREE.ShaderMaterial({
            uniforms: {
                glowColor: { value: new THREE.Color(0x87ceeb) },
                viewVector: { value: new THREE.Vector3(0, 0, 1) },
            },
            vertexShader: `
                varying float intensity;
                void main() {
                    vec3 vNormal = normalize(normalMatrix * normal);
                    vec3 vNormel = normalize(normalMatrix * vec3(0, 0, 1));
                    intensity = pow(0.7 - dot(vNormal, vNormel), 2.0);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 glowColor;
                varying float intensity;
                void main() {
                    vec3 glow = glowColor * intensity;
                    gl_FragColor = vec4(glow, intensity * 0.5);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
        });

        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.group.add(glow);
    }

    /**
     * Add a marker at a specific location (e.g., launch site).
     *
     * @param {number} latitude - Latitude in degrees
     * @param {number} longitude - Longitude in degrees
     * @param {number} color - Marker color
     */
    addMarker(latitude, longitude, color = 0xff0000) {
        const latRad = latitude * Math.PI / 180;
        const lonRad = longitude * Math.PI / 180;

        const x = Math.cos(latRad) * Math.cos(lonRad);
        const y = Math.sin(latRad);
        const z = Math.cos(latRad) * Math.sin(lonRad);

        const markerGeometry = new THREE.SphereGeometry(0.02, 8, 8);
        const markerMaterial = new THREE.MeshBasicMaterial({ color });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);

        marker.position.set(x * 1.01, y * 1.01, z * 1.01);
        this.group.add(marker);

        // Track marker for dynamic scaling
        this.markers.push(marker);

        return marker;
    }

    /**
     * Update marker scales based on camera distance.
     * Maintains roughly constant screen size regardless of zoom level.
     *
     * @param {THREE.Camera} camera - The camera to calculate distance from
     */
    updateMarkerScales(camera) {
        if (!camera) return;

        for (const marker of this.markers) {
            // Calculate distance from camera to marker
            const distance = camera.position.distanceTo(marker.position);

            // Scale proportionally to distance to maintain constant screen size
            const baseDistance = 2.0;  // Reference distance where scale = 1
            const minScale = 0.1;
            const maxScale = 10.0;

            let scaleFactor = distance / baseDistance;
            scaleFactor = Math.max(minScale, Math.min(maxScale, scaleFactor));

            marker.scale.setScalar(scaleFactor);
        }
    }

    /**
     * Get the Three.js group containing all Earth objects.
     */
    getObject() {
        return this.group;
    }
}
