"""
Rocket stage model.
"""

import math
from dataclasses import dataclass, field
from typing import Optional

from ..physics.constants import G0, SEA_LEVEL_PRESSURE
from ..physics.aerodynamics import reference_area_from_diameter


@dataclass
class Stage:
    """
    Represents a single rocket stage.

    Attributes:
        name: Stage identifier
        dry_mass: Mass without propellant (kg)
        propellant_mass: Initial propellant mass (kg)
        thrust_sl: Thrust at sea level (N)
        thrust_vac: Thrust in vacuum (N)
        isp_sl: Specific impulse at sea level (s)
        isp_vac: Specific impulse in vacuum (s)
        burn_time: Expected burn duration (s)
        diameter: Stage diameter for drag calculation (m)
        cd: Drag coefficient (dimensionless)
        num_engines: Number of engines (for display)
    """

    name: str
    dry_mass: float
    propellant_mass: float
    thrust_sl: float
    thrust_vac: float
    isp_sl: float
    isp_vac: float
    burn_time: float
    diameter: float
    cd: float = 0.3
    num_engines: int = 1

    @property
    def total_mass(self) -> float:
        """Total mass of stage (dry + propellant)."""
        return self.dry_mass + self.propellant_mass

    @property
    def mass_ratio(self) -> float:
        """Mass ratio (initial / final mass)."""
        return self.total_mass / self.dry_mass

    @property
    def delta_v(self) -> float:
        """
        Theoretical delta-v of this stage (Tsiolkovsky equation).

        ΔV = Isp * g₀ * ln(m₀ / m_f)

        Uses vacuum Isp for maximum theoretical value.
        """
        return self.isp_vac * G0 * math.log(self.mass_ratio)

    @property
    def reference_area(self) -> float:
        """Cross-sectional area for drag calculation (m²)."""
        return reference_area_from_diameter(self.diameter)

    @property
    def mass_flow_rate_sl(self) -> float:
        """Propellant mass flow rate at sea level (kg/s)."""
        return self.thrust_sl / (self.isp_sl * G0)

    @property
    def mass_flow_rate_vac(self) -> float:
        """Propellant mass flow rate in vacuum (kg/s)."""
        return self.thrust_vac / (self.isp_vac * G0)

    def thrust_at_pressure(self, pressure: float) -> float:
        """
        Interpolate thrust based on ambient pressure.

        Thrust increases as pressure decreases (more efficient nozzle expansion).

        Args:
            pressure: Ambient atmospheric pressure (Pa)

        Returns:
            Thrust in Newtons
        """
        if pressure >= SEA_LEVEL_PRESSURE:
            return self.thrust_sl
        if pressure <= 0:
            return self.thrust_vac

        # Linear interpolation between sea level and vacuum
        t = 1.0 - (pressure / SEA_LEVEL_PRESSURE)
        return self.thrust_sl + t * (self.thrust_vac - self.thrust_sl)

    def isp_at_pressure(self, pressure: float) -> float:
        """
        Interpolate specific impulse based on ambient pressure.

        Args:
            pressure: Ambient atmospheric pressure (Pa)

        Returns:
            Specific impulse in seconds
        """
        if pressure >= SEA_LEVEL_PRESSURE:
            return self.isp_sl
        if pressure <= 0:
            return self.isp_vac

        # Linear interpolation
        t = 1.0 - (pressure / SEA_LEVEL_PRESSURE)
        return self.isp_sl + t * (self.isp_vac - self.isp_sl)

    def mass_flow_rate_at_pressure(self, pressure: float) -> float:
        """
        Compute mass flow rate at given ambient pressure.

        ṁ = F / (Isp * g₀)

        Args:
            pressure: Ambient atmospheric pressure (Pa)

        Returns:
            Mass flow rate in kg/s
        """
        thrust = self.thrust_at_pressure(pressure)
        isp = self.isp_at_pressure(pressure)
        return thrust / (isp * G0)

    def to_dict(self) -> dict:
        """Convert stage to dictionary for serialization."""
        return {
            "name": self.name,
            "dry_mass": self.dry_mass,
            "propellant_mass": self.propellant_mass,
            "thrust_sl": self.thrust_sl,
            "thrust_vac": self.thrust_vac,
            "isp_sl": self.isp_sl,
            "isp_vac": self.isp_vac,
            "burn_time": self.burn_time,
            "diameter": self.diameter,
            "cd": self.cd,
            "num_engines": self.num_engines,
            "total_mass": self.total_mass,
            "delta_v": self.delta_v,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Stage":
        """Create stage from dictionary."""
        return cls(
            name=data["name"],
            dry_mass=data["dry_mass"],
            propellant_mass=data["propellant_mass"],
            thrust_sl=data.get("thrust_sl", data.get("thrust_vac", 0)),
            thrust_vac=data["thrust_vac"],
            isp_sl=data.get("isp_sl", data.get("isp_vac", 0)),
            isp_vac=data["isp_vac"],
            burn_time=data["burn_time"],
            diameter=data["diameter"],
            cd=data.get("cd", 0.3),
            num_engines=data.get("num_engines", 1),
        )
