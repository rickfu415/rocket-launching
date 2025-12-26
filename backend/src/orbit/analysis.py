"""
Orbital analysis and success determination.
"""

from dataclasses import dataclass
from typing import Optional

from .elements import OrbitalElements
from ..physics.constants import EARTH_RADIUS_MEAN, KARMAN_LINE


@dataclass
class OrbitResult:
    """Result of orbit analysis."""

    success: bool
    reason: str
    orbit_type: str = "none"  # "none", "suborbital", "leo", "meo", "geo", "escape"
    warnings: list = None

    def __post_init__(self):
        if self.warnings is None:
            self.warnings = []

    def to_dict(self) -> dict:
        return {
            "success": bool(self.success),
            "reason": str(self.reason),
            "orbit_type": str(self.orbit_type),
            "warnings": list(self.warnings) if self.warnings else [],
        }


# Altitude thresholds (meters)
MIN_ORBIT_ALTITUDE = 100_000  # 100 km - above most of atmosphere
LEO_MAX_ALTITUDE = 2_000_000  # 2000 km
MEO_MAX_ALTITUDE = 35_786_000  # Just below GEO
GEO_ALTITUDE = 35_786_000  # Geostationary altitude
GEO_TOLERANCE = 100_000  # ±100 km for GEO classification


def analyze_orbit(elements: OrbitalElements) -> OrbitResult:
    """
    Analyze orbital elements to determine mission success.

    Success criteria:
    1. Periapsis above minimum altitude (100 km)
    2. Eccentricity < 1 (bound orbit)
    3. No immediate reentry predicted

    Args:
        elements: Computed orbital elements

    Returns:
        OrbitResult with success status and details
    """
    warnings = []

    # Check for hyperbolic/escape trajectory
    if elements.eccentricity >= 1:
        if elements.specific_energy > 0:
            return OrbitResult(
                success=True,
                reason="Escape trajectory achieved",
                orbit_type="escape",
            )
        else:
            return OrbitResult(
                success=False,
                reason="Parabolic trajectory - marginally bound",
                orbit_type="none",
            )

    # Check periapsis altitude
    periapsis_alt = elements.periapsis_altitude

    if periapsis_alt < 0:
        return OrbitResult(
            success=False,
            reason=f"Periapsis below surface ({periapsis_alt/1000:.1f} km)",
            orbit_type="suborbital",
        )

    if periapsis_alt < KARMAN_LINE:
        return OrbitResult(
            success=False,
            reason=f"Periapsis in atmosphere ({periapsis_alt/1000:.1f} km) - will reenter",
            orbit_type="suborbital",
        )

    if periapsis_alt < MIN_ORBIT_ALTITUDE:
        warnings.append(f"Low periapsis ({periapsis_alt/1000:.1f} km) - orbit may decay quickly")

    # Check apoapsis for orbit classification
    apoapsis_alt = elements.apoapsis_altitude

    # Determine orbit type
    if apoapsis_alt <= LEO_MAX_ALTITUDE:
        orbit_type = "leo"
        orbit_name = "Low Earth Orbit"
    elif apoapsis_alt <= MEO_MAX_ALTITUDE:
        orbit_type = "meo"
        orbit_name = "Medium Earth Orbit"
    elif abs(apoapsis_alt - GEO_ALTITUDE) < GEO_TOLERANCE and abs(periapsis_alt - GEO_ALTITUDE) < GEO_TOLERANCE:
        orbit_type = "geo"
        orbit_name = "Geostationary Orbit"
    else:
        orbit_type = "heo"
        orbit_name = "High Earth Orbit"

    # Check for highly elliptical orbit
    if elements.eccentricity > 0.5:
        warnings.append(f"Highly elliptical orbit (e={elements.eccentricity:.3f})")

    # Success!
    return OrbitResult(
        success=True,
        reason=f"{orbit_name} achieved (Pe={periapsis_alt/1000:.1f} km, Ap={apoapsis_alt/1000:.1f} km)",
        orbit_type=orbit_type,
        warnings=warnings,
    )


def compare_to_target(
    elements: OrbitalElements,
    target_altitude: float,
    target_inclination: float,
    altitude_tolerance: float = 50_000,  # 50 km
    inclination_tolerance: float = 1.0,  # 1 degree
) -> dict:
    """
    Compare achieved orbit to target parameters.

    Args:
        elements: Achieved orbital elements
        target_altitude: Target circular orbit altitude (meters)
        target_inclination: Target inclination (degrees)
        altitude_tolerance: Acceptable altitude error (meters)
        inclination_tolerance: Acceptable inclination error (degrees)

    Returns:
        Dictionary with comparison results
    """
    # Altitude comparison (use average of periapsis and apoapsis for elliptical)
    if elements.eccentricity < 1:
        avg_altitude = (elements.periapsis_altitude + elements.apoapsis_altitude) / 2
    else:
        avg_altitude = elements.periapsis_altitude

    altitude_error = abs(avg_altitude - target_altitude)
    altitude_ok = altitude_error <= altitude_tolerance

    # Inclination comparison
    inclination_error = abs(elements.inclination_degrees - target_inclination)
    inclination_ok = inclination_error <= inclination_tolerance

    # Eccentricity (target is circular, e=0)
    eccentricity_error = elements.eccentricity
    eccentricity_ok = eccentricity_error < 0.1  # Reasonable for insertion orbit

    return {
        "altitude_achieved": avg_altitude,
        "altitude_target": target_altitude,
        "altitude_error": altitude_error,
        "altitude_ok": altitude_ok,
        "inclination_achieved": elements.inclination_degrees,
        "inclination_target": target_inclination,
        "inclination_error": inclination_error,
        "inclination_ok": inclination_ok,
        "eccentricity": elements.eccentricity,
        "eccentricity_ok": eccentricity_ok,
        "overall_success": altitude_ok and inclination_ok,
    }


def predict_orbit_lifetime(elements: OrbitalElements) -> Optional[float]:
    """
    Rough estimate of orbit lifetime based on periapsis altitude.

    This is a very simplified model. Real orbit decay depends on
    solar activity, satellite geometry, and many other factors.

    Args:
        elements: Orbital elements

    Returns:
        Estimated lifetime in days, or None if not applicable
    """
    if elements.eccentricity >= 1:
        return None  # Escape trajectory

    periapsis_alt = elements.periapsis_altitude

    if periapsis_alt < 0:
        return 0  # Immediate impact

    if periapsis_alt < 200_000:  # 200 km
        # Very short lifetime, days to weeks
        return max(1, periapsis_alt / 10000)  # Rough estimate

    if periapsis_alt < 400_000:  # 400 km
        # Months to years
        return (periapsis_alt - 200_000) / 1000 * 30  # Rough estimate

    if periapsis_alt < 800_000:  # 800 km
        # Years to decades
        return (periapsis_alt - 400_000) / 1000 * 365  # Rough estimate

    # Above 800 km: centuries or more
    return 36500  # ~100 years placeholder


def calculate_delta_v_to_circularize(elements: OrbitalElements) -> float:
    """
    Calculate delta-v needed to circularize at apoapsis.

    For an elliptical orbit, the circularization burn at apoapsis is:
    Δv = v_circular - v_apoapsis

    Args:
        elements: Current orbital elements

    Returns:
        Required delta-v in m/s
    """
    import math
    from ..physics.constants import MU_EARTH

    if elements.eccentricity >= 1 or elements.eccentricity < 0.001:
        return 0.0  # Already circular or hyperbolic

    # Velocity at apoapsis
    v_apoapsis = elements.velocity_at_apoapsis

    # Circular velocity at apoapsis altitude
    v_circular = math.sqrt(MU_EARTH / elements.apoapsis)

    return abs(v_circular - v_apoapsis)
