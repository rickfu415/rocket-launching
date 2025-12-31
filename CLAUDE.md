# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rocket launch simulator with realistic orbital mechanics. Python backend (FastAPI + WebSocket) handles physics simulation, JavaScript frontend (Three.js + Vite) handles 3D visualization.

## Commands

```bash
# Start both servers (from repo root)
./start.sh

# Stop servers
./stop.sh

# Backend only (port 8765)
cd backend && source venv/bin/activate && python -m src.main

# Frontend only (port 5173)
cd frontend && npm run dev
```

## Architecture

**Backend** (`backend/src/`):
- `simulation/` - Core physics: RK4 integrator, gravity turn flight profile, state management
- `physics/` - Atmosphere model, gravity, drag calculations
- `rocket/` - Rocket configs (Falcon 9, Saturn V, Electron, Starship) with multi-stage support
- `orbit/` - Orbital element calculations
- `api/` - WebSocket endpoint streams state at ~20Hz

**Frontend** (`frontend/src/`):
- `scene/` - Three.js: Earth, Rocket, Trajectory, Camera, GroundView (altitude < 20km)
- `simulation/` - WebSocket client, SimulationState (event emitter pattern)
- `ui/` - Controls, Telemetry, StartMenu panels
- `utils/` - ECI↔Scene coordinate conversion (SCENE_SCALE = 1/EARTH_RADIUS)

## Key Concepts

- **Coordinate systems**: Backend uses ECI (meters), frontend scales to Earth radii (1 unit = 6371 km)
- **View switching**: Ground view (< 20km altitude) vs orbital view, controlled by `simulationComplete` flag
- **State flow**: Backend → WebSocket → SimulationState → UI/Scene updates via event listeners
