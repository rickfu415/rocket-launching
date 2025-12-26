"""
Pydantic schemas for API request/response models.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class StageConfig(BaseModel):
    """Configuration for a rocket stage."""

    name: str
    dry_mass: float = Field(..., gt=0, description="Dry mass in kg")
    propellant_mass: float = Field(..., gt=0, description="Propellant mass in kg")
    thrust_sl: float = Field(..., ge=0, description="Sea level thrust in N")
    thrust_vac: float = Field(..., gt=0, description="Vacuum thrust in N")
    isp_sl: float = Field(..., gt=0, description="Sea level specific impulse in s")
    isp_vac: float = Field(..., gt=0, description="Vacuum specific impulse in s")
    burn_time: float = Field(..., gt=0, description="Burn duration in s")
    diameter: float = Field(..., gt=0, description="Stage diameter in m")
    cd: float = Field(0.3, ge=0, le=2, description="Drag coefficient")
    num_engines: int = Field(1, ge=1, description="Number of engines")


class RocketConfig(BaseModel):
    """Configuration for a complete rocket."""

    name: str
    stages: List[StageConfig]
    payload_mass: float = Field(..., ge=0, description="Payload mass in kg")
    fairing_mass: float = Field(0, ge=0, description="Fairing mass in kg")
    launch_site: str = Field("cape_canaveral", description="Launch site identifier")


class LaunchConfig(BaseModel):
    """Configuration for a launch simulation."""

    rocket: str = Field(..., description="Rocket preset name or 'custom'")
    custom_config: Optional[RocketConfig] = Field(None, description="Custom rocket config if rocket='custom'")
    payload_mass: Optional[float] = Field(None, description="Override payload mass")
    target_altitude: float = Field(400_000, description="Target orbit altitude in m")
    target_inclination: float = Field(28.5, description="Target inclination in degrees")
    time_acceleration: float = Field(1.0, ge=0.1, le=100, description="Simulation speed multiplier")


class SimulationStateResponse(BaseModel):
    """Real-time simulation state."""

    type: str = "state"
    time: float
    position: List[float]
    velocity: List[float]
    altitude: float
    speed: float
    mass: float
    stage_index: int
    stage_propellant: float
    is_burning: bool
    fairing_jettisoned: bool
    flight_path_angle: float
    latitude: float
    longitude: float
    acceleration: float
    dynamic_pressure: float
    fuel_remaining: float


class SimulationEvent(BaseModel):
    """Simulation event notification."""

    type: str = "event"
    event: str
    time: float
    altitude: float
    velocity: float
    data: Dict[str, Any] = Field(default_factory=dict)


class OrbitalElementsResponse(BaseModel):
    """Orbital elements."""

    semi_major_axis: float
    eccentricity: float
    inclination: float
    raan: float
    argument_of_periapsis: float
    true_anomaly: float
    periapsis_altitude: float
    apoapsis_altitude: Optional[float]
    orbital_period: Optional[float]
    is_elliptical: bool


class SimulationComplete(BaseModel):
    """Simulation completion message."""

    type: str = "complete"
    success: bool
    reason: str
    orbit: Optional[OrbitalElementsResponse] = None


class RocketPresetInfo(BaseModel):
    """Information about a rocket preset."""

    name: str
    num_stages: int
    total_mass: float
    total_delta_v: float
    payload_mass: float
    stages: List[Dict[str, Any]]


class LaunchSiteInfo(BaseModel):
    """Information about a launch site."""

    name: str
    latitude: float
    longitude: float
    altitude: float


class WebSocketCommand(BaseModel):
    """Command sent via WebSocket."""

    action: str  # "start", "pause", "resume", "stop", "set_speed"
    rocket: Optional[str] = None
    payload_mass: Optional[float] = None
    custom_config: Optional[RocketConfig] = None
    target_altitude: Optional[float] = None
    target_inclination: Optional[float] = None
    speed: Optional[float] = None


class ErrorResponse(BaseModel):
    """Error response."""

    type: str = "error"
    message: str
    details: Optional[Dict[str, Any]] = None
