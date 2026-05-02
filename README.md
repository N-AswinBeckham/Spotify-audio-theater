# Spatial Theater — Wi-Fi Distributed Multiroom Audio

A DIY home theater system that streams your **Spotify** music losslessly via **Snapcast** over your local **Wi-Fi network**. Use old phones, laptops, or other Raspberry Pis as client receivers plugged into your speakers. This bypasses any Bluetooth hardware bottlenecks!

```
Spotify App (Mac/Phone)
    │ Spotify Connect
    ▼
Librespot (RPi)  →  FIFO pipe  →  Snapserver (RPi)
                                      │ (Wi-Fi)
                          ┌───────────┼───────────┐
                          ▼           ▼           ▼
                   Phone (Snapapp)  Laptop      Phone (Snapapp)
                   → Left Speaker   → Subwoofer → Right Speaker
```

---

## 🚀 Quick Start

### Prerequisites
- Raspberry Pi (Any model)
- 1–3 "Client" devices (Old Android phones, iPhones, laptops, other Pis)
- Speakers connected to the client devices (via AUX or a single BT connection per client)
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

### 4. Open the Web App & Connect Clients

1. Find your RPi's IP address: `hostname -I`
2. Open **`http://<rpi-ip>:5173`** in Chrome on your Mac/PC to view the "Spatial Theater" control panel.
3. On your client devices (phones/laptops), download the **Snapcast app** (or use a Snapclient). Point them to the RPi's IP address.
4. As clients connect, they will magically appear in the Web App!
5. Assign roles: **Left**, **Right**, **Bass** and adjust their positions in the virtual room. (Note: For Left/Right stereo separation, ensure you set the channel to Left/Right natively within the Snapcast app on your phone).
6. Open Spotify → Select **"SpatialSource"** as playback device.
7. Play a song — audio perfectly syncs across all your devices! 🎉

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

Each client connects to the Snapserver over Wi-Fi. The `speaker-server` listens to Snapserver via JSON-RPC to discover connected clients and applies **distance attenuation** (volume control) based on where you place the speakers in the virtual room UI.

For hard channel separation:
- **Left speaker**: Set the Android Snapcast app to "Left Channel".
- **Right speaker**: Set the Android Snapcast app to "Right Channel".
- **Bass speaker**: Set to Mono mix (Both channels).

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
├── speaker-server/         # Wi-Fi client control API (Node.js)
│   ├── server.js           # Express REST API (port 3456)
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

### Clients not showing up?
Ensure all client devices (phones, laptops) are connected to the **same Wi-Fi network** as the Raspberry Pi. If they still don't show up, manually enter the Raspberry Pi's IP address into the Snapcast app settings on your phone.

### Audio out of sync?
Snapcast is usually perfectly synced out of the box. If there is a delay (often caused by the Bluetooth connection between a client phone and its speaker), use the "Latency" offset feature within the Snapcast app on that specific phone to dial it in perfectly.

---

## ⚠️ Ethical Disclaimer
This project is for personal, non-commercial use only. Respect Spotify's Terms of Service and only stream to devices you own.
