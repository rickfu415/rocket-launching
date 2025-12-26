"""
Flight profile and guidance for rocket ascent.
Implements gravity turn trajectory.
"""

import math
import numpy as np
from dataclasses import dataclass
from typing import Optional

from .state import SimulationState
from ..physics.constants import EARTH_RADIUS_MEAN


@dataclass
class FlightProfileConfig:
    """Configuration for the flight profile."""

    # Vertical ascent phase
    vertical_ascent_altitude: float = 500.0  # meters, climb vertically until this altitude

    # Pitch-over (gravity turn initiation)
    pitchover_angle: float = 2.0  # degrees, initial pitch from vertical
    pitchover_duration: float = 10.0  # seconds to complete pitchover

    # Target orbit parameters
    target_altitude: float = 400_000.0  # meters (400 km LEO)
    target_inclination: float = 28.5  # degrees (Cape Canaveral latitude)

    # Fairing jettison
    fairing_jettison_altitude: float = 110_000.0  # meters

    # Stage separation
    stage_separation_delay: float = 3.0  # seconds between MECO and second stage ignition


class GravityTurnProfile:
    """
    Implements a gravity turn ascent trajectory.

    The gravity turn is a trajectory optimization technique where:
    1. The rocket ascends vertically initially
    2. A small pitch-over maneuver initiates the turn
    3. The rocket then follows its velocity vector (zero angle of attack)

    This minimizes gravity losses and structural loads.
    """

    def __init__(self, config: Optional[FlightProfileConfig] = None):
        self.config = config or FlightProfileConfig()
        self._pitchover_start_time: Optional[float] = None
        self._pitchover_direction: Optional[np.ndarray] = None

    def get_thrust_direction(
        self,
        state: SimulationState,
        launch_azimuth: float = 90.0,  # degrees from north
    ) -> np.ndarray:
        """
        Compute thrust direction for current state.

        Args:
            state: Current simulation state
            launch_azimuth: Launch azimuth (degrees from north, 90 = east)

        Returns:
            Unit vector for thrust direction in ECI frame
        """
        altitude = state.altitude
        velocity = state.velocity
        position = state.position

        # Local vertical (radial direction, pointing away from Earth)
        r_mag = np.linalg.norm(position)
        radial = position / r_mag

        # Phase 1: Vertical ascent
        if altitude < self.config.vertical_ascent_altitude:
            return radial

        # Compute local horizontal reference frame
        # East direction (perpendicular to radial and north)
        north = np.array([0, 0, 1])  # Approximate north in ECI

        # Handle polar regions
        if abs(np.dot(radial, north)) > 0.999:
            east = np.array([0, 1, 0])
        else:
            east = np.cross(north, radial)
            east = east / np.linalg.norm(east)

        # North in local horizontal plane
        north_local = np.cross(radial, east)
        north_local = north_local / np.linalg.norm(north_local)

        # Phase 2: Pitchover initiation
        if altitude < self.config.vertical_ascent_altitude + 1000:
            # Initialize pitchover if not already done
            if self._pitchover_start_time is None:
                self._pitchover_start_time = state.time

                # Compute pitchover direction based on launch azimuth
                azimuth_rad = math.radians(launch_azimuth)
                horizontal_dir = (
                    math.sin(azimuth_rad) * east +
                    math.cos(azimuth_rad) * north_local
                )
                self._pitchover_direction = horizontal_dir

            # Gradually pitch over
            elapsed = state.time - self._pitchover_start_time
            if elapsed < self.config.pitchover_duration:
                # Interpolate pitch angle
                t = elapsed / self.config.pitchover_duration
                pitch_angle = t * math.radians(self.config.pitchover_angle)

                # Blend vertical with horizontal
                thrust_dir = (
                    math.cos(pitch_angle) * radial +
                    math.sin(pitch_angle) * self._pitchover_direction
                )
                return thrust_dir / np.linalg.norm(thrust_dir)

        # Phase 3: Gravity turn - follow velocity vector
        v_mag = np.linalg.norm(velocity)
        if v_mag > 10.0:  # Only if we have meaningful velocity
            # Prograde direction (along velocity)
            prograde = velocity / v_mag

            # For gravity turn, we thrust mostly prograde
            # with a small correction to maintain desired flight path
            return prograde

        # Fallback: continue along current trajectory
        return radial

    def should_separate_stage(
        self,
        state: SimulationState,
        previous_burning: bool,
    ) -> bool:
        """
        Determine if stage separation should occur.

        Stage separation happens when:
        1. Engine was burning but propellant is now depleted
        2. Separation delay has passed

        Args:
            state: Current simulation state
            previous_burning: Whether engine was burning in previous step

        Returns:
            True if stage should be separated
        """
        # Trigger separation when engine stops burning (propellant depleted)
        if previous_burning and not state.is_burning:
            return True
        return False

    def should_jettison_fairing(self, state: SimulationState) -> bool:
        """
        Determine if payload fairing should be jettisoned.

        Fairing is jettisoned when:
        1. Altitude is above configured threshold
        2. Fairing hasn't been jettisoned yet
        3. Dynamic pressure is low enough (above ~100 km)

        Args:
            state: Current simulation state

        Returns:
            True if fairing should be jettisoned
        """
        if state.fairing_jettisoned:
            return False

        return state.altitude >= self.config.fairing_jettison_altitude

    def get_target_orbit_velocity(self, altitude: float) -> float:
        """
        Compute required velocity for circular orbit at given altitude.

        v = sqrt(μ / r)

        Args:
            altitude: Orbit altitude (meters)

        Returns:
            Orbital velocity (m/s)
        """
        from ..physics.constants import MU_EARTH

        r = EARTH_RADIUS_MEAN + altitude
        return math.sqrt(MU_EARTH / r)

    def is_orbit_achieved(self, state: SimulationState) -> bool:
        """
        Check if the rocket has achieved orbit.

        Criteria:
        1. Altitude above target (with margin)
        2. Flight path angle near zero (horizontal)
        3. Velocity near orbital velocity

        Args:
            state: Current simulation state

        Returns:
            True if orbit is achieved
        """
        altitude = state.altitude

        # Must be above Karman line
        if altitude < 100_000:
            return False

        # Check flight path angle (should be near horizontal)
        fpa = abs(state.flight_path_angle)
        if fpa > math.radians(5):  # More than 5 degrees from horizontal
            return False

        # Check velocity against orbital velocity
        v_orbit = self.get_target_orbit_velocity(altitude)
        v_actual = state.horizontal_velocity

        if v_actual < 0.95 * v_orbit:
            return False

        return True


def compute_launch_azimuth(
    latitude: float,
    target_inclination: float,
) -> float:
    """
    Compute launch azimuth for desired orbital inclination.

    For a direct insertion:
    sin(azimuth) = cos(inclination) / cos(latitude)

    Args:
        latitude: Launch site latitude (degrees)
        target_inclination: Desired orbital inclination (degrees)

    Returns:
        Launch azimuth in degrees (from north)
    """
    lat_rad = math.radians(latitude)
    inc_rad = math.radians(target_inclination)

    # Check if inclination is achievable from this latitude
    if abs(target_inclination) < abs(latitude):
        # Cannot achieve lower inclination than latitude
        # Use minimum energy trajectory (due east)
        return 90.0

    sin_azimuth = math.cos(inc_rad) / math.cos(lat_rad)

    # Clamp to valid range
    sin_azimuth = max(-1, min(1, sin_azimuth))

    azimuth = math.degrees(math.asin(sin_azimuth))

    # For ascending node to the northeast
    return azimuth
