"""
Main simulation engine for rocket launch.
"""

import asyncio
import math
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, AsyncGenerator, Callable

import numpy as np

from .state import SimulationState, create_initial_state
from .integrator import rk4_step
from .flight_profile import GravityTurnProfile, FlightProfileConfig, compute_launch_azimuth
from ..rocket.rocket import Rocket, LAUNCH_SITES
from ..physics.constants import EARTH_RADIUS_MEAN
from ..physics.aerodynamics import dynamic_pressure


class SimulationEventType(Enum):
    """Types of simulation events."""
    LIFTOFF = "liftoff"
    MAX_Q = "max_q"
    STAGE_SEPARATION = "stage_separation"
    FAIRING_JETTISON = "fairing_jettison"
    MECO = "meco"  # Main Engine Cut-Off
    SECO = "seco"  # Second Engine Cut-Off
    ORBIT_INSERTION = "orbit_insertion"
    MISSION_COMPLETE = "mission_complete"
    MISSION_FAILURE = "mission_failure"


@dataclass
class SimulationEvent:
    """An event during the simulation."""
    type: SimulationEventType
    time: float
    altitude: float
    velocity: float
    data: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "type": "event",
            "event": self.type.value,
            "time": self.time,
            "altitude": self.altitude,
            "velocity": self.velocity,
            **self.data,
        }


@dataclass
class SimulationResult:
    """Final result of simulation."""
    success: bool
    reason: str
    final_state: SimulationState
    events: List[SimulationEvent]
    trajectory: List[dict]
    orbit: Optional[dict] = None


class Simulator:
    """
    Main rocket launch simulator.

    Runs the simulation loop, handling:
    - Physics integration
    - Stage separation
    - Event detection
    - Orbit determination
    """

    def __init__(
        self,
        rocket: Rocket,
        profile_config: Optional[FlightProfileConfig] = None,
        time_step: float = 0.1,  # seconds
        max_simulation_time: float = 3600.0,  # 1 hour max
        time_acceleration: float = 1.0,  # simulation speed multiplier
    ):
        self.rocket = rocket
        self.profile = GravityTurnProfile(profile_config or FlightProfileConfig())
        self.dt = time_step
        self.max_time = max_simulation_time
        self.time_acceleration = time_acceleration

        # State
        self.state: Optional[SimulationState] = None
        self.events: List[SimulationEvent] = []
        self.trajectory: List[dict] = []

        # Tracking variables
        self._max_q_value = 0.0
        self._max_q_reached = False
        self._last_burning_state = True
        self._launch_azimuth = 90.0

        # Control flags
        self._running = False
        self._paused = False

    def initialize(self) -> SimulationState:
        """Initialize simulation state."""
        launch_site = self.rocket.launch_site_info

        # Compute launch azimuth for target inclination
        self._launch_azimuth = compute_launch_azimuth(
            launch_site.latitude,
            self.profile.config.target_inclination,
        )

        self.state = create_initial_state(
            self.rocket,
            launch_site.latitude,
            launch_site.longitude,
            launch_site.altitude,
        )

        self.events = []
        self.trajectory = []
        self._max_q_value = 0.0
        self._max_q_reached = False
        self._last_burning_state = True

        # Record liftoff event
        self._add_event(SimulationEventType.LIFTOFF, {})

        return self.state

    def step(self) -> SimulationState:
        """
        Perform one simulation step.

        Returns:
            Updated simulation state
        """
        if self.state is None:
            self.initialize()

        # Get thrust direction
        thrust_dir = self.profile.get_thrust_direction(
            self.state,
            self._launch_azimuth,
        )

        # Store previous burning state for event detection
        was_burning = self.state.is_burning
        previous_stage = self.state.stage_index

        # Perform integration step
        self.state, propellant_used = rk4_step(
            self.state,
            self.rocket,
            thrust_dir,
            self.dt,
        )

        # Check for Max-Q
        self._check_max_q()

        # Check for fairing jettison
        self._check_fairing_jettison()

        # Check for stage separation
        if was_burning and not self.state.is_burning:
            self._handle_stage_burnout(previous_stage)

        # Record trajectory point (every 10 steps to reduce data)
        if len(self.trajectory) == 0 or self.state.time - self.trajectory[-1]["time"] >= 1.0:
            self.trajectory.append(self.state.to_dict())

        return self.state

    def _check_max_q(self):
        """Check for maximum dynamic pressure."""
        if self._max_q_reached:
            return

        q = dynamic_pressure(self.state.velocity, self.state.altitude)

        if q > self._max_q_value:
            self._max_q_value = q
        elif q < 0.9 * self._max_q_value and self._max_q_value > 10000:
            # We've passed Max-Q
            self._max_q_reached = True
            self._add_event(SimulationEventType.MAX_Q, {
                "dynamic_pressure": self._max_q_value,
                "mach": self.state.speed / 343,  # Approximate
            })

    def _check_fairing_jettison(self):
        """Check and handle fairing jettison."""
        if self.state.fairing_jettisoned:
            return

        if self.profile.should_jettison_fairing(self.state):
            self.state.fairing_jettisoned = True
            # Update mass
            self.state.mass -= self.rocket.fairing_mass
            self._add_event(SimulationEventType.FAIRING_JETTISON, {
                "mass_jettisoned": self.rocket.fairing_mass,
            })

    def _handle_stage_burnout(self, stage_index: int):
        """Handle engine cutoff and stage separation."""
        # Add MECO/SECO event
        if stage_index == 0:
            self._add_event(SimulationEventType.MECO, {"stage": stage_index})
        else:
            self._add_event(SimulationEventType.SECO, {"stage": stage_index})

        # Check if there are more stages
        if stage_index + 1 < self.rocket.num_stages:
            # Perform stage separation
            current_stage = self.rocket.stages[stage_index]

            # Update mass (remove spent stage dry mass)
            self.state.mass -= current_stage.dry_mass

            # Move to next stage
            self.state.stage_index = stage_index + 1
            next_stage = self.rocket.stages[stage_index + 1]
            self.state.stage_propellant = next_stage.propellant_mass
            self.state.is_burning = True

            self._add_event(SimulationEventType.STAGE_SEPARATION, {
                "stage_jettisoned": stage_index,
                "new_stage": stage_index + 1,
                "mass_jettisoned": current_stage.dry_mass,
            })

    def _add_event(self, event_type: SimulationEventType, data: dict):
        """Add a simulation event."""
        event = SimulationEvent(
            type=event_type,
            time=self.state.time,
            altitude=self.state.altitude,
            velocity=self.state.speed,
            data=data,
        )
        self.events.append(event)

    def is_complete(self) -> bool:
        """Check if simulation is complete."""
        if self.state is None:
            return False

        # Exceeded max time
        if self.state.time >= self.max_time:
            return True

        # Crashed into Earth
        if self.state.altitude < -100:  # Below sea level
            return True

        # Orbit achieved
        if self.profile.is_orbit_achieved(self.state):
            return True

        # All stages burned and coasting down
        if self.state.stage_index >= self.rocket.num_stages:
            # Check if we're falling back
            if self.state.radial_velocity < -100 and self.state.altitude < 100_000:
                return True

        return False

    def get_result(self) -> SimulationResult:
        """Get the final simulation result."""
        from ..orbit.elements import compute_orbital_elements
        from ..orbit.analysis import analyze_orbit

        if self.state is None:
            raise ValueError("Simulation not started")

        # Compute orbital elements
        orbital_elements = compute_orbital_elements(
            self.state.position,
            self.state.velocity,
        )

        # Analyze orbit
        orbit_result = analyze_orbit(orbital_elements)

        if orbit_result.success:
            self._add_event(SimulationEventType.ORBIT_INSERTION, {
                "periapsis": orbital_elements.periapsis_altitude,
                "apoapsis": orbital_elements.apoapsis_altitude,
                "inclination": orbital_elements.inclination_degrees,
                "eccentricity": orbital_elements.eccentricity,
            })
            self._add_event(SimulationEventType.MISSION_COMPLETE, {
                "success": True,
            })
            return SimulationResult(
                success=True,
                reason="Orbit achieved",
                final_state=self.state,
                events=self.events,
                trajectory=self.trajectory,
                orbit=orbital_elements.to_dict(),
            )
        else:
            self._add_event(SimulationEventType.MISSION_FAILURE, {
                "reason": orbit_result.reason,
            })
            return SimulationResult(
                success=False,
                reason=orbit_result.reason,
                final_state=self.state,
                events=self.events,
                trajectory=self.trajectory,
                orbit=orbital_elements.to_dict() if orbital_elements else None,
            )

    async def run_async(
        self,
        on_state: Optional[Callable[[SimulationState], None]] = None,
        on_event: Optional[Callable[[SimulationEvent], None]] = None,
        update_interval: float = 0.05,  # 20 Hz
    ) -> SimulationResult:
        """
        Run simulation asynchronously with callbacks.

        Args:
            on_state: Callback for state updates
            on_event: Callback for events
            update_interval: Time between updates (seconds)

        Returns:
            Final simulation result
        """
        self.initialize()
        self._running = True

        last_update = 0.0
        last_event_count = 0

        while self._running and not self.is_complete():
            if self._paused:
                await asyncio.sleep(0.1)
                continue

            # Run multiple physics steps per update
            steps_per_update = max(1, int(update_interval / self.dt * self.time_acceleration))

            for _ in range(steps_per_update):
                if self.is_complete():
                    break
                self.step()

            # Send state update
            if on_state and self.state.time - last_update >= update_interval:
                on_state(self.state)
                last_update = self.state.time

            # Send new events
            if on_event:
                for event in self.events[last_event_count:]:
                    on_event(event)
                last_event_count = len(self.events)

            # Yield to event loop
            await asyncio.sleep(update_interval / self.time_acceleration)

        self._running = False
        return self.get_result()

    async def stream_states(
        self,
        update_interval: float = 0.05,
    ) -> AsyncGenerator[dict, None]:
        """
        Stream simulation states as an async generator.

        Yields state dictionaries for WebSocket transmission.
        """
        self.initialize()
        self._running = True

        # Yield initial state
        yield {
            "type": "state",
            **self.state.to_dict(),
            "acceleration": 0.0,
            "dynamic_pressure": 0.0,
            "fuel_remaining": 1.0,
        }

        last_event_count = 0

        while self._running and not self.is_complete():
            if self._paused:
                await asyncio.sleep(0.1)
                continue

            # Run physics steps
            steps_per_update = max(1, int(update_interval / self.dt * self.time_acceleration))

            for _ in range(steps_per_update):
                if self.is_complete():
                    break
                prev_velocity = self.state.speed
                self.step()

            # Calculate derived values
            acceleration = (self.state.speed - prev_velocity) / (self.dt * steps_per_update)
            q = dynamic_pressure(self.state.velocity, self.state.altitude)

            # Fuel remaining in current stage
            if self.state.stage_index < self.rocket.num_stages:
                stage = self.rocket.stages[self.state.stage_index]
                fuel_remaining = self.state.stage_propellant / stage.propellant_mass
            else:
                fuel_remaining = 0.0

            # Yield events first
            for event in self.events[last_event_count:]:
                yield event.to_dict()
            last_event_count = len(self.events)

            # Yield state
            yield {
                "type": "state",
                **self.state.to_dict(),
                "acceleration": float(acceleration),
                "dynamic_pressure": float(q),
                "fuel_remaining": float(fuel_remaining),
            }

            await asyncio.sleep(update_interval / self.time_acceleration)

        # Yield final result
        result = self.get_result()
        yield {
            "type": "complete",
            "success": bool(result.success),
            "reason": str(result.reason),
            "orbit": result.orbit,
        }

        self._running = False

    def pause(self):
        """Pause the simulation."""
        self._paused = True

    def resume(self):
        """Resume the simulation."""
        self._paused = False

    def stop(self):
        """Stop the simulation."""
        self._running = False

    def set_time_acceleration(self, factor: float):
        """Set simulation speed multiplier."""
        self.time_acceleration = max(0.1, min(100.0, factor))
