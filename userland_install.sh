#!/bin/bash

echo "📱 Mobile Server Installer for UserLAnd (Ubuntu/Debian)"
echo "======================================================"

# 1. Update Packages
echo "[1/4] Updating Package Lists..."
sudo apt update && sudo apt upgrade -y

# 2. Install Dependencies
echo "[2/4] Installing Python & Tools..."
# Install Python3, pip, and system build libraries
sudo apt install -y python3 python3-pip git build-essential libssl-dev libffi-dev python3-dev pkg-config

# Install multimedia libraries for WebRTC (aiortc)
# These help if pre-built wheels are not available for the phone's architecture
sudo apt install -y libavdevice-dev libavfilter-dev libopus-dev libvpx-dev libsrtp2-dev

# 3. Setup Python Environment
echo "[3/4] Installing Python Libraries..."

# Upgrade pip
pip3 install --upgrade pip

# Install Project Requirements
# Note: On some modern Ubuntu/Debian, pip might require --break-system-packages. 
# We add it conditionally or just try. For UserLAnd, usually it's fine or we use it.
pip3 install fastapi uvicorn python-socketio aiortc deep-translator python-multipart openai --break-system-packages || pip3 install fastapi uvicorn python-socketio aiortc deep-translator python-multipart openai

# Install heavy data libraries
echo "Attempting to install Pandas & OpenPyXL..."
pip3 install pandas openpyxl --break-system-packages || pip3 install pandas openpyxl || echo "⚠️ Warning: Pandas installation failed. Some admin features might be limited."

# 4. Success Method
echo "======================================"
echo "✅ Installation Complete!"
echo "To run the server, type:"
echo "python3 server.py"
echo "======================================"
