#!/bin/bash
set -e

echo "=== Speaker Server Setup ==="

# Check for Node.js
if ! command -v node &>/dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "Node.js version: $(node -v)"

# Check for snapclient
if ! command -v snapclient &>/dev/null; then
    echo "Installing snapclient via apt..."
    sudo apt-get update
    sudo apt-get install -y snapclient
    
    # Disable the default snapclient service (we manage our own instances)
    sudo systemctl stop snapclient 2>/dev/null || true
    sudo systemctl disable snapclient 2>/dev/null || true
fi

echo "snapclient version: $(snapclient --version 2>&1 | head -1)"

# Check for PulseAudio
if ! command -v pactl &>/dev/null; then
    echo "Installing PulseAudio..."
    sudo apt-get install -y pulseaudio pulseaudio-module-bluetooth
fi

# Make sure Bluetooth is up
if command -v bluetoothctl &>/dev/null; then
    echo "Bluetooth available: $(bluetoothctl show | grep 'Powered' || echo 'unknown')"
else
    echo "WARNING: bluetoothctl not found. Install bluez: sudo apt-get install bluez"
fi

# Install Node dependencies
cd "$(dirname "$0")"
echo "Installing npm dependencies..."
npm install

echo ""
echo "✅ Speaker server ready!"
echo "   Start with: node server.js"
echo "   Or:         npm start"
echo ""
