#!/usr/bin/env python3
"""
Fast Track Server Launcher
Starts the lobby server and optionally a web server for the game files.
"""

import argparse
import asyncio
import subprocess
import sys
import os
from pathlib import Path

# Add server directory to path
SERVER_DIR = Path(__file__).parent / "server"
sys.path.insert(0, str(SERVER_DIR))


def main():
    parser = argparse.ArgumentParser(description="Fast Track Game Server")
    parser.add_argument("--lobby-port", type=int, default=8765, 
                        help="WebSocket lobby server port (default: 8765)")
    parser.add_argument("--web-port", type=int, default=8080,
                        help="HTTP web server port (default: 8080)")
    parser.add_argument("--host", default="0.0.0.0",
                        help="Host to bind to (default: 0.0.0.0)")
    parser.add_argument("--no-web", action="store_true",
                        help="Don't start the web server")
    parser.add_argument("--lobby-only", action="store_true",
                        help="Only start the lobby server")
    
    args = parser.parse_args()
    
    print("""
╔═══════════════════════════════════════════════════════════╗
║                    🎯 FAST TRACK 🎯                       ║
║                   Game Server Launcher                     ║
╚═══════════════════════════════════════════════════════════╝
    """)
    
    # Start web server
    web_process = None
    if not args.no_web and not args.lobby_only:
        print(f"[Web] Starting HTTP server on port {args.web_port}...")
        web_dir = Path(__file__).parent
        web_process = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(args.web_port), "--bind", args.host],
            cwd=str(web_dir),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        print(f"[Web] ✓ Serving game files at http://{args.host}:{args.web_port}/")
        print(f"[Web] ✓ Game URL: http://localhost:{args.web_port}/lobby.html")
    
    # Start lobby server
    print(f"[Lobby] Starting WebSocket server on port {args.lobby_port}...")
    
    try:
        from lobby_server import LobbyServer
        
        server = LobbyServer(host=args.host, port=args.lobby_port)
        
        print(f"[Lobby] ✓ WebSocket server ready at ws://{args.host}:{args.lobby_port}/")
        print()
        print("═" * 60)
        print("Server is running! Press Ctrl+C to stop.")
        print("═" * 60)
        print()
        
        asyncio.run(server.start())
        
    except KeyboardInterrupt:
        print("\n[Server] Shutting down...")
    except Exception as e:
        print(f"[Error] {e}")
    finally:
        if web_process:
            web_process.terminate()
            print("[Web] Stopped")
        print("[Server] Goodbye!")


if __name__ == "__main__":
    main()
