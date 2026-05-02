#!/bin/bash
set -e

echo "Installing snapserver..."

# Check if snapserver is already installed
if command -v snapserver >/dev/null 2>&1; then
    echo "snapserver is already installed at $(command -v snapserver)"
    exit 0
fi

# Attempt to install via apt
echo "Attempting to install via apt (this requires sudo privileges)..."
if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y snapserver
    if command -v snapserver >/dev/null 2>&1; then
        echo "-------------------------------------------------------"
        echo "snapserver installed successfully via apt."
        echo "-------------------------------------------------------"
        
        # Stop and disable the system service if it auto-started, 
        # since we want to run it via our local script.
        sudo systemctl stop snapserver || true
        sudo systemctl disable snapserver || true
        
        exit 0
    fi
else
    echo "apt-get not found. This script is intended for Debian/Ubuntu based systems (like Raspberry Pi OS)."
fi

echo "Failed to install snapserver automatically."
echo "Please install it manually:"
echo "1. Download the latest release from https://github.com/badaix/snapcast/releases"
echo "2. Install via: sudo dpkg -i snapserver_*.deb"
exit 1
