/**
 * Coordinate conversion utilities.
 *
 * Converts between:
 * - ECI (Earth-Centered Inertial) - used by simulation
 * - Scene coordinates - used by Three.js
 */

import * as THREE from 'three';
import { EARTH_RADIUS, SCENE_SCALE } from './constants.js';

/**
 * Convert ECI position to Three.js scene coordinates.
 *
 * ECI frame:
 * - X: toward vernal equinox
 * - Y: perpendicular to X in equatorial plane
 * - Z: toward north pole
 *
 * Three.js scene (with Earth centered):
 * - Uses scaled coordinates where Earth radius = 1
 * - Y is up (maps from Z in ECI)
 *
 * @param {number[]} eciPosition - [x, y, z] in meters
 * @returns {THREE.Vector3} Scene coordinates
 */
export function eciToScene(eciPosition) {
    const [x, y, z] = eciPosition;

    // Scale and transform: ECI (x,y,z) -> Scene (x,z,y)
    // Note: Three.js uses Y-up, ECI uses Z-up
    return new THREE.Vector3(
        x * SCENE_SCALE,
        z * SCENE_SCALE,  // ECI Z becomes scene Y (up)
        y * SCENE_SCALE   // ECI Y becomes scene Z
    );
}

/**
 * Convert scene coordinates to ECI.
 *
 * @param {THREE.Vector3} scenePos - Scene coordinates
 * @returns {number[]} [x, y, z] in meters
 */
export function sceneToEci(scenePos) {
    return [
        scenePos.x / SCENE_SCALE,
        scenePos.z / SCENE_SCALE,  // Scene Z -> ECI Y
        scenePos.y / SCENE_SCALE   // Scene Y -> ECI Z
    ];
}

/**
 * Convert geodetic coordinates to ECI.
 *
 * @param {number} latitude - Latitude in degrees
 * @param {number} longitude - Longitude in degrees
 * @param {number} altitude - Altitude above sea level in meters
 * @returns {number[]} [x, y, z] in meters
 */
export function geodeticToEci(latitude, longitude, altitude) {
    const latRad = latitude * Math.PI / 180;
    const lonRad = longitude * Math.PI / 180;
    const r = EARTH_RADIUS + altitude;

    const x = r * Math.cos(latRad) * Math.cos(lonRad);
    const y = r * Math.cos(latRad) * Math.sin(lonRad);
    const z = r * Math.sin(latRad);

    return [x, y, z];
}

/**
 * Convert geodetic coordinates directly to scene coordinates.
 *
 * @param {number} latitude - Latitude in degrees
 * @param {number} longitude - Longitude in degrees
 * @param {number} altitude - Altitude above sea level in meters
 * @returns {THREE.Vector3} Scene coordinates
 */
export function geodeticToScene(latitude, longitude, altitude) {
    const eci = geodeticToEci(latitude, longitude, altitude);
    return eciToScene(eci);
}

/**
 * Get altitude from ECI position.
 *
 * @param {number[]} eciPosition - [x, y, z] in meters
 * @returns {number} Altitude above Earth surface in meters
 */
export function getAltitude(eciPosition) {
    const [x, y, z] = eciPosition;
    const r = Math.sqrt(x*x + y*y + z*z);
    return r - EARTH_RADIUS;
}

/**
 * Get latitude and longitude from ECI position.
 *
 * @param {number[]} eciPosition - [x, y, z] in meters
 * @returns {{latitude: number, longitude: number}} Degrees
 */
export function getLatLon(eciPosition) {
    const [x, y, z] = eciPosition;
    const r = Math.sqrt(x*x + y*y + z*z);

    const latitude = Math.asin(z / r) * 180 / Math.PI;
    const longitude = Math.atan2(y, x) * 180 / Math.PI;

    return { latitude, longitude };
}

/**
 * Calculate distance between two ECI positions.
 *
 * @param {number[]} pos1 - First position [x, y, z]
 * @param {number[]} pos2 - Second position [x, y, z]
 * @returns {number} Distance in meters
 */
export function distance(pos1, pos2) {
    const dx = pos2[0] - pos1[0];
    const dy = pos2[1] - pos1[1];
    const dz = pos2[2] - pos1[2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

/**
 * Interpolate color based on altitude.
 *
 * @param {number} altitude - Altitude in meters
 * @param {number} maxAltitude - Maximum altitude for color scale
 * @returns {THREE.Color} Interpolated color
 */
export function altitudeToColor(altitude, maxAltitude = 500000) {
    const t = Math.min(1, Math.max(0, altitude / maxAltitude));

    // Gradient: green (low) -> yellow (mid) -> red (high)
    if (t < 0.5) {
        // Green to yellow
        const s = t * 2;
        return new THREE.Color(s, 1, 0);
    } else {
        // Yellow to red
        const s = (t - 0.5) * 2;
        return new THREE.Color(1, 1 - s, 0);
    }
}
