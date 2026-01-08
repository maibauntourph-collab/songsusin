#!/bin/bash

echo "📱 Mobile Server Installer for Termux"
echo "======================================"

# 1. Update Packages
echo "[1/4] Updating Package Lists..."
pkg update -y && pkg upgrade -y

# 2. Install Dependencies
echo "[2/4] Installing Python & Tools..."
pkg install -y python rust git clang make build-essential libffi openssl

# 3. Setup Python Environment
echo "[3/4] Installing Python Libraries..."
# Upgrade pip and build tools
pip install --upgrade pip setuptools wheel

# Install requirements
# Pin pydantic to v1 to avoid Pydantic V2 rust build issues if possible, or for compatibility
pip install "pydantic<2"
pip install fastapi uvicorn "python-socketio" aiortc deep-translator "python-multipart" 

# Note: pandas/openpyxl often hard to compile on phone without specific pre-built wheels. 
# We'll try to install them, but if they fail, the core server might still run if we handle imports gracefully.
echo "Attempting to install heavier libraries (Pandas)..."
pip install pandas openpyxl || echo "⚠️ Warning: Pandas installation failed. Some admin features might strictly require it."

# 4. Success Method
echo "======================================"
echo "✅ Installation Complete!"
echo "To run the server, type:"
echo "python server.py"
echo "======================================"
