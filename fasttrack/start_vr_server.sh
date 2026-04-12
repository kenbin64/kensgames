#!/bin/bash

# ============================================================
# FastTrack VR Server Launcher
# ============================================================
# Starts the game server with HTTPS for Meta Quest VR
# WebXR requires HTTPS for security

echo "🥽 FastTrack VR Server Launcher"
echo "================================"
echo ""

# Check if running from correct directory
if [ ! -f "board_3d.html" ]; then
    echo "❌ Error: Must run from /web/games/fasttrack/ directory"
    echo "   cd /opt/butterflyfx/dimensionsos/web/games/fasttrack"
    exit 1
fi

# Get local IP address
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo "📡 Local IP: $LOCAL_IP"
echo ""

# Check if ngrok is installed (for HTTPS tunnel)
if command -v ngrok &> /dev/null; then
    echo "✅ ngrok found - will create HTTPS tunnel"
    USE_NGROK=true
else
    echo "⚠️  ngrok not found - VR will not work without HTTPS"
    echo ""
    echo "Install ngrok:"
    echo "  1. Visit: https://ngrok.com/download"
    echo "  2. Or: sudo snap install ngrok"
    echo ""
    read -p "Continue without HTTPS? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    USE_NGROK=false
fi

echo ""
echo "🚀 Starting server..."
echo ""

# Start Python server in background
cd ../../..  # Go to repo root
python3 -m http.server 8000 &
SERVER_PID=$!

echo "✅ Server started (PID: $SERVER_PID)"
sleep 2

# Start ngrok tunnel if available
if [ "$USE_NGROK" = true ]; then
    echo ""
    echo "🌐 Creating HTTPS tunnel..."
    ngrok http 8000 &
    NGROK_PID=$!
    
    sleep 3
    
    # Get ngrok URL
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | grep -o 'https://[^"]*' | head -1)
    
    if [ -n "$NGROK_URL" ]; then
        echo ""
        echo "✅ HTTPS Tunnel Active!"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🥽 META QUEST VR ACCESS:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "   $NGROK_URL/games/fasttrack/board_3d.html"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "📱 On your Meta Quest:"
        echo "   1. Open Meta Quest Browser"
        echo "   2. Enter the URL above"
        echo "   3. Click '🥽 Enter VR' button"
        echo ""
    else
        echo "❌ Failed to get ngrok URL"
        echo "   Check: http://localhost:4040"
    fi
else
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⚠️  HTTP ONLY (VR will not work)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "   http://$LOCAL_IP:8000/games/fasttrack/board_3d.html"
    echo ""
    echo "   Install ngrok for VR support!"
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💻 Desktop Access:"
echo "   http://localhost:8000/games/fasttrack/board_3d.html"
echo ""
echo "🛑 Press Ctrl+C to stop server"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $SERVER_PID 2>/dev/null
    if [ -n "$NGROK_PID" ]; then
        kill $NGROK_PID 2>/dev/null
    fi
    echo "✅ Servers stopped"
    exit 0
}

trap cleanup INT TERM

# Keep script running
wait

