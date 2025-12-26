"""
FastAPI application for rocket launch simulator.
"""

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

from .api.routes import router
from .api.websocket import simulation_websocket

# Create FastAPI app
app = FastAPI(
    title="Rocket Launch Simulator",
    description="Real-time rocket launch simulation with physics-based trajectory modeling",
    version="1.0.0",
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include REST API routes
app.include_router(router)


# WebSocket endpoint for simulation
@app.websocket("/ws/simulation")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time simulation streaming."""
    await simulation_websocket(websocket)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "rocket-simulator"}


# Root endpoint with API info
@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Rocket Launch Simulator API",
        "version": "1.0.0",
        "endpoints": {
            "REST API": "/api",
            "WebSocket": "/ws/simulation",
            "API Docs": "/docs",
            "Health": "/health",
        },
        "features": [
            "Real-time rocket launch simulation",
            "US Standard Atmosphere 1976",
            "Multi-stage rocket support",
            "Orbital mechanics",
            "WebSocket streaming",
        ],
    }


# API documentation customization
@app.get("/api", include_in_schema=False)
async def api_info():
    """API endpoint information."""
    return {
        "rockets": {
            "GET /api/rockets": "List available rocket presets",
            "GET /api/rockets/{name}": "Get rocket details",
            "POST /api/rockets/validate": "Validate custom rocket config",
        },
        "launch_sites": {
            "GET /api/launch-sites": "List available launch sites",
            "GET /api/launch-sites/{id}": "Get launch site details",
        },
        "physics": {
            "GET /api/physics/constants": "Get physics constants",
            "GET /api/atmosphere/{altitude}": "Get atmosphere at altitude",
            "GET /api/orbit/velocity/{altitude}": "Get orbital velocity",
        },
        "websocket": {
            "WS /ws/simulation": "Real-time simulation streaming",
            "commands": [
                {"start": "Start simulation with rocket config"},
                {"pause": "Pause simulation"},
                {"resume": "Resume simulation"},
                {"stop": "Stop simulation"},
                {"set_speed": "Set time acceleration"},
            ],
        },
    }
