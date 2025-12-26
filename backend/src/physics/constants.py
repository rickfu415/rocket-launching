"""
Physical constants for rocket simulation.
Uses WGS84 Earth model and standard physical constants.
"""

import math

# Gravitational constant (m³ kg⁻¹ s⁻²)
G = 6.67430e-11

# Earth parameters (WGS84)
EARTH_MASS = 5.972168e24  # kg
EARTH_RADIUS_EQUATORIAL = 6_378_137.0  # meters
EARTH_RADIUS_POLAR = 6_356_752.3  # meters
EARTH_RADIUS_MEAN = 6_371_000.0  # meters (for simplified calculations)
EARTH_FLATTENING = 1 / 298.257223563

# Standard gravitational parameter for Earth (m³/s²)
MU_EARTH = G * EARTH_MASS  # ≈ 3.986004418e14

# Standard gravity at sea level (m/s²)
G0 = 9.80665

# Earth's rotation rate (rad/s)
EARTH_ROTATION_RATE = 7.2921159e-5

# Atmospheric constants
SEA_LEVEL_PRESSURE = 101325.0  # Pa
SEA_LEVEL_TEMPERATURE = 288.15  # K (15°C)
SEA_LEVEL_DENSITY = 1.225  # kg/m³

# Gas constants
MOLAR_MASS_AIR = 0.0289644  # kg/mol
UNIVERSAL_GAS_CONSTANT = 8.31447  # J/(mol·K)
SPECIFIC_GAS_CONSTANT_AIR = UNIVERSAL_GAS_CONSTANT / MOLAR_MASS_AIR  # ≈ 287.058 J/(kg·K)

# Ratio of specific heats for air
GAMMA_AIR = 1.4

# Karman line - edge of space
KARMAN_LINE = 100_000.0  # meters (100 km)

# Low Earth Orbit altitude range
LEO_MIN_ALTITUDE = 160_000.0  # meters
LEO_MAX_ALTITUDE = 2_000_000.0  # meters

# Speed of sound at sea level (m/s)
SPEED_OF_SOUND_SEA_LEVEL = math.sqrt(GAMMA_AIR * SPECIFIC_GAS_CONSTANT_AIR * SEA_LEVEL_TEMPERATURE)

# Orbital velocity for circular orbit at Earth's surface (theoretical, m/s)
ORBITAL_VELOCITY_SURFACE = math.sqrt(MU_EARTH / EARTH_RADIUS_MEAN)  # ≈ 7905 m/s

# Escape velocity from Earth's surface (m/s)
ESCAPE_VELOCITY = math.sqrt(2 * MU_EARTH / EARTH_RADIUS_MEAN)  # ≈ 11186 m/s
