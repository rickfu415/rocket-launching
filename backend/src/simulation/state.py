"""
Simulation state representation.
"""

import math
from dataclasses import dataclass, field
from typing import Optional
import numpy as np

from ..physics.constants import EARTH_RADIUS_MEAN


@dataclass
class SimulationState:
    """
    Complete state of the rocket at a point in time.

    Uses Earth-Centered Inertial (ECI) coordinate frame:
    - Origin at Earth's center
    - X-axis points toward vernal equinox
    - Z-axis points toward north pole
    - Y-axis completes right-handed system
    """

    time: float  # Mission elapsed time (seconds)
    position: np.ndarray  # [x, y, z] in meters (ECI frame)
    velocity: np.ndarray  # [vx, vy, vz] in m/s (ECI frame)
    mass: float  # Current total mass (kg)
    stage_index: int  # Current active stage (0 = first stage)
    stage_propellant: float  # Remaining propellant in current stage (kg)
    is_burning: bool = True  # Whether engine is firing
    fairing_jettisoned: bool = False  # Whether fairing has been released

    @property
    def altitude(self) -> float:
        """Altitude above Earth's surface (meters)."""
        return np.linalg.norm(self.position) - EARTH_RADIUS_MEAN

    @property
    def speed(self) -> float:
        """Magnitude of velocity vector (m/s)."""
        return np.linalg.norm(self.velocity)

    @property
    def radial_velocity(self) -> float:
        """Velocity component in radial direction (m/s)."""
        r_hat = self.position / np.linalg.norm(self.position)
        return np.dot(self.velocity, r_hat)

    @property
    def horizontal_velocity(self) -> float:
        """Velocity component perpendicular to radial (m/s)."""
        v_radial = self.radial_velocity
        v_total = self.speed
        return math.sqrt(max(0, v_total**2 - v_radial**2))

    @property
    def flight_path_angle(self) -> float:
        """
        Flight path angle (radians).

        Angle between velocity vector and local horizontal.
        Positive = climbing, Negative = descending.
        """
        if self.speed < 1e-6:
            return 0.0

        v_radial = self.radial_velocity
        v_horizontal = self.horizontal_velocity

        if v_horizontal < 1e-6:
            return math.pi / 2 if v_radial > 0 else -math.pi / 2

        return math.atan2(v_radial, v_horizontal)

    @property
    def latitude(self) -> float:
        """Latitude in degrees (geocentric)."""
        r = np.linalg.norm(self.position)
        if r < 1e-6:
            return 0.0
        return math.degrees(math.asin(self.position[2] / r))

    @property
    def longitude(self) -> float:
        """Longitude in degrees (geocentric)."""
        return math.degrees(math.atan2(self.position[1], self.position[0]))

    def to_dict(self) -> dict:
        """Convert state to dictionary for JSON serialization."""
        return {
            "time": float(self.time),
            "position": self.position.tolist(),
            "velocity": self.velocity.tolist(),
            "altitude": float(self.altitude),
            "speed": float(self.speed),
            "mass": float(self.mass),
            "stage_index": int(self.stage_index),
            "stage_propellant": float(self.stage_propellant),
            "is_burning": bool(self.is_burning),
            "fairing_jettisoned": bool(self.fairing_jettisoned),
            "flight_path_angle": float(math.degrees(self.flight_path_angle)),
            "latitude": float(self.latitude),
            "longitude": float(self.longitude),
        }

    def copy(self) -> "SimulationState":
        """Create a deep copy of this state."""
        return SimulationState(
            time=self.time,
            position=self.position.copy(),
            velocity=self.velocity.copy(),
            mass=self.mass,
            stage_index=self.stage_index,
            stage_propellant=self.stage_propellant,
            is_burning=self.is_burning,
            fairing_jettisoned=self.fairing_jettisoned,
        )


def create_initial_state(
    rocket,
    latitude: float,
    longitude: float,
    altitude: float = 0.0
) -> SimulationState:
    """
    Create initial state for a rocket on the launch pad.

    Args:
        rocket: Rocket configuration
        latitude: Launch site latitude (degrees)
        longitude: Launch site longitude (degrees)
        altitude: Launch site altitude above sea level (meters)

    Returns:
        Initial simulation state
    """
    # Convert to radians
    lat_rad = math.radians(latitude)
    lon_rad = math.radians(longitude)

    # Position on Earth's surface
    r = EARTH_RADIUS_MEAN + altitude
    x = r * math.cos(lat_rad) * math.cos(lon_rad)
    y = r * math.cos(lat_rad) * math.sin(lon_rad)
    z = r * math.sin(lat_rad)

    position = np.array([x, y, z])

    # Initial velocity from Earth's rotation
    # v = ω × r, where ω is Earth's rotation vector (along z-axis)
    # For simplicity, we start at rest in the ECI frame
    # (the rotation effect is small and can be added later)
    velocity = np.array([0.0, 0.0, 0.0])

    # Initial mass and propellant
    total_mass = rocket.total_mass
    first_stage = rocket.first_stage
    initial_propellant = first_stage.propellant_mass

    return SimulationState(
        time=0.0,
        position=position,
        velocity=velocity,
        mass=total_mass,
        stage_index=0,
        stage_propellant=initial_propellant,
        is_burning=True,
        fairing_jettisoned=False,
    )
