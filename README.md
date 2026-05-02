# Ethical Multi-Device Spatial Audio Streaming

A high-fidelity, lossless spatial audio streaming system for your local network. This project uses `librespot` to pull bit-perfect audio from Spotify, `snapserver` to distribute it as lossless FLAC, and a custom React web client to apply real-time HRTF (Head-Related Transfer Function) spatialization.

## 🚀 Quick Start

### 1. Server Setup (Raspberry Pi 4)

Transfer the `spatial-audio-server` directory to your Pi.

```bash
# 1. Download librespot binary for aarch64
./librespot/install.sh

# 2. Install snapserver
./snapserver/install.sh

# 3. Configure librespot (LOGIN REQUIRED HERE)
# Open librespot/run_librespot.sh and add your credentials if not using discovery
# Example: ./librespot -n "SpatialSource" -u <user> -p <pass> ...
```

### 2. Run the Services

You can run them manually or use the systemd files provided in `systemd/`.

```bash
# Start the audio source
./librespot/run_librespot.sh

# Start the stream server
./snapserver/run_snapserver.sh
```

### 3. Web Client (The Spatial Experience)

The web client is built with Vite and React.

```bash
cd snapweb
npm install
npm run build
# Serve the 'dist' folder using a web server (e.g., python3 -m http.server 8080)
```

1. Open the web app in your browser (use Chrome/Firefox for best HRTF support).
2. Enter the **IP address** of your Raspberry Pi.
3. Click **"Connect & Play"**.
4. **Drag the green source dot** around the room to experience 3D spatial audio through your headphones.

---

## 🔑 Do I need to login?

**Yes and No.**

*   **Spotify (Server Side):** `librespot` requires a **Spotify Premium** account to pull the audio stream. You will need to provide your credentials to `librespot` on the server. If you run it with default settings, it should appear in your Spotify app's "Connect" menu as "SpatialSource". Once you select it, it will prompt for login or use your current session if discovery is working.
*   **Web Client (User Side):** **No login is required.** The web client simply connects to the Snapserver's raw audio stream. Anyone on your local network can open the web app and start listening to the spatialized stream without authentication.

## 🎧 Best Experience

*   **Use Headphones:** HRTF spatialization is designed specifically for binaural listening.
*   **Lossless Chain:** The audio stays as lossless FLAC throughout your network, ensuring the highest subjective quality.
*   **Head Tracking:** If accessing via a mobile browser, the spatialization stays relative to the "virtual room" you've set up.

## ⚠️ Ethical Disclaimer
This project is for personal, non-commercial use only. Respect Spotify's Terms of Service and only stream to devices you own.
