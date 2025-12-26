"""
WebSocket endpoint for real-time simulation streaming.
"""

import asyncio
import json
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect

from ..rocket.presets import get_preset
from ..rocket.rocket import Rocket
from ..rocket.stage import Stage
from ..simulation.simulator import Simulator
from ..simulation.flight_profile import FlightProfileConfig
from ..models.schemas import WebSocketCommand, RocketConfig


class SimulationManager:
    """Manages active simulation sessions."""

    def __init__(self):
        self.active_simulations: dict[WebSocket, Simulator] = {}
        self.streaming_tasks: dict[WebSocket, asyncio.Task] = {}

    async def handle_connection(self, websocket: WebSocket):
        """Handle a new WebSocket connection."""
        await websocket.accept()

        try:
            while True:
                # Receive command
                data = await websocket.receive_text()

                try:
                    command = json.loads(data)
                    await self.process_command(websocket, command)
                except json.JSONDecodeError:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Invalid JSON"
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e)
                    })

        except WebSocketDisconnect:
            # Clean up simulation if running
            await self._cleanup_simulation(websocket)

    async def _cleanup_simulation(self, websocket: WebSocket):
        """Clean up simulation and streaming task for a websocket."""
        if websocket in self.streaming_tasks:
            self.streaming_tasks[websocket].cancel()
            try:
                await self.streaming_tasks[websocket]
            except asyncio.CancelledError:
                pass
            del self.streaming_tasks[websocket]

        if websocket in self.active_simulations:
            self.active_simulations[websocket].stop()
            del self.active_simulations[websocket]

    async def process_command(self, websocket: WebSocket, command: dict):
        """Process a command from the client."""
        action = command.get("action")

        if action == "start":
            await self.start_simulation(websocket, command)
        elif action == "pause":
            await self.pause_simulation(websocket)
        elif action == "resume":
            await self.resume_simulation(websocket)
        elif action == "stop":
            await self.stop_simulation(websocket)
        elif action == "set_speed":
            self.set_speed(websocket, command.get("speed", 1.0))
        else:
            await websocket.send_json({
                "type": "error",
                "message": f"Unknown action: {action}"
            })

    async def start_simulation(self, websocket: WebSocket, command: dict):
        """Start a new simulation."""
        # Stop any existing simulation
        await self._cleanup_simulation(websocket)

        # Get rocket configuration
        rocket_name = command.get("rocket", "falcon9")
        payload_mass = command.get("payload_mass")
        custom_config = command.get("custom_config")

        if rocket_name == "custom" and custom_config:
            # Build custom rocket
            rocket = self._build_custom_rocket(custom_config)
        else:
            # Use preset
            rocket = get_preset(rocket_name, payload_mass)
            if rocket is None:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown rocket preset: {rocket_name}"
                })
                return

        # Configure flight profile
        target_altitude = command.get("target_altitude", 400_000)
        target_inclination = command.get("target_inclination", 28.5)
        time_acceleration = command.get("time_acceleration", 1.0)

        profile_config = FlightProfileConfig(
            target_altitude=target_altitude,
            target_inclination=target_inclination,
        )

        # Create simulator
        simulator = Simulator(
            rocket=rocket,
            profile_config=profile_config,
            time_acceleration=time_acceleration,
        )

        self.active_simulations[websocket] = simulator

        # Send confirmation
        await websocket.send_json({
            "type": "info",
            "message": f"Starting simulation with {rocket.name}",
            "rocket": rocket.to_dict(),
        })

        # Start streaming in a background task so we can receive commands
        task = asyncio.create_task(self._stream_simulation(websocket, simulator))
        self.streaming_tasks[websocket] = task

    async def _stream_simulation(self, websocket: WebSocket, simulator: Simulator):
        """Stream simulation states to the client."""
        try:
            async for state_data in simulator.stream_states(update_interval=0.05):
                await websocket.send_json(state_data)

                # Check if simulation was stopped externally
                if websocket not in self.active_simulations:
                    break

        except asyncio.CancelledError:
            # Task was cancelled (stop was called)
            pass
        except Exception as e:
            await websocket.send_json({
                "type": "error",
                "message": f"Simulation error: {str(e)}"
            })
        finally:
            if websocket in self.active_simulations:
                del self.active_simulations[websocket]
            if websocket in self.streaming_tasks:
                del self.streaming_tasks[websocket]

    def _build_custom_rocket(self, config: dict) -> Rocket:
        """Build a rocket from custom configuration."""
        stages = []
        for stage_config in config.get("stages", []):
            stage = Stage(
                name=stage_config.get("name", "Custom Stage"),
                dry_mass=stage_config["dry_mass"],
                propellant_mass=stage_config["propellant_mass"],
                thrust_sl=stage_config.get("thrust_sl", stage_config["thrust_vac"]),
                thrust_vac=stage_config["thrust_vac"],
                isp_sl=stage_config.get("isp_sl", stage_config["isp_vac"]),
                isp_vac=stage_config["isp_vac"],
                burn_time=stage_config["burn_time"],
                diameter=stage_config["diameter"],
                cd=stage_config.get("cd", 0.3),
                num_engines=stage_config.get("num_engines", 1),
            )
            stages.append(stage)

        return Rocket(
            name=config.get("name", "Custom Rocket"),
            stages=stages,
            payload_mass=config.get("payload_mass", 0),
            fairing_mass=config.get("fairing_mass", 0),
            launch_site=config.get("launch_site", "cape_canaveral"),
        )

    async def pause_simulation(self, websocket: WebSocket):
        """Pause an active simulation."""
        if websocket in self.active_simulations:
            self.active_simulations[websocket].pause()
            await websocket.send_json({
                "type": "info",
                "message": "Simulation paused",
            })

    async def resume_simulation(self, websocket: WebSocket):
        """Resume a paused simulation."""
        if websocket in self.active_simulations:
            self.active_simulations[websocket].resume()
            await websocket.send_json({
                "type": "info",
                "message": "Simulation resumed",
            })

    async def stop_simulation(self, websocket: WebSocket):
        """Stop an active simulation."""
        if websocket in self.active_simulations:
            # Stop the simulator
            self.active_simulations[websocket].stop()

            # Cancel the streaming task
            if websocket in self.streaming_tasks:
                self.streaming_tasks[websocket].cancel()
                try:
                    await self.streaming_tasks[websocket]
                except asyncio.CancelledError:
                    pass
                if websocket in self.streaming_tasks:
                    del self.streaming_tasks[websocket]

            if websocket in self.active_simulations:
                del self.active_simulations[websocket]

            # Send confirmation that simulation was stopped
            await websocket.send_json({
                "type": "complete",
                "success": False,
                "reason": "Simulation aborted by user",
                "orbit": None,
            })

    def set_speed(self, websocket: WebSocket, speed: float):
        """Set simulation speed multiplier."""
        if websocket in self.active_simulations:
            self.active_simulations[websocket].set_time_acceleration(speed)


# Global simulation manager
simulation_manager = SimulationManager()


async def simulation_websocket(websocket: WebSocket):
    """WebSocket endpoint handler."""
    await simulation_manager.handle_connection(websocket)
