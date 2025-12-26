"""
Preset rocket configurations based on real vehicles.
"""

from typing import Dict, List, Optional
from .stage import Stage
from .rocket import Rocket


def create_falcon9_block5(payload_mass: float = 15000) -> Rocket:
    """
    SpaceX Falcon 9 Block 5 configuration.

    Two-stage rocket, primary workhorse for SpaceX.
    LEO capacity: ~22,800 kg
    GTO capacity: ~8,300 kg
    """
    first_stage = Stage(
        name="Falcon 9 First Stage",
        dry_mass=25600,  # kg (estimated, includes landing legs)
        propellant_mass=411000,  # kg (RP-1 + LOX)
        thrust_sl=7607000,  # N (9 Merlin 1D engines at sea level)
        thrust_vac=8227000,  # N (vacuum)
        isp_sl=282,  # s
        isp_vac=311,  # s
        burn_time=162,  # s
        diameter=3.7,  # m
        cd=0.3,
        num_engines=9,
    )

    second_stage = Stage(
        name="Falcon 9 Second Stage",
        dry_mass=4000,  # kg
        propellant_mass=107500,  # kg
        thrust_sl=981000,  # N (vacuum only engine)
        thrust_vac=981000,  # N (1 Merlin Vacuum)
        isp_sl=348,  # s (not used at sea level)
        isp_vac=348,  # s
        burn_time=397,  # s
        diameter=3.7,  # m
        cd=0.3,
        num_engines=1,
    )

    return Rocket(
        name="Falcon 9 Block 5",
        stages=[first_stage, second_stage],
        payload_mass=payload_mass,
        fairing_mass=1900,  # kg (5.2m fairing)
        launch_site="cape_canaveral",
    )


def create_saturn_v(payload_mass: float = 50000) -> Rocket:
    """
    NASA Saturn V configuration.

    Three-stage rocket used for Apollo lunar missions.
    LEO capacity: ~140,000 kg
    TLI capacity: ~48,600 kg
    """
    s_ic = Stage(
        name="S-IC (First Stage)",
        dry_mass=131000,  # kg
        propellant_mass=2160000,  # kg (RP-1 + LOX)
        thrust_sl=33400000,  # N (5 F-1 engines)
        thrust_vac=38700000,  # N
        isp_sl=263,  # s
        isp_vac=304,  # s (estimated)
        burn_time=168,  # s
        diameter=10.1,  # m
        cd=0.35,
        num_engines=5,
    )

    s_ii = Stage(
        name="S-II (Second Stage)",
        dry_mass=36000,  # kg
        propellant_mass=443000,  # kg (LH2 + LOX)
        thrust_sl=4400000,  # N (not applicable, starts at altitude)
        thrust_vac=5141000,  # N (5 J-2 engines)
        isp_sl=421,  # s
        isp_vac=421,  # s
        burn_time=360,  # s
        diameter=10.1,  # m
        cd=0.3,
        num_engines=5,
    )

    s_ivb = Stage(
        name="S-IVB (Third Stage)",
        dry_mass=13300,  # kg
        propellant_mass=108000,  # kg (LH2 + LOX)
        thrust_sl=486000,  # N
        thrust_vac=1033000,  # N (1 J-2 engine)
        isp_sl=421,  # s
        isp_vac=421,  # s
        burn_time=475,  # s (total, includes restart for TLI)
        diameter=6.6,  # m
        cd=0.3,
        num_engines=1,
    )

    return Rocket(
        name="Saturn V",
        stages=[s_ic, s_ii, s_ivb],
        payload_mass=payload_mass,
        fairing_mass=0,  # Apollo used Launch Escape System instead
        launch_site="kennedy",
    )


def create_electron(payload_mass: float = 200) -> Rocket:
    """
    Rocket Lab Electron configuration.

    Small satellite launcher.
    LEO capacity: ~300 kg
    """
    first_stage = Stage(
        name="Electron First Stage",
        dry_mass=950,  # kg
        propellant_mass=9250,  # kg (RP-1 + LOX)
        thrust_sl=162000,  # N (9 Rutherford engines)
        thrust_vac=192000,  # N
        isp_sl=303,  # s
        isp_vac=311,  # s
        burn_time=155,  # s
        diameter=1.2,  # m
        cd=0.3,
        num_engines=9,
    )

    second_stage = Stage(
        name="Electron Second Stage",
        dry_mass=250,  # kg
        propellant_mass=2150,  # kg
        thrust_sl=22000,  # N
        thrust_vac=25800,  # N (1 Rutherford Vacuum)
        isp_sl=333,  # s
        isp_vac=343,  # s
        burn_time=360,  # s
        diameter=1.2,  # m
        cd=0.3,
        num_engines=1,
    )

    return Rocket(
        name="Electron",
        stages=[first_stage, second_stage],
        payload_mass=payload_mass,
        fairing_mass=50,  # kg
        launch_site="cape_canaveral",  # Actually launches from NZ
    )


def create_starship(payload_mass: float = 100000) -> Rocket:
    """
    SpaceX Starship + Super Heavy configuration.

    Next-generation fully reusable launch system.
    LEO capacity: ~150,000 kg (expendable)
    """
    super_heavy = Stage(
        name="Super Heavy Booster",
        dry_mass=200000,  # kg (estimated)
        propellant_mass=3400000,  # kg (CH4 + LOX)
        thrust_sl=74400000,  # N (33 Raptor engines)
        thrust_vac=80000000,  # N (estimated)
        isp_sl=327,  # s
        isp_vac=350,  # s (estimated)
        burn_time=180,  # s (estimated)
        diameter=9.0,  # m
        cd=0.35,
        num_engines=33,
    )

    starship = Stage(
        name="Starship",
        dry_mass=100000,  # kg (estimated)
        propellant_mass=1200000,  # kg (CH4 + LOX)
        thrust_sl=1500000,  # N (starts in vacuum)
        thrust_vac=14700000,  # N (6 Raptor engines, 3 sea-level + 3 vacuum)
        isp_sl=327,  # s
        isp_vac=380,  # s (vacuum Raptors)
        burn_time=360,  # s (estimated)
        diameter=9.0,  # m
        cd=0.3,
        num_engines=6,
    )

    return Rocket(
        name="Starship",
        stages=[super_heavy, starship],
        payload_mass=payload_mass,
        fairing_mass=0,  # Integrated cargo bay
        launch_site="cape_canaveral",
    )


# Registry of available presets
ROCKET_PRESETS: Dict[str, callable] = {
    "falcon9": create_falcon9_block5,
    "saturn_v": create_saturn_v,
    "electron": create_electron,
    "starship": create_starship,
}


def list_presets() -> List[str]:
    """Get list of available rocket preset names."""
    return list(ROCKET_PRESETS.keys())


def get_preset(name: str, payload_mass: Optional[float] = None) -> Optional[Rocket]:
    """
    Get a rocket preset by name.

    Args:
        name: Preset name (e.g., "falcon9", "saturn_v")
        payload_mass: Override default payload mass (optional)

    Returns:
        Rocket configuration or None if preset not found
    """
    creator = ROCKET_PRESETS.get(name.lower())
    if creator is None:
        return None

    if payload_mass is not None:
        return creator(payload_mass)
    return creator()


def get_preset_info(name: str) -> Optional[dict]:
    """
    Get information about a rocket preset.

    Args:
        name: Preset name

    Returns:
        Dictionary with rocket info or None
    """
    rocket = get_preset(name)
    if rocket is None:
        return None
    return rocket.to_dict()
