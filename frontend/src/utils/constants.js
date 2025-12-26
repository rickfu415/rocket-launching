/**
 * Constants for the rocket simulator frontend.
 */

// Earth parameters
export const EARTH_RADIUS = 6_371_000; // meters
export const EARTH_RADIUS_KM = 6371; // km

// Scene scaling (Earth radius = 1 unit in Three.js)
export const SCENE_SCALE = 1 / EARTH_RADIUS;

// Visualization settings
export const TRAJECTORY_MAX_POINTS = 5000;
export const TRAJECTORY_COLOR_LOW = 0x00ff00; // Green at low altitude
export const TRAJECTORY_COLOR_HIGH = 0xff0000; // Red at high altitude

// Camera settings
export const CAMERA_INITIAL_DISTANCE = 3; // Earth radii
export const CAMERA_MIN_DISTANCE = 1.1; // Just above surface
export const CAMERA_MAX_DISTANCE = 20; // Far view

// Update intervals
export const TELEMETRY_UPDATE_INTERVAL = 50; // ms

// Karman line (edge of space)
export const KARMAN_LINE = 100_000; // meters

// Orbit altitude thresholds
export const LEO_MAX = 2_000_000; // meters
export const GEO_ALTITUDE = 35_786_000; // meters

// Port configuration
const BACKEND_PORT = 8765;

// WebSocket
export const WS_URL = `ws://${window.location.hostname}:${BACKEND_PORT}/ws/simulation`;
export const API_BASE = `http://${window.location.hostname}:${BACKEND_PORT}/api`;

// Colors
export const COLORS = {
    earth: 0x2233aa,
    atmosphere: 0x87ceeb,
    trajectory: 0x00ff00,
    rocket: 0xff4400,
    orbit: 0xffff00,
    background: 0x000011,
};
