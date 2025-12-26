"""
REST API routes for rocket simulation.
"""

from typing import List
from fastapi import APIRouter, HTTPException

from ..rocket.presets import list_presets, get_preset, get_preset_info
from ..rocket.rocket import LAUNCH_SITES
from ..models.schemas import (
    RocketConfig,
    RocketPresetInfo,
    LaunchSiteInfo,
    LaunchConfig,
)

router = APIRouter(prefix="/api", tags=["rockets"])


@router.get("/rockets", response_model=List[str])
async def get_available_rockets():
    """Get list of available rocket presets."""
    return list_presets()


@router.get("/rockets/{name}")
async def get_rocket_details(name: str, payload_mass: float = None):
    """Get detailed information about a rocket preset."""
    info = get_preset_info(name)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Rocket preset '{name}' not found")

    if payload_mass is not None:
        # Recalculate with custom payload
        rocket = get_preset(name, payload_mass)
        if rocket:
            info = rocket.to_dict()

    return info


@router.get("/launch-sites", response_model=List[LaunchSiteInfo])
async def get_launch_sites():
    """Get list of available launch sites."""
    sites = []
    for key, site in LAUNCH_SITES.items():
        sites.append(LaunchSiteInfo(
            name=site.name,
            latitude=site.latitude,
            longitude=site.longitude,
            altitude=site.altitude,
        ))
    return sites


@router.get("/launch-sites/{site_id}")
async def get_launch_site(site_id: str):
    """Get details for a specific launch site."""
    site = LAUNCH_SITES.get(site_id)
    if site is None:
        raise HTTPException(status_code=404, detail=f"Launch site '{site_id}' not found")

    return LaunchSiteInfo(
        name=site.name,
        latitude=site.latitude,
        longitude=site.longitude,
        altitude=site.altitude,
    )


@router.post("/rockets/validate")
async def validate_rocket_config(config: RocketConfig):
    """Validate a custom rocket configuration."""
    errors = []

    # Check stages
    if len(config.stages) < 1:
        errors.append("At least one stage is required")

    if len(config.stages) > 5:
        errors.append("Maximum 5 stages allowed")

    # Check each stage
    for i, stage in enumerate(config.stages):
        if stage.thrust_vac < stage.thrust_sl:
            errors.append(f"Stage {i+1}: Vacuum thrust should be >= sea level thrust")

        if stage.isp_vac < stage.isp_sl:
            errors.append(f"Stage {i+1}: Vacuum Isp should be >= sea level Isp")

        # Check mass ratio
        mass_ratio = (stage.dry_mass + stage.propellant_mass) / stage.dry_mass
        if mass_ratio < 2:
            errors.append(f"Stage {i+1}: Low mass ratio ({mass_ratio:.2f}), typical rockets have 5-20")

        # Check thrust-to-weight ratio for first stage
        if i == 0:
            total_mass = sum(s.dry_mass + s.propellant_mass for s in config.stages) + config.payload_mass
            twr = stage.thrust_sl / (total_mass * 9.81)
            if twr < 1.1:
                errors.append(f"First stage T/W ratio too low ({twr:.2f}), needs > 1.0 to lift off")

    if errors:
        return {"valid": False, "errors": errors}

    # Calculate delta-v
    from ..rocket.rocket import Rocket
    from ..rocket.stage import Stage

    stages = [Stage.from_dict(s.model_dump()) for s in config.stages]
    rocket = Rocket(
        name=config.name,
        stages=stages,
        payload_mass=config.payload_mass,
        fairing_mass=config.fairing_mass,
    )

    return {
        "valid": True,
        "total_mass": rocket.total_mass,
        "total_delta_v": rocket.total_delta_v,
        "num_stages": rocket.num_stages,
    }


@router.get("/physics/constants")
async def get_physics_constants():
    """Get physics constants used in simulation."""
    from ..physics.constants import (
        G, EARTH_MASS, EARTH_RADIUS_MEAN, MU_EARTH, G0,
        SEA_LEVEL_PRESSURE, SEA_LEVEL_TEMPERATURE, SEA_LEVEL_DENSITY,
        KARMAN_LINE, ORBITAL_VELOCITY_SURFACE, ESCAPE_VELOCITY,
    )

    return {
        "gravitational_constant": G,
        "earth_mass": EARTH_MASS,
        "earth_radius": EARTH_RADIUS_MEAN,
        "standard_gravitational_parameter": MU_EARTH,
        "standard_gravity": G0,
        "sea_level_pressure": SEA_LEVEL_PRESSURE,
        "sea_level_temperature": SEA_LEVEL_TEMPERATURE,
        "sea_level_density": SEA_LEVEL_DENSITY,
        "karman_line": KARMAN_LINE,
        "orbital_velocity_surface": ORBITAL_VELOCITY_SURFACE,
        "escape_velocity": ESCAPE_VELOCITY,
    }


@router.get("/atmosphere/{altitude}")
async def get_atmosphere_at_altitude(altitude: float):
    """Get atmospheric properties at a given altitude."""
    if altitude < 0:
        raise HTTPException(status_code=400, detail="Altitude must be non-negative")

    from ..physics.atmosphere import Atmosphere

    temp, pressure, density = Atmosphere.properties(altitude)
    speed_of_sound = Atmosphere.speed_of_sound(altitude)

    return {
        "altitude": altitude,
        "temperature": temp,
        "pressure": pressure,
        "density": density,
        "speed_of_sound": speed_of_sound,
    }


@router.get("/orbit/velocity/{altitude}")
async def get_orbital_velocity(altitude: float):
    """Get orbital velocity for circular orbit at given altitude."""
    if altitude < 0:
        raise HTTPException(status_code=400, detail="Altitude must be non-negative")

    from ..orbit.elements import orbital_velocity_circular, orbital_period_at_altitude

    velocity = orbital_velocity_circular(altitude)
    period = orbital_period_at_altitude(altitude)

    return {
        "altitude": altitude,
        "orbital_velocity": velocity,
        "orbital_period": period,
        "orbital_period_minutes": period / 60,
    }
