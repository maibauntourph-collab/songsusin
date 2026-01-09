#!/bin/bash

# Mobile Guide System - One-Time Install Script for Termux
# Usage: bash <(curl -sL https://raw.githubusercontent.com/maibauntourph-collab/songsusin/main/setup_termux.sh)

echo -e "\033[1;32m"
echo "=========================================="
echo "   Mobile Guide System Installer 🚀"
echo "=========================================="
echo -e "\033[0m"

# 1. Request Storage Permissions
echo "[*] Requesting storage access..."
termux-setup-storage
sleep 2

# 2. Update System & Install Dependencies
echo "[*] Updating system packages (this may take a while)..."
pkg update -y && pkg upgrade -y

echo "[*] Installing required packages..."
# Essential build tools and libraries for aiortc/numpy
pkg install -y python git rust binutils build-essential \
    libopus openssl libjpeg-turbo zlib \
    ffmpeg make cmake clang pkg-config

# 3. Clone/Update Repository
REPO_DIR="$HOME/songsusin"
REPO_URL="https://github.com/maibauntourph-collab/songsusin.git"

if [ -d "$REPO_DIR" ]; then
    echo "[*] Updating existing repository..."
    cd "$REPO_DIR"
    git pull
else
    echo "[*] Cloning repository..."
    git clone "$REPO_URL" "$REPO_DIR"
    cd "$REPO_DIR"
fi

# 4. Install Python Dependencies
echo "[*] Upgrading pip..."
pip install --upgrade pip

echo "[*] Installing Python libraries (Grab a coffee ☕)..."
# Install heavy dependencies first to handle build flags if needed
export CFLAGS="-Wno-deprecated-declarations -Wno-unreachable-code"
pip install wheel setuptools
pip install numpy
pip install fastapi "uvicorn[standard]" python-socketio aiortc Jinja2 openai deep-translator pandas openpyxl python-multipart netifaces

# 5. Create Desktop Shortcut (Optional but recommended)
echo "[*] Creating startup shortcut..."
mkdir -p $HOME/.shortcuts
echo "cd $REPO_DIR && python server.py" > $HOME/.shortcuts/guide-start
chmod +x $HOME/.shortcuts/guide-start

# 6. Final Instructions
echo -e "\033[1;32m"
echo "=========================================="
echo "   ✅ Installation Complete!"
echo "=========================================="
echo -e "\033[0m"
echo "To start the server, type:"
echo "  cd songsusin && python server.py"
echo ""
echo "Or use the widget if you configured Termux:Widget."
echo "=========================================="
