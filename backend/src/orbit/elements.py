"""
Orbital elements calculation from state vectors.
"""

import math
from dataclasses import dataclass
from typing import Optional
import numpy as np

from ..physics.constants import MU_EARTH, EARTH_RADIUS_MEAN


@dataclass
class OrbitalElements:
    """
    Classical orbital elements (Keplerian elements).

    These six elements uniquely define an orbit:
    - Semi-major axis (a): Size of orbit
    - Eccentricity (e): Shape (0 = circular, <1 = elliptical, 1 = parabolic, >1 = hyperbolic)
    - Inclination (i): Tilt relative to equatorial plane
    - RAAN (Ω): Right ascension of ascending node
    - Argument of periapsis (ω): Orientation of ellipse in orbital plane
    - True anomaly (ν): Position along orbit
    """

    semi_major_axis: float  # meters
    eccentricity: float  # dimensionless
    inclination: float  # radians
    raan: float  # Right Ascension of Ascending Node (radians)
    argument_of_periapsis: float  # radians
    true_anomaly: float  # radians

    # Derived quantities
    specific_energy: float  # J/kg
    specific_angular_momentum: float  # m²/s

    @property
    def periapsis(self) -> float:
        """Periapsis distance from Earth center (meters)."""
        if self.eccentricity >= 1:
            # Hyperbolic or parabolic
            return self.semi_major_axis * (1 - self.eccentricity)
        return self.semi_major_axis * (1 - self.eccentricity)

    @property
    def apoapsis(self) -> float:
        """Apoapsis distance from Earth center (meters)."""
        if self.eccentricity >= 1:
            # Hyperbolic: no apoapsis
            return float('inf')
        return self.semi_major_axis * (1 + self.eccentricity)

    @property
    def periapsis_altitude(self) -> float:
        """Periapsis altitude above Earth surface (meters)."""
        return self.periapsis - EARTH_RADIUS_MEAN

    @property
    def apoapsis_altitude(self) -> float:
        """Apoapsis altitude above Earth surface (meters)."""
        if self.eccentricity >= 1:
            return float('inf')
        return self.apoapsis - EARTH_RADIUS_MEAN

    @property
    def orbital_period(self) -> float:
        """Orbital period (seconds). Infinite for non-elliptical orbits."""
        if self.eccentricity >= 1 or self.semi_major_axis <= 0:
            return float('inf')
        return 2 * math.pi * math.sqrt(self.semi_major_axis**3 / MU_EARTH)

    @property
    def inclination_degrees(self) -> float:
        """Inclination in degrees."""
        return math.degrees(self.inclination)

    @property
    def is_elliptical(self) -> bool:
        """True if orbit is elliptical (bound)."""
        return 0 <= self.eccentricity < 1

    @property
    def is_circular(self) -> bool:
        """True if orbit is approximately circular."""
        return self.eccentricity < 0.01

    @property
    def is_hyperbolic(self) -> bool:
        """True if trajectory is hyperbolic (escape)."""
        return self.eccentricity >= 1

    @property
    def velocity_at_periapsis(self) -> float:
        """Velocity at periapsis (m/s)."""
        if self.semi_major_axis <= 0:
            return 0.0
        return math.sqrt(MU_EARTH * (2/self.periapsis - 1/self.semi_major_axis))

    @property
    def velocity_at_apoapsis(self) -> float:
        """Velocity at apoapsis (m/s)."""
        if self.eccentricity >= 1 or self.semi_major_axis <= 0:
            return 0.0
        return math.sqrt(MU_EARTH * (2/self.apoapsis - 1/self.semi_major_axis))

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            "semi_major_axis": float(self.semi_major_axis),
            "eccentricity": float(self.eccentricity),
            "inclination": float(self.inclination_degrees),
            "raan": float(math.degrees(self.raan)),
            "argument_of_periapsis": float(math.degrees(self.argument_of_periapsis)),
            "true_anomaly": float(math.degrees(self.true_anomaly)),
            "periapsis_altitude": float(self.periapsis_altitude),
            "apoapsis_altitude": float(self.apoapsis_altitude) if self.eccentricity < 1 else None,
            "orbital_period": float(self.orbital_period) if self.eccentricity < 1 else None,
            "is_elliptical": bool(self.is_elliptical),
            "specific_energy": float(self.specific_energy),
        }


def compute_orbital_elements(
    position: np.ndarray,
    velocity: np.ndarray,
) -> OrbitalElements:
    """
    Compute orbital elements from position and velocity vectors.

    Uses the classical algorithm for converting state vectors to
    Keplerian orbital elements.

    Args:
        position: Position vector in ECI frame [x, y, z] (meters)
        velocity: Velocity vector in ECI frame [vx, vy, vz] (m/s)

    Returns:
        OrbitalElements dataclass
    """
    r = np.linalg.norm(position)
    v = np.linalg.norm(velocity)

    # Specific angular momentum vector: h = r × v
    h_vec = np.cross(position, velocity)
    h = np.linalg.norm(h_vec)

    # Node vector: n = k × h (k is unit vector along z-axis)
    k = np.array([0, 0, 1])
    n_vec = np.cross(k, h_vec)
    n = np.linalg.norm(n_vec)

    # Eccentricity vector
    e_vec = ((v**2 - MU_EARTH/r) * position - np.dot(position, velocity) * velocity) / MU_EARTH
    e = np.linalg.norm(e_vec)

    # Specific orbital energy
    energy = v**2 / 2 - MU_EARTH / r

    # Semi-major axis
    if abs(e - 1.0) < 1e-10:
        # Parabolic
        a = float('inf')
    else:
        a = -MU_EARTH / (2 * energy)

    # Inclination
    if h > 1e-10:
        i = math.acos(np.clip(h_vec[2] / h, -1, 1))
    else:
        i = 0.0

    # Right Ascension of Ascending Node (RAAN)
    if n > 1e-10:
        omega = math.acos(np.clip(n_vec[0] / n, -1, 1))
        if n_vec[1] < 0:
            omega = 2 * math.pi - omega
    else:
        omega = 0.0

    # Argument of periapsis
    if n > 1e-10 and e > 1e-10:
        w = math.acos(np.clip(np.dot(n_vec, e_vec) / (n * e), -1, 1))
        if e_vec[2] < 0:
            w = 2 * math.pi - w
    else:
        w = 0.0

    # True anomaly
    if e > 1e-10:
        nu = math.acos(np.clip(np.dot(e_vec, position) / (e * r), -1, 1))
        if np.dot(position, velocity) < 0:
            nu = 2 * math.pi - nu
    else:
        # Circular orbit: measure from ascending node
        if n > 1e-10:
            nu = math.acos(np.clip(np.dot(n_vec, position) / (n * r), -1, 1))
            if position[2] < 0:
                nu = 2 * math.pi - nu
        else:
            # Equatorial circular: measure from x-axis
            nu = math.acos(np.clip(position[0] / r, -1, 1))
            if position[1] < 0:
                nu = 2 * math.pi - nu

    return OrbitalElements(
        semi_major_axis=a,
        eccentricity=e,
        inclination=i,
        raan=omega,
        argument_of_periapsis=w,
        true_anomaly=nu,
        specific_energy=energy,
        specific_angular_momentum=h,
    )


def orbital_velocity_circular(altitude: float) -> float:
    """
    Compute velocity for a circular orbit at given altitude.

    v = sqrt(μ / r)

    Args:
        altitude: Altitude above Earth surface (meters)

    Returns:
        Orbital velocity (m/s)
    """
    r = EARTH_RADIUS_MEAN + altitude
    return math.sqrt(MU_EARTH / r)


def orbital_period_at_altitude(altitude: float) -> float:
    """
    Compute orbital period for circular orbit at given altitude.

    T = 2π * sqrt(r³ / μ)

    Args:
        altitude: Altitude above Earth surface (meters)

    Returns:
        Orbital period (seconds)
    """
    r = EARTH_RADIUS_MEAN + altitude
    return 2 * math.pi * math.sqrt(r**3 / MU_EARTH)
