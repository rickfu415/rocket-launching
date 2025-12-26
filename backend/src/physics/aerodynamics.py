"""
Aerodynamic drag calculations for rocket simulation.
"""

import math
import numpy as np
from .atmosphere import Atmosphere


def drag_force(
    velocity: np.ndarray,
    altitude: float,
    cd: float,
    area: float
) -> np.ndarray:
    """
    Compute aerodynamic drag force on the rocket.

    F_drag = -0.5 * ρ * |v|² * Cd * A * v_hat

    Drag opposes the direction of motion.

    Args:
        velocity: Velocity vector [vx, vy, vz] in m/s (ECI frame)
        altitude: Geometric altitude in meters
        cd: Drag coefficient (dimensionless)
        area: Reference area (cross-sectional) in m²

    Returns:
        Drag force vector [Fx, Fy, Fz] in Newtons
    """
    v_mag = np.linalg.norm(velocity)

    # No drag if not moving
    if v_mag < 1e-6:
        return np.zeros(3)

    # Get atmospheric density
    rho = Atmosphere.density(altitude)

    # No drag in vacuum
    if rho < 1e-15:
        return np.zeros(3)

    # Drag magnitude: F = 0.5 * ρ * v² * Cd * A
    drag_magnitude = 0.5 * rho * v_mag ** 2 * cd * area

    # Direction: opposite to velocity
    v_hat = velocity / v_mag

    return -drag_magnitude * v_hat


def drag_acceleration(
    velocity: np.ndarray,
    altitude: float,
    cd: float,
    area: float,
    mass: float
) -> np.ndarray:
    """
    Compute aerodynamic drag acceleration.

    a_drag = F_drag / m

    Args:
        velocity: Velocity vector [vx, vy, vz] in m/s
        altitude: Geometric altitude in meters
        cd: Drag coefficient (dimensionless)
        area: Reference area in m²
        mass: Current vehicle mass in kg

    Returns:
        Acceleration vector [ax, ay, az] in m/s²
    """
    if mass <= 0:
        return np.zeros(3)

    F_drag = drag_force(velocity, altitude, cd, area)
    return F_drag / mass


def reference_area_from_diameter(diameter: float) -> float:
    """
    Compute reference area (cross-sectional) from rocket diameter.

    A = π * (d/2)²

    Args:
        diameter: Rocket diameter in meters

    Returns:
        Reference area in m²
    """
    return math.pi * (diameter / 2) ** 2


def dynamic_pressure(velocity: np.ndarray, altitude: float) -> float:
    """
    Compute dynamic pressure (Q or q).

    q = 0.5 * ρ * v²

    This is important for structural loads (Max-Q monitoring).

    Args:
        velocity: Velocity vector in m/s
        altitude: Geometric altitude in meters

    Returns:
        Dynamic pressure in Pascals
    """
    v_mag = np.linalg.norm(velocity)
    rho = Atmosphere.density(altitude)
    return 0.5 * rho * v_mag ** 2


def mach_number(velocity: np.ndarray, altitude: float) -> float:
    """
    Compute Mach number.

    M = v / a

    Args:
        velocity: Velocity vector in m/s
        altitude: Geometric altitude in meters

    Returns:
        Mach number (dimensionless)
    """
    v_mag = np.linalg.norm(velocity)
    return Atmosphere.mach_number(altitude, v_mag)


def drag_coefficient_supersonic(mach: float, cd_subsonic: float = 0.3) -> float:
    """
    Estimate drag coefficient variation with Mach number.

    This is a simplified model. Real rockets use wind tunnel data.

    - Subsonic (M < 0.8): Cd ≈ constant
    - Transonic (0.8 < M < 1.2): Cd increases significantly (wave drag)
    - Supersonic (M > 1.2): Cd decreases gradually

    Args:
        mach: Mach number
        cd_subsonic: Subsonic drag coefficient

    Returns:
        Estimated drag coefficient
    """
    if mach < 0.8:
        return cd_subsonic
    elif mach < 1.0:
        # Transonic rise
        t = (mach - 0.8) / 0.2
        return cd_subsonic * (1 + 0.8 * t)
    elif mach < 1.2:
        # Peak at transonic
        t = (mach - 1.0) / 0.2
        peak_cd = cd_subsonic * 1.8
        return peak_cd * (1 - 0.2 * t)
    elif mach < 3.0:
        # Supersonic decrease
        t = (mach - 1.2) / 1.8
        return cd_subsonic * (1.6 - 0.4 * t)
    else:
        # High supersonic
        return cd_subsonic * 1.2
