"""
Multi-stage rocket assembly.
"""

import math
from dataclasses import dataclass, field
from typing import List, Optional

from .stage import Stage
from ..physics.constants import G0


@dataclass
class LaunchSite:
    """Launch site definition."""
    name: str
    latitude: float  # degrees
    longitude: float  # degrees
    altitude: float = 0.0  # meters above sea level


# Common launch sites
LAUNCH_SITES = {
    "cape_canaveral": LaunchSite("Cape Canaveral", 28.562, -80.577, 3),
    "kennedy": LaunchSite("Kennedy Space Center", 28.573, -80.649, 3),
    "vandenberg": LaunchSite("Vandenberg SFB", 34.632, -120.611, 110),
    "baikonur": LaunchSite("Baikonur Cosmodrome", 45.965, 63.305, 90),
    "kourou": LaunchSite("Guiana Space Centre", 5.232, -52.769, 15),
}


@dataclass
class Rocket:
    """
    Multi-stage rocket configuration.

    Stages are ordered from bottom (first stage) to top (final stage).
    The rocket burns stages in order, jettisoning each after burnout.
    """

    name: str
    stages: List[Stage]
    payload_mass: float  # kg
    fairing_mass: float = 0.0  # kg, jettisoned at ~100km altitude
    launch_site: str = "cape_canaveral"

    @property
    def num_stages(self) -> int:
        """Number of propulsive stages."""
        return len(self.stages)

    @property
    def total_mass(self) -> float:
        """Total rocket mass at liftoff (kg)."""
        stage_mass = sum(s.total_mass for s in self.stages)
        return stage_mass + self.payload_mass + self.fairing_mass

    @property
    def dry_mass(self) -> float:
        """Dry mass (no propellant)."""
        stage_dry = sum(s.dry_mass for s in self.stages)
        return stage_dry + self.payload_mass + self.fairing_mass

    @property
    def total_propellant(self) -> float:
        """Total propellant mass (kg)."""
        return sum(s.propellant_mass for s in self.stages)

    @property
    def total_delta_v(self) -> float:
        """
        Total theoretical delta-v using staged calculation.

        For each stage, we compute delta-v considering the mass
        of all upper stages as payload.
        """
        delta_v = 0.0
        remaining_upper_mass = self.payload_mass + self.fairing_mass

        # Calculate from top stage down
        for stage in reversed(self.stages):
            m0 = stage.total_mass + remaining_upper_mass
            mf = stage.dry_mass + remaining_upper_mass
            if mf > 0:
                stage_dv = stage.isp_vac * G0 * math.log(m0 / mf)
                delta_v += stage_dv
            remaining_upper_mass += stage.total_mass

        return delta_v

    @property
    def first_stage(self) -> Stage:
        """Get the first (bottom) stage."""
        return self.stages[0]

    @property
    def current_diameter(self) -> float:
        """Diameter of the current (first) stage for drag."""
        return self.first_stage.diameter

    @property
    def launch_site_info(self) -> LaunchSite:
        """Get launch site information."""
        return LAUNCH_SITES.get(
            self.launch_site,
            LAUNCH_SITES["cape_canaveral"]
        )

    def mass_at_stage(self, stage_index: int, propellant_remaining: float) -> float:
        """
        Compute total mass when burning a specific stage.

        Args:
            stage_index: Index of currently burning stage (0 = first)
            propellant_remaining: Propellant remaining in current stage (kg)

        Returns:
            Total vehicle mass (kg)
        """
        if stage_index >= len(self.stages):
            # All stages expended
            return self.payload_mass

        # Current stage contribution
        current_stage = self.stages[stage_index]
        current_mass = current_stage.dry_mass + propellant_remaining

        # Upper stages (full)
        upper_mass = sum(s.total_mass for s in self.stages[stage_index + 1:])

        # Payload and fairing
        payload = self.payload_mass
        fairing = self.fairing_mass if stage_index == 0 else 0  # Fairing jettisoned after first stage typically

        return current_mass + upper_mass + payload + fairing

    def stage_mass_after_separation(self, stage_index: int) -> float:
        """
        Mass remaining after jettisoning a stage.

        Args:
            stage_index: Index of stage being jettisoned

        Returns:
            Mass after separation (kg)
        """
        remaining_stages = self.stages[stage_index + 1:]
        stage_mass = sum(s.total_mass for s in remaining_stages)
        return stage_mass + self.payload_mass + self.fairing_mass

    def get_stage_info(self, stage_index: int) -> Optional[Stage]:
        """Get stage by index, or None if invalid."""
        if 0 <= stage_index < len(self.stages):
            return self.stages[stage_index]
        return None

    def to_dict(self) -> dict:
        """Convert rocket to dictionary for serialization."""
        return {
            "name": self.name,
            "stages": [s.to_dict() for s in self.stages],
            "payload_mass": self.payload_mass,
            "fairing_mass": self.fairing_mass,
            "launch_site": self.launch_site,
            "total_mass": self.total_mass,
            "total_delta_v": self.total_delta_v,
            "num_stages": self.num_stages,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Rocket":
        """Create rocket from dictionary."""
        stages = [Stage.from_dict(s) for s in data["stages"]]
        return cls(
            name=data["name"],
            stages=stages,
            payload_mass=data.get("payload_mass", 0),
            fairing_mass=data.get("fairing_mass", 0),
            launch_site=data.get("launch_site", "cape_canaveral"),
        )
