# Spatial Theater — Bluetooth Multi-Speaker Home Theater

A DIY home theater system that turns your **Raspberry Pi** and **Bluetooth speakers** into a spatial audio experience. Plays music from **Spotify** → streams losslessly via **Snapcast** → routes to multiple BT speakers with per-channel volume for Left / Right / Bass separation.

```
Spotify App (Mac/Phone)
    │ Spotify Connect
    ▼
Librespot (RPi)  →  FIFO pipe  →  Snapserver (RPi)
                                      │
                          ┌───────────┼───────────┐
                          ▼           ▼           ▼
                    Snapclient    Snapclient   Snapclient
                    → BT Left    → BT Right   → BT Bass
```

---

## 🚀 Quick Start

### Prerequisites
- Raspberry Pi 4 (with Bluetooth)
- 1–3 Bluetooth speakers
- Spotify Premium account
- Node.js 18+ on the RPi

### 1. Clone & Transfer to RPi

```bash
git clone https://github.com/N-AswinBeckham/Spotify-audio-theater.git
# Transfer spatial-audio-server/ to your RPi
```

### 2. Install Everything on the RPi

```bash
cd spatial-audio-server

# Install librespot (Spotify Connect receiver)
chmod +x librespot/install.sh
./librespot/install.sh

# Install snapserver (lossless audio distributor)
chmod +x snapserver/install.sh
./snapserver/install.sh

# Install speaker-server (BT management + spatial engine)
chmod +x speaker-server/install.sh
./speaker-server/install.sh

# Install web app dependencies
cd snapweb && npm install && cd ..
```

### 3. Start the Services (4 terminals or use systemd)

```bash
# Terminal 1: Spotify receiver
./librespot/run_librespot.sh

# Terminal 2: Audio stream server
./snapserver/run_snapserver.sh

# Terminal 3: Speaker management API
cd speaker-server && npm start

# Terminal 4: Web UI (accessible from your Mac)
cd snapweb && npm run dev
```

### 4. Open the Web App on your Mac

1. Find your RPi's IP address: `hostname -I`
2. Open **`http://<rpi-ip>:5173`** in Chrome on your Mac
3. Click **📡 Scan for Speakers** — put your BT speakers in pairing mode
4. Pair each speaker and assign roles: **Left**, **Right**, **Bass**
5. Drag the speaker markers to match your physical room layout
6. Click **▶ Start Theater**
7. Open Spotify on your Mac → Select **"SpatialSource"** as playback device
8. Play a song — audio comes out of all your speakers! 🎉

---

## 🔊 Speaker Modes (Adaptive)

| Speakers | Mode | Behavior |
|----------|------|----------|
| 1 | **Mono** | Full stereo mix on single speaker |
| 2 | **Stereo** | Left/Right channel separation |
| 3 | **Surround** | L + R stereo + center Bass speaker |

The system automatically adapts based on how many speakers are connected.

---

## 🎧 How Spatial Audio Works

Each BT speaker becomes a PulseAudio sink on the RPi. The speaker-server runs one `snapclient` per speaker, each outputting to its own sink. Per-channel volume is set via `pactl`:

- **Left speaker**: Left channel 100%, Right channel 20%
- **Right speaker**: Left channel 20%, Right channel 100%
- **Bass speaker**: Both channels 90% (mono center mix)

This creates convincing stereo separation and a dedicated bass channel from a standard stereo Spotify stream.

---

## 📁 Project Structure

```
spatial-audio-server/
├── librespot/              # Spotify Connect receiver
│   ├── install.sh
│   └── run_librespot.sh
├── snapserver/             # Lossless audio distribution
│   ├── install.sh
│   ├── run_snapserver.sh
│   └── snapserver.conf
├── speaker-server/         # BT + spatial control API (Node.js)
│   ├── server.js           # Express REST API (port 3456)
│   ├── bt-manager.js       # bluetoothctl + pactl wrapper
│   ├── snapclient-manager.js  # Multi-snapclient process manager
│   ├── spatial-engine.js   # Per-speaker volume calculation
│   ├── install.sh
│   └── package.json
├── snapweb/                # React web app (Vite)
│   └── src/
│       ├── App.jsx         # Room layout + speaker management UI
│       └── index.css       # Premium dark theme
├── systemd/                # Optional systemd service files
└── fifo/                   # Named pipe for librespot → snapserver
```

---

## 🔧 Troubleshooting

### Speaker not showing up after pairing?
```bash
# Check PulseAudio sees the Bluetooth sink
pactl list sinks short | grep bluez
# If empty, restart PulseAudio
pulseaudio -k && pulseaudio --start
```

### No audio from speakers?
```bash
# Check snapclients are running
ps aux | grep snapclient
# Check snapserver is streaming
curl -s http://localhost:1780/jsonrpc -d '{"id":1,"jsonrpc":"2.0","method":"Server.GetStatus"}' | python3 -m json.tool
```

### Can't connect more than 1 BT speaker?
The RPi 4's built-in Bluetooth can struggle with multiple A2DP connections. Use a **USB Bluetooth 5.0 dongle** for reliable multi-speaker support.

---

## ⚠️ Ethical Disclaimer
This project is for personal, non-commercial use only. Respect Spotify's Terms of Service and only stream to devices you own.
