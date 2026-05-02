#!/bin/bash
set -e

echo "Installing librespot for aarch64 Linux (Raspberry Pi 4/5 64-bit)..."

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" != "aarch64" ]; then
    echo "Error: This script is intended for aarch64 (64-bit ARM). Detected $ARCH."
    echo "If you are on 32-bit Pi OS, please update this script to use armhf."
    exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
    echo "Error: curl is required but not installed. Please run: sudo apt install curl"
    exit 1
fi

# We use dtcooper/raspotify as a reliable source for pre-compiled librespot binaries
# as the official librespot repo does not provide them.
echo "Fetching latest release info from Raspotify..."
RELEASE_JSON=$(curl -s https://api.github.com/repos/dtcooper/raspotify/releases/latest)
DEB_URL=$(echo "$RELEASE_JSON" | grep -o 'https://github.com/dtcooper/raspotify/releases/download/[^"]*arm64.deb' | head -n 1)

if [ -z "$DEB_URL" ]; then
    echo "Failed to find ARM64 deb package automatically."
    echo "Trying fallback URL..."
    LATEST_VERSION=$(echo "$RELEASE_JSON" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    DEB_URL="https://github.com/dtcooper/raspotify/releases/download/${LATEST_VERSION}/raspotify_${LATEST_VERSION}.librespot.v0.8.0-ea81314_arm64.deb"
fi

echo "Downloading $DEB_URL ..."
wget -qO librespot_package.deb "$DEB_URL" || {
    echo "Download failed."
    echo "Please visit https://github.com/dtcooper/raspotify/releases/latest"
    echo "and download the 'arm64.deb' file manually, then extract it."
    exit 1
}

echo "Extracting binary..."
# Extract data.tar.xz from the deb package
# dpkg-deb is usually present on Raspberry Pi OS (Debian)
if command -v dpkg-deb >/dev/null 2>&1; then
    dpkg-deb -x librespot_package.deb ./tmp_extract
else
    # Fallback to ar and tar if dpkg-deb is missing
    mkdir -p tmp_extract
    ar x librespot_package.deb --output=tmp_extract >/dev/null 2>&1 || true
    cd tmp_extract && tar xf data.tar.* 2>/dev/null || true && cd ..
fi

if [ -f "./tmp_extract/usr/bin/librespot" ]; then
    mv ./tmp_extract/usr/bin/librespot ./librespot
    chmod +x librespot
else
    echo "Error: Failed to find librespot binary in the package."
    echo "You might need to build it from source: https://github.com/librespot-org/librespot"
    exit 1
fi

# Cleanup
rm -rf librespot_package.deb tmp_extract

echo "-------------------------------------------------------"
echo "Librespot installed successfully at $(pwd)/librespot"
echo "-------------------------------------------------------"
