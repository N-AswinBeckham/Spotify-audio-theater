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



# Install Node dependencies
cd "$(dirname "$0")"
echo "Installing npm dependencies..."
npm install

echo ""
echo "✅ Speaker server ready!"
echo "   Start with: node server.js"
echo "   Or:         npm start"
echo ""
