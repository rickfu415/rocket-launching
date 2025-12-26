"""
US Standard Atmosphere 1976 implementation.

Provides temperature, pressure, and density as functions of geometric altitude.
Valid from sea level to 86 km (with extrapolation beyond).
"""

import math
from dataclasses import dataclass
from typing import Tuple

from .constants import (
    SEA_LEVEL_PRESSURE,
    SEA_LEVEL_TEMPERATURE,
    SEA_LEVEL_DENSITY,
    MOLAR_MASS_AIR,
    UNIVERSAL_GAS_CONSTANT,
    SPECIFIC_GAS_CONSTANT_AIR,
    G0,
)


@dataclass
class AtmosphericLayer:
    """Definition of an atmospheric layer."""
    base_altitude: float  # meters
    base_temperature: float  # Kelvin
    lapse_rate: float  # K/m (negative = temperature decreases with altitude)


# US Standard Atmosphere 1976 layer definitions
# Geometric altitudes and temperature profiles
ATMOSPHERIC_LAYERS = [
    # Troposphere: 0 - 11 km
    AtmosphericLayer(base_altitude=0, base_temperature=288.15, lapse_rate=-0.0065),
    # Tropopause: 11 - 20 km (isothermal)
    AtmosphericLayer(base_altitude=11000, base_temperature=216.65, lapse_rate=0.0),
    # Stratosphere 1: 20 - 32 km
    AtmosphericLayer(base_altitude=20000, base_temperature=216.65, lapse_rate=0.001),
    # Stratosphere 2: 32 - 47 km
    AtmosphericLayer(base_altitude=32000, base_temperature=228.65, lapse_rate=0.0028),
    # Stratopause: 47 - 51 km (isothermal)
    AtmosphericLayer(base_altitude=47000, base_temperature=270.65, lapse_rate=0.0),
    # Mesosphere 1: 51 - 71 km
    AtmosphericLayer(base_altitude=51000, base_temperature=270.65, lapse_rate=-0.0028),
    # Mesosphere 2: 71 - 86 km
    AtmosphericLayer(base_altitude=71000, base_temperature=214.65, lapse_rate=-0.002),
]

# Pressure at the base of each layer (precomputed for efficiency)
# Will be calculated on first use
_layer_base_pressures = None


def _compute_layer_base_pressures() -> list:
    """Compute pressure at the base of each atmospheric layer."""
    pressures = [SEA_LEVEL_PRESSURE]

    for i in range(len(ATMOSPHERIC_LAYERS) - 1):
        layer = ATMOSPHERIC_LAYERS[i]
        next_layer = ATMOSPHERIC_LAYERS[i + 1]

        h0 = layer.base_altitude
        h1 = next_layer.base_altitude
        T0 = layer.base_temperature
        L = layer.lapse_rate
        P0 = pressures[i]

        if abs(L) < 1e-10:  # Isothermal layer
            P1 = P0 * math.exp(-G0 * MOLAR_MASS_AIR * (h1 - h0) / (UNIVERSAL_GAS_CONSTANT * T0))
        else:  # Gradient layer
            T1 = T0 + L * (h1 - h0)
            P1 = P0 * (T1 / T0) ** (-G0 * MOLAR_MASS_AIR / (UNIVERSAL_GAS_CONSTANT * L))

        pressures.append(P1)

    return pressures


def _get_layer_base_pressures() -> list:
    """Get cached layer base pressures."""
    global _layer_base_pressures
    if _layer_base_pressures is None:
        _layer_base_pressures = _compute_layer_base_pressures()
    return _layer_base_pressures


def _find_layer_index(altitude: float) -> int:
    """Find the index of the atmospheric layer containing the given altitude."""
    for i in range(len(ATMOSPHERIC_LAYERS) - 1, -1, -1):
        if altitude >= ATMOSPHERIC_LAYERS[i].base_altitude:
            return i
    return 0


class Atmosphere:
    """
    US Standard Atmosphere 1976 model.

    Provides atmospheric properties (temperature, pressure, density)
    as functions of geometric altitude.
    """

    # Maximum altitude for standard atmosphere model (meters)
    MAX_ALTITUDE = 86000.0

    # Altitude above which atmosphere is effectively zero
    VACUUM_ALTITUDE = 200000.0

    @staticmethod
    def temperature(altitude: float) -> float:
        """
        Compute atmospheric temperature at given altitude.

        Args:
            altitude: Geometric altitude in meters

        Returns:
            Temperature in Kelvin
        """
        if altitude < 0:
            altitude = 0

        if altitude > Atmosphere.MAX_ALTITUDE:
            # Above 86 km, use the temperature at 86 km
            # (In reality, temperature increases in thermosphere, but density is negligible)
            layer = ATMOSPHERIC_LAYERS[-1]
            h_diff = Atmosphere.MAX_ALTITUDE - layer.base_altitude
            return layer.base_temperature + layer.lapse_rate * h_diff

        layer_idx = _find_layer_index(altitude)
        layer = ATMOSPHERIC_LAYERS[layer_idx]

        h_diff = altitude - layer.base_altitude
        return layer.base_temperature + layer.lapse_rate * h_diff

    @staticmethod
    def pressure(altitude: float) -> float:
        """
        Compute atmospheric pressure at given altitude.

        Args:
            altitude: Geometric altitude in meters

        Returns:
            Pressure in Pascals
        """
        if altitude < 0:
            altitude = 0

        if altitude >= Atmosphere.VACUUM_ALTITUDE:
            return 0.0

        if altitude > Atmosphere.MAX_ALTITUDE:
            # Exponential decay above 86 km
            P_86 = Atmosphere.pressure(Atmosphere.MAX_ALTITUDE)
            T_86 = Atmosphere.temperature(Atmosphere.MAX_ALTITUDE)
            scale_height = SPECIFIC_GAS_CONSTANT_AIR * T_86 / G0
            return P_86 * math.exp(-(altitude - Atmosphere.MAX_ALTITUDE) / scale_height)

        layer_idx = _find_layer_index(altitude)
        layer = ATMOSPHERIC_LAYERS[layer_idx]
        base_pressures = _get_layer_base_pressures()

        h0 = layer.base_altitude
        T0 = layer.base_temperature
        L = layer.lapse_rate
        P0 = base_pressures[layer_idx]

        h_diff = altitude - h0

        if abs(L) < 1e-10:  # Isothermal layer
            return P0 * math.exp(-G0 * MOLAR_MASS_AIR * h_diff / (UNIVERSAL_GAS_CONSTANT * T0))
        else:  # Gradient layer
            T = T0 + L * h_diff
            return P0 * (T / T0) ** (-G0 * MOLAR_MASS_AIR / (UNIVERSAL_GAS_CONSTANT * L))

    @staticmethod
    def density(altitude: float) -> float:
        """
        Compute atmospheric density at given altitude.

        Uses ideal gas law: ρ = P / (R_specific * T)

        Args:
            altitude: Geometric altitude in meters

        Returns:
            Density in kg/m³
        """
        if altitude >= Atmosphere.VACUUM_ALTITUDE:
            return 0.0

        P = Atmosphere.pressure(altitude)
        T = Atmosphere.temperature(altitude)

        if T <= 0 or P <= 0:
            return 0.0

        return P / (SPECIFIC_GAS_CONSTANT_AIR * T)

    @staticmethod
    def properties(altitude: float) -> Tuple[float, float, float]:
        """
        Compute all atmospheric properties at given altitude.

        Args:
            altitude: Geometric altitude in meters

        Returns:
            Tuple of (temperature [K], pressure [Pa], density [kg/m³])
        """
        T = Atmosphere.temperature(altitude)
        P = Atmosphere.pressure(altitude)
        rho = P / (SPECIFIC_GAS_CONSTANT_AIR * T) if T > 0 and P > 0 else 0.0

        return T, P, rho

    @staticmethod
    def speed_of_sound(altitude: float) -> float:
        """
        Compute speed of sound at given altitude.

        a = sqrt(γ * R * T)

        Args:
            altitude: Geometric altitude in meters

        Returns:
            Speed of sound in m/s
        """
        T = Atmosphere.temperature(altitude)
        # γ = 1.4 for air
        return math.sqrt(1.4 * SPECIFIC_GAS_CONSTANT_AIR * T)

    @staticmethod
    def dynamic_pressure(altitude: float, velocity: float) -> float:
        """
        Compute dynamic pressure (q = 0.5 * ρ * v²).

        Args:
            altitude: Geometric altitude in meters
            velocity: Speed in m/s

        Returns:
            Dynamic pressure in Pascals
        """
        rho = Atmosphere.density(altitude)
        return 0.5 * rho * velocity ** 2

    @staticmethod
    def mach_number(altitude: float, velocity: float) -> float:
        """
        Compute Mach number at given altitude and velocity.

        Args:
            altitude: Geometric altitude in meters
            velocity: Speed in m/s

        Returns:
            Mach number (dimensionless)
        """
        a = Atmosphere.speed_of_sound(altitude)
        return velocity / a if a > 0 else 0.0
