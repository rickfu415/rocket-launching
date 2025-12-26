"""
Earth gravity model for rocket simulation.
Implements inverse square law with optional J2 perturbation.
"""

import numpy as np
from .constants import MU_EARTH, EARTH_RADIUS_MEAN, G0


def gravity_acceleration(position: np.ndarray) -> np.ndarray:
    """
    Compute gravitational acceleration at given ECI position.

    Uses the inverse square law: g = GM/r²
    Direction: toward Earth center (negative radial)

    Args:
        position: 3D position vector in ECI frame [x, y, z] in meters

    Returns:
        Acceleration vector [ax, ay, az] in m/s²
    """
    r = np.linalg.norm(position)

    if r < EARTH_RADIUS_MEAN:
        # Inside Earth - should not happen in normal simulation
        # Return surface gravity pointing toward center
        r = EARTH_RADIUS_MEAN

    g_magnitude = MU_EARTH / (r ** 2)

    # Direction is toward Earth center (negative of position unit vector)
    direction = -position / r

    return g_magnitude * direction


def gravity_magnitude_at_altitude(altitude: float) -> float:
    """
    Compute gravity magnitude at given altitude above sea level.

    Args:
        altitude: Height above mean sea level in meters

    Returns:
        Gravitational acceleration magnitude in m/s²
    """
    r = EARTH_RADIUS_MEAN + altitude
    return MU_EARTH / (r ** 2)


def surface_gravity() -> float:
    """
    Return standard gravitational acceleration at Earth's surface.

    Returns:
        g₀ = 9.80665 m/s²
    """
    return G0


# J2 perturbation coefficient for Earth
J2 = 1.08263e-3


def gravity_acceleration_j2(position: np.ndarray) -> np.ndarray:
    """
    Compute gravitational acceleration with J2 oblateness correction.

    The J2 term accounts for Earth's equatorial bulge, which causes
    the gravitational field to deviate from a perfect sphere.
    This is important for accurate orbital predictions.

    Args:
        position: 3D position vector in ECI frame [x, y, z] in meters

    Returns:
        Acceleration vector [ax, ay, az] in m/s² including J2 effects
    """
    x, y, z = position
    r = np.linalg.norm(position)

    if r < EARTH_RADIUS_MEAN:
        r = EARTH_RADIUS_MEAN

    # Base gravitational parameter
    mu_r3 = MU_EARTH / (r ** 3)

    # J2 correction factor
    Re_r = EARTH_RADIUS_MEAN / r
    j2_factor = 1.5 * J2 * (Re_r ** 2)
    z_r = z / r
    z_r2 = z_r ** 2

    # Compute acceleration components with J2 correction
    common = mu_r3 * (1 + j2_factor * (1 - 5 * z_r2))

    ax = -x * common
    ay = -y * common
    az = -z * mu_r3 * (1 + j2_factor * (3 - 5 * z_r2))

    return np.array([ax, ay, az])
