#!/usr/bin/env python3
"""
Debug mode for rocket simulator backend.

Run simulations directly in terminal without frontend.
All parameters can be customized via command line or config file.

Usage:
    python debug.py                              # Run with defaults (Falcon 9)
    python debug.py --config configs/custom.json # Load from config file
    python debug.py --rocket falcon9             # Use preset rocket
    python debug.py --s1-fuel 400000 --s1-thrust 8000000  # Override stage 1
    python debug.py --pitch-angle 3.0 --pitch-duration 8  # Override flight profile
    python debug.py --list                       # List available rockets
    python debug.py --template                   # Generate template config file
"""

import argparse
import csv
import json
import math
import sys
import time
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
import numpy as np

# Add src to path
sys.path.insert(0, '.')

from src.rocket.presets import get_preset, list_presets
from src.rocket.rocket import Rocket, Stage, LAUNCH_SITES
from src.simulation.simulator import Simulator, SimulationEventType
from src.simulation.flight_profile import FlightProfileConfig
from src.simulation.integrator import compute_forces_breakdown
from src.physics.atmosphere import Atmosphere
from src.physics.aerodynamics import dynamic_pressure
from src.physics.constants import EARTH_RADIUS_MEAN, MU_EARTH, G0
from src.orbit.elements import compute_orbital_elements


# =============================================================================
# Formatting Helpers
# =============================================================================

def format_time(seconds: float) -> str:
    """Format seconds as MM:SS.ms or HH:MM:SS.ms."""
    if seconds < 3600:
        mins = int(seconds // 60)
        secs = seconds % 60
        return f"{mins:02d}:{secs:06.3f}"
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def format_time_short(seconds: float) -> str:
    """Format seconds as MM:SS."""
    if seconds < 3600:
        return f"{int(seconds // 60):02d}:{int(seconds % 60):02d}"
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def format_altitude(meters: float) -> str:
    """Format altitude in human-readable form."""
    if abs(meters) < 1000:
        return f"{meters:.1f} m"
    elif abs(meters) < 100000:
        return f"{meters/1000:.2f} km"
    else:
        return f"{meters/1000:.1f} km"


def format_velocity(mps: float) -> str:
    """Format velocity in human-readable form."""
    if abs(mps) < 1000:
        return f"{mps:.1f} m/s"
    else:
        return f"{mps/1000:.3f} km/s"


def format_vec3(v: np.ndarray, unit: str = "") -> str:
    """Format a 3D vector."""
    return f"[{v[0]:+.3e}, {v[1]:+.3e}, {v[2]:+.3e}]{unit}"


def format_force(newtons: float) -> str:
    """Format force value."""
    if abs(newtons) < 1000:
        return f"{newtons:.1f} N"
    elif abs(newtons) < 1e6:
        return f"{newtons/1000:.2f} kN"
    else:
        return f"{newtons/1e6:.3f} MN"


# =============================================================================
# Configuration Loading
# =============================================================================

def load_config(config_path: str) -> Dict[str, Any]:
    """Load configuration from JSON file."""
    with open(config_path, 'r') as f:
        return json.load(f)


def create_rocket_from_config(config: Dict[str, Any]) -> Rocket:
    """Create a Rocket object from configuration dictionary."""
    stages = []
    for i, stage_cfg in enumerate(config.get('stages', [])):
        # Get propellant mass and thrust to calculate burn_time
        propellant_mass = stage_cfg.get('propellant_mass', 100000)
        thrust_vac = stage_cfg.get('thrust_vac', 1100000)
        isp_vac = stage_cfg.get('isp_vac', 310)

        # Calculate burn time if not provided: burn_time = propellant_mass / mass_flow_rate
        # mass_flow_rate = thrust / (isp * g0)
        if 'burn_time' in stage_cfg:
            burn_time = stage_cfg['burn_time']
        else:
            mass_flow_rate = thrust_vac / (isp_vac * G0)
            burn_time = propellant_mass / mass_flow_rate if mass_flow_rate > 0 else 300.0

        # Handle diameter vs reference_area - prefer diameter
        if 'diameter' in stage_cfg:
            diameter = stage_cfg['diameter']
        elif 'reference_area' in stage_cfg:
            # Convert reference_area to diameter: A = pi * (d/2)^2, so d = 2 * sqrt(A/pi)
            diameter = 2.0 * math.sqrt(stage_cfg['reference_area'] / math.pi)
        else:
            diameter = 3.7  # Default ~Falcon 9 diameter

        stage = Stage(
            name=stage_cfg.get('name', f'Stage {i+1}'),
            dry_mass=stage_cfg.get('dry_mass', 10000),
            propellant_mass=propellant_mass,
            thrust_sl=stage_cfg.get('thrust_sl', 1000000),
            thrust_vac=thrust_vac,
            isp_sl=stage_cfg.get('isp_sl', 280),
            isp_vac=isp_vac,
            burn_time=burn_time,
            diameter=diameter,
            cd=stage_cfg.get('cd', 0.3),
            num_engines=stage_cfg.get('num_engines', 1),
        )
        stages.append(stage)

    payload_cfg = config.get('payload', {})
    launch_site_cfg = config.get('launch_site', {})

    # Determine launch site
    launch_site_name = launch_site_cfg.get('name', 'cape_canaveral')
    if launch_site_name.lower() in ['cape_canaveral', 'cape canaveral', 'ksc']:
        launch_site = 'cape_canaveral'
    elif launch_site_name.lower() in ['kennedy', 'ksc']:
        launch_site = 'kennedy'
    elif launch_site_name.lower() in ['vandenberg', 'vafb']:
        launch_site = 'vandenberg'
    else:
        launch_site = 'cape_canaveral'

    rocket = Rocket(
        name=config.get('name', 'Custom Rocket'),
        stages=stages,
        payload_mass=payload_cfg.get('mass', 10000),
        fairing_mass=payload_cfg.get('fairing_mass', 1900),
        launch_site=launch_site,
    )

    return rocket


def create_flight_profile_from_config(config: Dict[str, Any]) -> FlightProfileConfig:
    """Create FlightProfileConfig from configuration dictionary."""
    fp_cfg = config.get('flight_profile', {})

    return FlightProfileConfig(
        vertical_ascent_altitude=fp_cfg.get('vertical_ascent_altitude', 150.0),
        pitchover_angle=fp_cfg.get('pitchover_angle', 2.2),
        pitchover_duration=fp_cfg.get('pitchover_duration', 6.0),
        target_altitude=fp_cfg.get('target_altitude', 400000.0),
        target_inclination=fp_cfg.get('target_inclination', 28.5),
        fairing_jettison_altitude=fp_cfg.get('fairing_jettison_altitude', 110000.0),
    )


def generate_template_config() -> str:
    """Generate a template configuration file with explanatory comments."""
    template = {
        "_comment": "Rocket Launch Simulator Configuration File",
        "_units": {
            "mass": "kg (kilograms)",
            "thrust": "N (Newtons)",
            "isp": "s (seconds)",
            "altitude": "m (meters)",
            "angle": "deg (degrees)",
            "time": "s (seconds)",
            "diameter": "m (meters)"
        },

        "name": "My Custom Rocket",
        "description": "Description of your rocket",

        "payload": {
            "_comment": "Payload section - the cargo being delivered to orbit",
            "mass": 15000,
            "_mass_comment": "Payload mass in kg - the satellite or cargo being launched",
            "fairing_mass": 1900,
            "_fairing_mass_comment": "Protective nose cone mass in kg - jettisoned after leaving atmosphere"
        },

        "stages": [
            {
                "_comment": "=== FIRST STAGE === Provides initial thrust to escape atmosphere",
                "name": "First Stage",
                "dry_mass": 25000,
                "_dry_mass_comment": "Empty stage mass without propellant (kg) - structure, engines, tanks",
                "propellant_mass": 400000,
                "_propellant_mass_comment": "Fuel + oxidizer mass (kg) - consumed during burn",
                "thrust_sl": 7600000,
                "_thrust_sl_comment": "Thrust at sea level (N) - lower due to atmospheric backpressure",
                "thrust_vac": 8200000,
                "_thrust_vac_comment": "Thrust in vacuum (N) - higher efficiency in space",
                "isp_sl": 282,
                "_isp_sl_comment": "Specific impulse at sea level (s) - fuel efficiency measure",
                "isp_vac": 311,
                "_isp_vac_comment": "Specific impulse in vacuum (s) - higher in space",
                "num_engines": 9,
                "_num_engines_comment": "Number of engines - affects redundancy and throttle capability",
                "cd": 0.3,
                "_cd_comment": "Drag coefficient - aerodynamic drag factor (0.2-0.4 typical)",
                "diameter": 3.7,
                "_diameter_comment": "Stage diameter (m) - used to calculate drag area",
                "_burn_time_comment": "burn_time is auto-calculated from propellant/flow_rate if not provided"
            },
            {
                "_comment": "=== SECOND STAGE === Provides final push to orbital velocity",
                "name": "Second Stage",
                "dry_mass": 4000,
                "_dry_mass_comment": "Empty stage mass (kg) - lighter than first stage",
                "propellant_mass": 100000,
                "_propellant_mass_comment": "Fuel + oxidizer mass (kg)",
                "thrust_sl": 980000,
                "_thrust_sl_comment": "Thrust at sea level (N) - rarely used at SL",
                "thrust_vac": 980000,
                "_thrust_vac_comment": "Thrust in vacuum (N) - primary operating condition",
                "isp_sl": 348,
                "_isp_sl_comment": "Specific impulse at sea level (s)",
                "isp_vac": 348,
                "_isp_vac_comment": "Specific impulse in vacuum (s) - optimized for vacuum",
                "num_engines": 1,
                "_num_engines_comment": "Single engine typical for upper stages",
                "cd": 0.3,
                "_cd_comment": "Drag coefficient - less important in vacuum",
                "diameter": 3.7,
                "_diameter_comment": "Stage diameter (m)"
            }
        ],

        "launch_site": {
            "_comment": "Launch location - affects initial velocity from Earth's rotation",
            "name": "Cape Canaveral",
            "latitude": 28.562,
            "_latitude_comment": "Degrees north - lower latitude = more rotational velocity boost",
            "longitude": -80.577,
            "_longitude_comment": "Degrees east (negative = west)",
            "altitude": 0,
            "_altitude_comment": "Launch pad altitude above sea level (m)"
        },

        "flight_profile": {
            "_comment": "=== FLIGHT PROFILE === Controls the trajectory shape",
            "vertical_ascent_altitude": 150,
            "_vertical_ascent_altitude_comment": "Altitude (m) to climb vertically before pitching",
            "pitchover_angle": 2.2,
            "_pitchover_angle_comment": "Initial pitch from vertical (deg) - starts gravity turn. Too large=crash, too small=inefficient",
            "pitchover_duration": 6.0,
            "_pitchover_duration_comment": "Time (s) to complete pitchover maneuver",
            "target_altitude": 400000,
            "_target_altitude_comment": "Target orbital altitude (m) - 400km is typical LEO",
            "target_inclination": 28.5,
            "_target_inclination_comment": "Orbital inclination (deg) - minimum = launch latitude",
            "fairing_jettison_altitude": 110000,
            "_fairing_jettison_altitude_comment": "Altitude (m) to drop fairing - above atmosphere"
        },

        "simulation": {
            "_comment": "=== SIMULATION SETTINGS ===",
            "time_step": 0.1,
            "_time_step_comment": "Integration time step (s) - smaller = more accurate but slower",
            "max_time": 1800,
            "_max_time_comment": "Maximum simulation duration (s) - 1800s = 30 minutes",
            "print_interval": 10.0,
            "_print_interval_comment": "Output interval (s) - how often to print telemetry"
        }
    }

    return json.dumps(template, indent=2)


# =============================================================================
# Rocket Building with CLI Overrides
# =============================================================================

def build_rocket_from_args(args) -> tuple:
    """
    Build rocket and flight profile from command line arguments.
    Returns (Rocket, FlightProfileConfig, sim_config dict)
    """
    config = {}
    sim_config = {
        'time_step': args.dt,
        'max_time': args.max_time,
        'print_interval': args.interval,
    }

    # Load from config file if provided
    if args.config:
        config = load_config(args.config)
        # Override sim config from file
        file_sim = config.get('simulation', {})
        if 'time_step' in file_sim and args.dt == 0.1:  # Only if not overridden
            sim_config['time_step'] = file_sim['time_step']
        if 'max_time' in file_sim and args.max_time == 1800:
            sim_config['max_time'] = file_sim['max_time']
        if 'print_interval' in file_sim and args.interval == 10.0:
            sim_config['print_interval'] = file_sim['print_interval']

    # Start with preset or config
    if args.config and 'stages' in config:
        rocket = create_rocket_from_config(config)
        profile_config = create_flight_profile_from_config(config)
    else:
        # Use preset
        rocket = get_preset(args.rocket, args.payload)
        if rocket is None:
            print(f"Error: Unknown rocket preset '{args.rocket}'")
            print("Use --list to see available presets or --config to load from file")
            sys.exit(1)
        profile_config = FlightProfileConfig()

    # Apply command-line overrides for Stage 1
    if len(rocket.stages) >= 1:
        s1 = rocket.stages[0]
        if args.s1_dry_mass is not None:
            s1.dry_mass = args.s1_dry_mass
        if args.s1_fuel is not None:
            s1.propellant_mass = args.s1_fuel
        if args.s1_thrust is not None:
            s1.thrust_sl = args.s1_thrust
            s1.thrust_vac = args.s1_thrust * 1.08  # Approximate vac boost
        if args.s1_thrust_vac is not None:
            s1.thrust_vac = args.s1_thrust_vac
        if args.s1_isp is not None:
            s1.isp_sl = args.s1_isp
            s1.isp_vac = args.s1_isp + 30  # Approximate vac boost
        if args.s1_isp_vac is not None:
            s1.isp_vac = args.s1_isp_vac
        if args.s1_engines is not None:
            s1.num_engines = args.s1_engines
        if args.s1_cd is not None:
            s1.cd = args.s1_cd
        if args.s1_area is not None:
            s1.reference_area = args.s1_area

    # Apply command-line overrides for Stage 2
    if len(rocket.stages) >= 2:
        s2 = rocket.stages[1]
        if args.s2_dry_mass is not None:
            s2.dry_mass = args.s2_dry_mass
        if args.s2_fuel is not None:
            s2.propellant_mass = args.s2_fuel
        if args.s2_thrust is not None:
            s2.thrust_sl = args.s2_thrust
            s2.thrust_vac = args.s2_thrust
        if args.s2_thrust_vac is not None:
            s2.thrust_vac = args.s2_thrust_vac
        if args.s2_isp is not None:
            s2.isp_sl = args.s2_isp
            s2.isp_vac = args.s2_isp
        if args.s2_isp_vac is not None:
            s2.isp_vac = args.s2_isp_vac
        if args.s2_engines is not None:
            s2.num_engines = args.s2_engines

    # Override payload
    if args.payload is not None:
        rocket.payload_mass = args.payload

    # Apply flight profile overrides
    if args.pitch_angle is not None:
        profile_config.pitchover_angle = args.pitch_angle
    if args.pitch_duration is not None:
        profile_config.pitchover_duration = args.pitch_duration
    if args.vertical_alt is not None:
        profile_config.vertical_ascent_altitude = args.vertical_alt
    if args.target_alt is not None:
        profile_config.target_altitude = args.target_alt
    if args.target_inc is not None:
        profile_config.target_inclination = args.target_inc
    if args.fairing_alt is not None:
        profile_config.fairing_jettison_altitude = args.fairing_alt

    return rocket, profile_config, sim_config


# =============================================================================
# Display Functions
# =============================================================================

def print_header():
    """Print debug mode header."""
    print("\n" + "=" * 80)
    print("  ROCKET LAUNCH SIMULATOR - DEBUG MODE")
    print("=" * 80 + "\n")


def list_rockets():
    """List all available rocket presets."""
    print("\nAvailable Rocket Presets:")
    print("-" * 60)
    for name in list_presets():
        rocket = get_preset(name)
        print(f"  {name:15} - {rocket.name}")
        print(f"                   Stages: {rocket.num_stages}, "
              f"Total mass: {rocket.total_mass/1000:.0f} t, "
              f"Payload: {rocket.payload_mass/1000:.0f} t")
    print()


def print_rocket_config(rocket: Rocket, profile: FlightProfileConfig):
    """Print full rocket and flight profile configuration."""
    print(f"\n{'='*60}")
    print(f"  ROCKET CONFIGURATION: {rocket.name}")
    print(f"{'='*60}")

    print(f"\n  Total Mass: {rocket.total_mass/1000:.1f} tonnes")
    print(f"  Payload: {rocket.payload_mass/1000:.1f} tonnes")
    print(f"  Fairing: {rocket.fairing_mass/1000:.1f} tonnes")
    print(f"  Stages: {rocket.num_stages}")
    print(f"  Launch Site: {rocket.launch_site}")

    for i, stage in enumerate(rocket.stages):
        print(f"\n  --- Stage {i+1}: {stage.name} ---")
        print(f"    Dry Mass:     {stage.dry_mass/1000:8.1f} t")
        print(f"    Propellant:   {stage.propellant_mass/1000:8.1f} t")
        print(f"    Total Mass:   {(stage.dry_mass + stage.propellant_mass)/1000:8.1f} t")
        print(f"    Thrust (SL):  {stage.thrust_sl/1e6:8.2f} MN")
        print(f"    Thrust (Vac): {stage.thrust_vac/1e6:8.2f} MN")
        print(f"    Isp (SL):     {stage.isp_sl:8.0f} s")
        print(f"    Isp (Vac):    {stage.isp_vac:8.0f} s")
        print(f"    Engines:      {stage.num_engines:8d}")
        print(f"    Burn Time:    {stage.burn_time:8.0f} s")
        print(f"    Cd:           {stage.cd:8.2f}")
        print(f"    Area:         {stage.reference_area:8.1f} m²")

    print(f"\n  --- Flight Profile ---")
    print(f"    Vertical Ascent:    {profile.vertical_ascent_altitude:8.0f} m")
    print(f"    Pitchover Angle:    {profile.pitchover_angle:8.1f}°")
    print(f"    Pitchover Duration: {profile.pitchover_duration:8.1f} s")
    print(f"    Target Altitude:    {profile.target_altitude/1000:8.0f} km")
    print(f"    Target Inclination: {profile.target_inclination:8.1f}°")
    print(f"    Fairing Jettison:   {profile.fairing_jettison_altitude/1000:8.0f} km")


def test_physics():
    """Test physics modules."""
    print("\n" + "=" * 80)
    print("  PHYSICS MODULE TESTS")
    print("=" * 80)

    print("\n--- Atmosphere Model (US Standard 1976) ---")
    test_altitudes = [0, 1000, 10000, 50000, 100000, 200000]
    print(f"{'Altitude':>12} {'Density':>15} {'Pressure':>15} {'Temperature':>12}")
    print("-" * 56)
    for alt in test_altitudes:
        density = Atmosphere.density(alt)
        pressure = Atmosphere.pressure(alt)
        temp = Atmosphere.temperature(alt)
        print(f"{format_altitude(alt):>12} {density:>15.6e} {pressure:>15.1f} {temp:>12.1f}")

    print("\n--- Orbital Velocities ---")
    test_altitudes_orbit = [200000, 400000, 1000000, 35786000]
    print(f"{'Altitude':>12} {'Orbital Velocity':>18} {'Period':>15}")
    print("-" * 48)
    for alt in test_altitudes_orbit:
        r = EARTH_RADIUS_MEAN + alt
        v_orbital = math.sqrt(MU_EARTH / r)
        period = 2 * math.pi * r / v_orbital
        print(f"{format_altitude(alt):>12} {format_velocity(v_orbital):>18} {format_time_short(period):>15}")

    print("\nPhysics tests complete.\n")


# =============================================================================
# Simulation
# =============================================================================

def compute_state_forces(state, rocket, simulator):
    """Compute forces and accelerations for current state."""
    thrust_dir = simulator.profile.get_thrust_direction(
        state,
        simulator._launch_azimuth,
    )

    if state.stage_index < rocket.num_stages:
        stage = rocket.stages[state.stage_index]
        altitude = max(0, state.altitude)
        pressure = Atmosphere.pressure(altitude)

        if state.is_burning and state.stage_propellant > 0:
            thrust = stage.thrust_at_pressure(pressure)
            isp = stage.isp_at_pressure(pressure)
        else:
            thrust = 0.0
            isp = 0.0

        cd = stage.cd
        area = stage.reference_area
    else:
        thrust = 0.0
        isp = 0.0
        cd = 0.3
        area = 10.0

    forces = compute_forces_breakdown(
        state.position,
        state.velocity,
        state.mass,
        thrust,
        thrust_dir,
        cd,
        area,
    )

    forces['thrust_magnitude'] = thrust
    forces['isp'] = isp
    forces['thrust_direction'] = thrust_dir.tolist()

    return forces


def run_simulation(
    rocket: Rocket,
    profile_config: FlightProfileConfig,
    sim_config: dict,
    verbose: bool = False,
    full_output: bool = False,
    output_file: Optional[str] = None,
):
    """Run simulation and print results."""

    time_step = sim_config.get('time_step', 0.1)
    max_time = sim_config.get('max_time', 1800)
    print_interval = sim_config.get('print_interval', 10.0)

    # Print configuration
    print_rocket_config(rocket, profile_config)

    # Create simulator
    simulator = Simulator(
        rocket=rocket,
        profile_config=profile_config,
        time_step=time_step,
        max_simulation_time=max_time,
    )

    print("\n" + "=" * 80)
    print("  SIMULATION START")
    print(f"  Time step: {time_step}s, Print interval: {print_interval}s")
    print("=" * 80)

    # Initialize
    state = simulator.initialize()

    # Tracking
    last_print_time = -print_interval
    last_event_count = 0
    trajectory_data = []

    # Track fuel usage
    initial_mass = state.mass
    stage_fuel_used = [0.0] * rocket.num_stages
    stage_initial_fuel = [s.propellant_mass for s in rocket.stages]
    current_stage_start_fuel = state.stage_propellant

    # Progress header
    if verbose:
        print("\n" + "=" * 120)
        print("  DETAILED TELEMETRY MODE")
        print("=" * 120)

    start_real_time = time.time()

    # Run simulation
    while not simulator.is_complete():
        state = simulator.step()

        should_print = (state.time - last_print_time >= print_interval)

        if should_print or full_output:
            forces = compute_state_forces(state, rocket, simulator)
            q = dynamic_pressure(state.velocity, state.altitude)

        if full_output:
            trajectory_data.append({
                'time': state.time,
                'pos_x': state.position[0],
                'pos_y': state.position[1],
                'pos_z': state.position[2],
                'vel_x': state.velocity[0],
                'vel_y': state.velocity[1],
                'vel_z': state.velocity[2],
                'acc_x': forces['acceleration'][0],
                'acc_y': forces['acceleration'][1],
                'acc_z': forces['acceleration'][2],
                'thrust_magnitude': forces['thrust_magnitude'],
                'mass': state.mass,
                'altitude': state.altitude,
                'speed': state.speed,
                'dynamic_pressure': q,
                'flight_path_angle': math.degrees(state.flight_path_angle),
                'stage_index': state.stage_index,
                'is_burning': state.is_burning,
            })

        # Print events and track stage changes
        for event in simulator.events[last_event_count:]:
            event_name = event.type.value.upper().replace("_", " ")
            print(f"\n>>> {event_name} at T+{format_time(event.time)}")
            # Reset fuel tracking on stage separation
            if "separation" in event.type.value.lower():
                current_stage_start_fuel = state.stage_propellant
        last_event_count = len(simulator.events)

        # Track fuel consumption per stage
        if state.stage_index < rocket.num_stages:
            fuel_consumed_this_stage = current_stage_start_fuel - state.stage_propellant
            if fuel_consumed_this_stage > stage_fuel_used[state.stage_index]:
                stage_fuel_used[state.stage_index] = fuel_consumed_this_stage

        if should_print:
            last_print_time = state.time

            if verbose:
                # Calculate fuel percentages
                if state.stage_index < rocket.num_stages:
                    fuel_remaining = state.stage_propellant
                    fuel_total = stage_initial_fuel[state.stage_index]
                    fuel_pct = (fuel_remaining / fuel_total * 100) if fuel_total > 0 else 0
                else:
                    fuel_remaining = 0
                    fuel_pct = 0

                total_fuel_used = sum(stage_fuel_used)
                total_initial_fuel = sum(stage_initial_fuel)
                total_fuel_pct = ((total_initial_fuel - total_fuel_used) / total_initial_fuel * 100) if total_initial_fuel > 0 else 0

                f_thrust = np.linalg.norm(forces['force_thrust'])
                f_drag = np.linalg.norm(forces['force_drag'])
                f_grav = np.linalg.norm(forces['force_gravity'])
                acc = forces['acceleration']
                acc_mag = np.linalg.norm(acc)

                # TWR (Thrust to Weight Ratio)
                twr = f_thrust / (state.mass * 9.80665) if state.mass > 0 else 0

                print(f"\n┌─ T+{format_time(state.time)} {'─' * 100}")
                print(f"│ STAGE {state.stage_index + 1}  {'BURNING' if state.is_burning else 'COAST'}  "
                      f"TWR: {twr:.2f}  Q: {q:.0f} Pa  FPA: {math.degrees(state.flight_path_angle):+.1f}°")

                print(f"├─ POSITION ─────────────────────────────────────────────────────────────────────────────────────────")
                print(f"│   X: {state.position[0]:+15.1f} m    Y: {state.position[1]:+15.1f} m    Z: {state.position[2]:+15.1f} m")
                print(f"│   Altitude: {state.altitude/1000:10.3f} km    Distance from center: {np.linalg.norm(state.position)/1000:.3f} km")

                print(f"├─ VELOCITY ─────────────────────────────────────────────────────────────────────────────────────────")
                print(f"│   Vx: {state.velocity[0]:+12.2f} m/s    Vy: {state.velocity[1]:+12.2f} m/s    Vz: {state.velocity[2]:+12.2f} m/s")
                print(f"│   Speed: {state.speed:10.2f} m/s ({state.speed/1000:.3f} km/s)    Mach: {state.speed / 343:.1f}")

                print(f"├─ ACCELERATION ─────────────────────────────────────────────────────────────────────────────────────")
                print(f"│   Ax: {acc[0]:+12.4f} m/s²   Ay: {acc[1]:+12.4f} m/s²   Az: {acc[2]:+12.4f} m/s²")
                print(f"│   Total: {acc_mag:10.4f} m/s² ({acc_mag/9.80665:.2f} g)")

                print(f"├─ FORCES ───────────────────────────────────────────────────────────────────────────────────────────")
                print(f"│   Thrust:  {f_thrust/1e6:8.3f} MN  [{forces['force_thrust'][0]/1e6:+8.3f}, {forces['force_thrust'][1]/1e6:+8.3f}, {forces['force_thrust'][2]/1e6:+8.3f}] MN")
                print(f"│   Drag:    {f_drag/1000:8.3f} kN  [{forces['force_drag'][0]/1000:+8.3f}, {forces['force_drag'][1]/1000:+8.3f}, {forces['force_drag'][2]/1000:+8.3f}] kN")
                print(f"│   Gravity: {f_grav/1e6:8.3f} MN  [{forces['force_gravity'][0]/1e6:+8.3f}, {forces['force_gravity'][1]/1e6:+8.3f}, {forces['force_gravity'][2]/1e6:+8.3f}] MN")

                print(f"├─ MASS & FUEL ──────────────────────────────────────────────────────────────────────────────────────")
                print(f"│   Total Mass: {state.mass/1000:10.3f} t    Consumed: {(initial_mass - state.mass)/1000:.3f} t")
                print(f"│   Stage {state.stage_index + 1} Fuel: {fuel_remaining/1000:8.3f} t ({fuel_pct:5.1f}%)    "
                      f"Total Fuel Remaining: {total_fuel_pct:5.1f}%")

                print(f"└{'─' * 115}")
            else:
                status = "BURN" if state.is_burning else "COAST"
                print(f"T+{state.time:7.1f}s  Alt:{state.altitude/1000:8.2f}km  "
                      f"Vel:{state.speed:8.1f}m/s  Stage:{state.stage_index+1}  {status}")

    real_elapsed = time.time() - start_real_time

    # Export CSV
    if full_output and trajectory_data:
        csv_file = output_file or f"trajectory_{rocket.name.replace(' ', '_')}_{int(time.time())}.csv"
        with open(csv_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=trajectory_data[0].keys())
            writer.writeheader()
            writer.writerows(trajectory_data)
        print(f"\n  Trajectory exported to: {csv_file}")

    # Get result
    result = simulator.get_result()

    print("\n" + "=" * 80)
    print("  SIMULATION COMPLETE")
    print("=" * 80)

    print(f"\n  Result: {'SUCCESS' if result.success else 'FAILURE'}")
    print(f"  Reason: {result.reason}")

    print(f"\n  Final State:")
    print(f"    Mission Time: {format_time(state.time)}")
    print(f"    Altitude: {format_altitude(state.altitude)}")
    print(f"    Speed: {format_velocity(state.speed)}")
    print(f"    Flight Path Angle: {math.degrees(state.flight_path_angle):.2f}°")
    print(f"    Final Mass: {state.mass:.1f} kg ({state.mass/1000:.2f} t)")

    print(f"\n  Final Velocity (ECI):")
    print(f"    Vx: {state.velocity[0]:+12.2f} m/s")
    print(f"    Vy: {state.velocity[1]:+12.2f} m/s")
    print(f"    Vz: {state.velocity[2]:+12.2f} m/s")

    print(f"\n  Final Position (ECI):")
    print(f"    X: {state.position[0]:+15.1f} m ({state.position[0]/1000:+.1f} km)")
    print(f"    Y: {state.position[1]:+15.1f} m ({state.position[1]/1000:+.1f} km)")
    print(f"    Z: {state.position[2]:+15.1f} m ({state.position[2]/1000:+.1f} km)")

    print(f"\n  Fuel Consumption:")
    total_fuel_consumed = initial_mass - state.mass
    print(f"    Total Consumed: {total_fuel_consumed/1000:.2f} t ({total_fuel_consumed/initial_mass*100:.1f}% of launch mass)")
    for i, stage in enumerate(rocket.stages):
        consumed = stage_fuel_used[i]
        initial = stage_initial_fuel[i]
        pct = (consumed / initial * 100) if initial > 0 else 0
        print(f"    Stage {i+1}: {consumed/1000:.2f} t / {initial/1000:.2f} t ({pct:.1f}% used)")

    if result.orbit:
        print(f"\n  Orbital Parameters:")
        orbit = result.orbit
        print(f"    Periapsis: {format_altitude(orbit.get('periapsis_altitude', 0))}")
        print(f"    Apoapsis: {format_altitude(orbit.get('apoapsis_altitude', 0))}")
        print(f"    Inclination: {orbit.get('inclination_degrees', 0):.4f}°")
        print(f"    Eccentricity: {orbit.get('eccentricity', 0):.6f}")
        print(f"    Period: {format_time_short(orbit.get('period', 0))}")

    print(f"\n  Performance:")
    print(f"    Simulation time: {format_time(state.time)}")
    print(f"    Real time: {real_elapsed:.3f}s")
    print(f"    Speed: {state.time / real_elapsed:.0f}x real-time")

    print("\n  Events:")
    for event in result.events:
        print(f"    T+{format_time(event.time):>12}: {event.type.value}")

    print()
    return result


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Rocket Launch Simulator - Debug Mode",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python debug.py                                    # Falcon 9 with defaults
  python debug.py --config configs/custom.json      # Load from config file
  python debug.py --template > my_rocket.json       # Generate template config
  python debug.py --rocket saturn_v                  # Use Saturn V preset
  python debug.py --s1-fuel 450000 --s1-thrust 8e6  # Override stage 1
  python debug.py --pitch-angle 3.0                  # Adjust pitchover
  python debug.py -v --interval 5                    # Verbose, 5s interval

Stage 1 Parameters:
  --s1-dry-mass, --s1-fuel, --s1-thrust, --s1-thrust-vac,
  --s1-isp, --s1-isp-vac, --s1-engines, --s1-cd, --s1-area

Stage 2 Parameters:
  --s2-dry-mass, --s2-fuel, --s2-thrust, --s2-thrust-vac,
  --s2-isp, --s2-isp-vac, --s2-engines

Flight Profile:
  --pitch-angle, --pitch-duration, --vertical-alt,
  --target-alt, --target-inc, --fairing-alt
        """
    )

    # Basic options
    parser.add_argument("--config", "-c", type=str, help="Load configuration from JSON file")
    parser.add_argument("--rocket", "-r", type=str, default="falcon9", help="Rocket preset (default: falcon9)")
    parser.add_argument("--payload", "-p", type=float, help="Payload mass in kg")
    parser.add_argument("--list", "-l", action="store_true", help="List available presets")
    parser.add_argument("--template", action="store_true", help="Generate template config file")
    parser.add_argument("--test-physics", "-t", action="store_true", help="Test physics modules")

    # Stage 1 overrides
    s1 = parser.add_argument_group("Stage 1 Parameters")
    s1.add_argument("--s1-dry-mass", type=float, help="Stage 1 dry mass (kg)")
    s1.add_argument("--s1-fuel", type=float, help="Stage 1 propellant mass (kg)")
    s1.add_argument("--s1-thrust", type=float, help="Stage 1 thrust at sea level (N)")
    s1.add_argument("--s1-thrust-vac", type=float, help="Stage 1 thrust in vacuum (N)")
    s1.add_argument("--s1-isp", type=float, help="Stage 1 Isp at sea level (s)")
    s1.add_argument("--s1-isp-vac", type=float, help="Stage 1 Isp in vacuum (s)")
    s1.add_argument("--s1-engines", type=int, help="Stage 1 number of engines")
    s1.add_argument("--s1-cd", type=float, help="Stage 1 drag coefficient")
    s1.add_argument("--s1-area", type=float, help="Stage 1 reference area (m²)")

    # Stage 2 overrides
    s2 = parser.add_argument_group("Stage 2 Parameters")
    s2.add_argument("--s2-dry-mass", type=float, help="Stage 2 dry mass (kg)")
    s2.add_argument("--s2-fuel", type=float, help="Stage 2 propellant mass (kg)")
    s2.add_argument("--s2-thrust", type=float, help="Stage 2 thrust (N)")
    s2.add_argument("--s2-thrust-vac", type=float, help="Stage 2 thrust in vacuum (N)")
    s2.add_argument("--s2-isp", type=float, help="Stage 2 Isp (s)")
    s2.add_argument("--s2-isp-vac", type=float, help="Stage 2 Isp in vacuum (s)")
    s2.add_argument("--s2-engines", type=int, help="Stage 2 number of engines")

    # Flight profile overrides
    fp = parser.add_argument_group("Flight Profile")
    fp.add_argument("--pitch-angle", type=float, help="Pitchover kick angle (degrees)")
    fp.add_argument("--pitch-duration", type=float, help="Pitchover duration (seconds)")
    fp.add_argument("--vertical-alt", type=float, help="Vertical ascent altitude (m)")
    fp.add_argument("--target-alt", type=float, help="Target orbit altitude (m)")
    fp.add_argument("--target-inc", type=float, help="Target inclination (degrees)")
    fp.add_argument("--fairing-alt", type=float, help="Fairing jettison altitude (m)")

    # Simulation options
    sim = parser.add_argument_group("Simulation Options")
    sim.add_argument("--dt", type=float, default=0.1, help="Time step (s, default: 0.1)")
    sim.add_argument("--max-time", type=float, default=1800, help="Max sim time (s, default: 1800)")
    sim.add_argument("--interval", type=float, default=10.0, help="Print interval (s, default: 10)")
    sim.add_argument("--verbose", "-v", action="store_true", help="Verbose 3D output")
    sim.add_argument("--full", "-f", action="store_true", help="Export full trajectory to CSV")
    sim.add_argument("--output", "-o", type=str, help="Output CSV filename")

    args = parser.parse_args()

    print_header()

    if args.list:
        list_rockets()
        return

    if args.template:
        print(generate_template_config())
        return

    if args.test_physics:
        test_physics()
        return

    # Build rocket and profile from args
    rocket, profile_config, sim_config = build_rocket_from_args(args)

    # Run simulation
    run_simulation(
        rocket=rocket,
        profile_config=profile_config,
        sim_config=sim_config,
        verbose=args.verbose,
        full_output=args.full,
        output_file=args.output,
    )


if __name__ == "__main__":
    main()
