#!/usr/bin/env python3
"""
Development server launcher for rocket simulator.
"""

import uvicorn


def main():
    """Run the development server."""
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["src"],
        log_level="info",
    )


if __name__ == "__main__":
    main()
