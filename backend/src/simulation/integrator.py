"""
Numerical integration for rocket simulation.
Uses 4th-order Runge-Kutta (RK4) method.
"""

import numpy as np
from typing import Callable, Tuple

from .state import SimulationState
from ..physics.gravity import gravity_acceleration
from ..physics.atmosphere import Atmosphere
from ..physics.aerodynamics import drag_acceleration
from ..physics.constants import G0, EARTH_RADIUS_MEAN
from ..rocket.rocket import Rocket


def compute_acceleration(
    position: np.ndarray,
    velocity: np.ndarray,
    mass: float,
    thrust_magnitude: float,
    thrust_direction: np.ndarray,
    cd: float,
    area: float,
) -> np.ndarray:
    """
    Compute total acceleration on the rocket.

    F_total = F_thrust + F_gravity + F_drag
    a = F_total / m

    Args:
        position: Position vector (m)
        velocity: Velocity vector (m/s)
        mass: Current mass (kg)
        thrust_magnitude: Engine thrust (N)
        thrust_direction: Unit vector of thrust direction
        cd: Drag coefficient
        area: Reference area (m²)

    Returns:
        Acceleration vector (m/s²)
    """
    # Gravity acceleration
    a_gravity = gravity_acceleration(position)

    # Thrust acceleration
    if thrust_magnitude > 0 and mass > 0:
        a_thrust = (thrust_magnitude / mass) * thrust_direction
    else:
        a_thrust = np.zeros(3)

    # Drag acceleration
    altitude = np.linalg.norm(position) - EARTH_RADIUS_MEAN
    if altitude < 0:
        altitude = 0
    a_drag = drag_acceleration(velocity, altitude, cd, area, mass)

    return a_gravity + a_thrust + a_drag


def rk4_step(
    state: SimulationState,
    rocket: Rocket,
    thrust_direction: np.ndarray,
    dt: float,
) -> Tuple[SimulationState, float]:
    """
    Perform one RK4 integration step.

    Args:
        state: Current simulation state
        rocket: Rocket configuration
        thrust_direction: Unit vector for thrust direction
        dt: Time step (seconds)

    Returns:
        Tuple of (new_state, propellant_consumed)
    """
    # Get current stage info
    current_stage = rocket.get_stage_info(state.stage_index)
    if current_stage is None:
        # No more stages, coast phase
        return _coast_step(state, dt), 0.0

    # Get atmospheric pressure for thrust/Isp interpolation
    altitude = state.altitude
    if altitude < 0:
        altitude = 0
    pressure = Atmosphere.pressure(altitude)

    # Compute thrust and mass flow
    if state.is_burning and state.stage_propellant > 0:
        thrust = current_stage.thrust_at_pressure(pressure)
        isp = current_stage.isp_at_pressure(pressure)
        mass_flow = thrust / (isp * G0)
    else:
        thrust = 0.0
        mass_flow = 0.0

    # Reference area and drag coefficient
    cd = current_stage.cd
    area = current_stage.reference_area

    # Current state
    r = state.position
    v = state.velocity
    m = state.mass

    # RK4 for position and velocity
    # k1
    a1 = compute_acceleration(r, v, m, thrust, thrust_direction, cd, area)
    k1_r = v
    k1_v = a1

    # k2
    r2 = r + 0.5 * dt * k1_r
    v2 = v + 0.5 * dt * k1_v
    m2 = m - 0.5 * dt * mass_flow
    a2 = compute_acceleration(r2, v2, m2, thrust, thrust_direction, cd, area)
    k2_r = v2
    k2_v = a2

    # k3
    r3 = r + 0.5 * dt * k2_r
    v3 = v + 0.5 * dt * k2_v
    m3 = m - 0.5 * dt * mass_flow
    a3 = compute_acceleration(r3, v3, m3, thrust, thrust_direction, cd, area)
    k3_r = v3
    k3_v = a3

    # k4
    r4 = r + dt * k3_r
    v4 = v + dt * k3_v
    m4 = m - dt * mass_flow
    a4 = compute_acceleration(r4, v4, m4, thrust, thrust_direction, cd, area)
    k4_r = v4
    k4_v = a4

    # Combine
    new_position = r + (dt / 6) * (k1_r + 2*k2_r + 2*k3_r + k4_r)
    new_velocity = v + (dt / 6) * (k1_v + 2*k2_v + 2*k3_v + k4_v)

    # Mass and propellant update
    propellant_consumed = mass_flow * dt
    propellant_consumed = min(propellant_consumed, state.stage_propellant)

    new_mass = m - propellant_consumed
    new_propellant = state.stage_propellant - propellant_consumed

    # Create new state
    new_state = SimulationState(
        time=state.time + dt,
        position=new_position,
        velocity=new_velocity,
        mass=new_mass,
        stage_index=state.stage_index,
        stage_propellant=new_propellant,
        is_burning=state.is_burning and new_propellant > 0,
        fairing_jettisoned=state.fairing_jettisoned,
    )

    return new_state, propellant_consumed


def _coast_step(state: SimulationState, dt: float) -> SimulationState:
    """
    Perform a coast (no thrust) integration step.
    Used when all stages are expended.
    """
    r = state.position
    v = state.velocity

    # Only gravity affects motion
    # RK4 for position and velocity
    a1 = gravity_acceleration(r)
    k1_r = v
    k1_v = a1

    r2 = r + 0.5 * dt * k1_r
    v2 = v + 0.5 * dt * k1_v
    a2 = gravity_acceleration(r2)
    k2_r = v2
    k2_v = a2

    r3 = r + 0.5 * dt * k2_r
    v3 = v + 0.5 * dt * k2_v
    a3 = gravity_acceleration(r3)
    k3_r = v3
    k3_v = a3

    r4 = r + dt * k3_r
    v4 = v + dt * k3_v
    a4 = gravity_acceleration(r4)
    k4_r = v4
    k4_v = a4

    new_position = r + (dt / 6) * (k1_r + 2*k2_r + 2*k3_r + k4_r)
    new_velocity = v + (dt / 6) * (k1_v + 2*k2_v + 2*k3_v + k4_v)

    return SimulationState(
        time=state.time + dt,
        position=new_position,
        velocity=new_velocity,
        mass=state.mass,
        stage_index=state.stage_index,
        stage_propellant=0,
        is_burning=False,
        fairing_jettisoned=state.fairing_jettisoned,
    )


def adaptive_step(
    state: SimulationState,
    rocket: Rocket,
    thrust_direction: np.ndarray,
    dt_target: float,
    tolerance: float = 1e-6,
) -> Tuple[SimulationState, float, float]:
    """
    Adaptive time stepping using Richardson extrapolation.

    Takes one full step and two half steps, compares them
    to estimate error and adjust step size.

    Args:
        state: Current state
        rocket: Rocket configuration
        thrust_direction: Thrust direction unit vector
        dt_target: Target time step
        tolerance: Error tolerance

    Returns:
        Tuple of (new_state, actual_dt, estimated_error)
    """
    # Full step
    state_full, _ = rk4_step(state, rocket, thrust_direction, dt_target)

    # Two half steps
    state_half, _ = rk4_step(state, rocket, thrust_direction, dt_target / 2)
    state_two_half, _ = rk4_step(state_half, rocket, thrust_direction, dt_target / 2)

    # Error estimate (difference in position)
    error = np.linalg.norm(state_two_half.position - state_full.position)

    # Use the more accurate two-half-step result
    return state_two_half, dt_target, error
