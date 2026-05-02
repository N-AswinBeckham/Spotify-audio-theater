/**
 * server.js — Express API for managing Bluetooth speakers,
 * snapclient instances, and spatial volume control.
 *
 * Runs on the Raspberry Pi alongside snapserver.
 * The React web app (snapweb) calls these endpoints from the browser.
 */
import express from 'express';
import cors from 'cors';
import {
  scanDevices,
  listConnectedDevices,
  pairAndConnect,
  connectDevice,
  disconnectDevice,
  getConnectedSpeakers,
  setSinkVolume,
  listBluetoothSinks,
} from './bt-manager.js';
import {
  startClient,
  stopClient,
  stopAll,
  listClients,
  isRunning,
} from './snapclient-manager.js';
import { calculateVolumes, getMode } from './spatial-engine.js';

const app = express();
const PORT = 3456;

app.use(cors());
app.use(express.json());

// ─── Speaker state (persisted in memory) ───
let speakerLayout = [];  // [{ mac, sinkName, name, role, x, y }]
let listenerPos = { x: 3, y: 2.5 };
let roomSize = { width: 6, height: 5 };

// ─── BT Discovery ───

/** GET /api/speakers — list connected BT speakers with sink info */
app.get('/api/speakers', async (req, res) => {
  try {
    const speakers = await getConnectedSpeakers();
    // Merge with saved layout data (roles, positions)
    const merged = speakers.map(sp => {
      const saved = speakerLayout.find(s => s.mac === sp.mac);
      return {
        ...sp,
        role: saved?.role || 'auto',
        x: saved?.x ?? 3,
        y: saved?.y ?? 1,
      };
    });
    const clients = listClients();
    const mode = getMode(merged.length);
    res.json({ speakers: merged, mode, streaming: isRunning(), clients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/speakers/scan — scan for nearby BT devices (~10s) */
app.get('/api/speakers/scan', async (req, res) => {
  try {
    const duration = parseInt(req.query.duration) || 10;
    const devices = await scanDevices(duration);
    // Filter out already connected
    const connected = await listConnectedDevices();
    const connectedMacs = new Set(connected.map(d => d.mac));
    const available = devices.filter(d => !connectedMacs.has(d.mac));
    res.json({ devices: available, connected: connected.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/speakers/pair — pair and connect a new device */
app.post('/api/speakers/pair', async (req, res) => {
  try {
    const { mac } = req.body;
    if (!mac) return res.status(400).json({ error: 'mac address required' });
    const info = await pairAndConnect(mac);
    res.json({ success: true, device: info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/speakers/connect — connect already-paired device */
app.post('/api/speakers/connect', async (req, res) => {
  try {
    const { mac } = req.body;
    if (!mac) return res.status(400).json({ error: 'mac address required' });
    const info = await connectDevice(mac);
    res.json({ success: true, device: info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/speakers/disconnect — disconnect a device */
app.post('/api/speakers/disconnect', async (req, res) => {
  try {
    const { mac } = req.body;
    if (!mac) return res.status(400).json({ error: 'mac address required' });
    // Stop its snapclient first
    const sinks = await listBluetoothSinks();
    const sink = sinks.find(s => s.mac === mac.toUpperCase());
    if (sink) stopClient(sink.sinkName);
    await disconnectDevice(mac);
    // Remove from layout
    speakerLayout = speakerLayout.filter(s => s.mac !== mac);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Theater Control ───

/** POST /api/theater/start — start snapclients for all connected speakers */
app.post('/api/theater/start', async (req, res) => {
  try {
    const speakers = await getConnectedSpeakers();
    console.log(`[theater] Found ${speakers.length} speakers:`, speakers.map(s => `${s.name} (${s.mac}) sink=${s.sinkName}`));

    if (speakers.length === 0) {
      return res.status(400).json({ error: 'No Bluetooth speakers connected' });
    }

    // Check that speakers have PulseAudio sinks
    const speakersWithSinks = speakers.filter(sp => sp.sinkName);
    if (speakersWithSinks.length === 0) {
      return res.status(400).json({
        error: 'Bluetooth speakers connected but no PulseAudio sinks found. Try disconnecting and reconnecting the speakers.',
        speakers: speakers.map(s => ({ mac: s.mac, name: s.name, sinkName: s.sinkName })),
      });
    }

    // Start a snapclient for each speaker that has a sink
    const results = [];
    for (const sp of speakersWithSinks) {
      const hostId = `theater_${sp.mac.replace(/:/g, '')}`;
      console.log(`[theater] Starting client for ${sp.name} -> sink: ${sp.sinkName}`);
      const entry = startClient(sp.sinkName, hostId);
      results.push({ mac: sp.mac, name: sp.name, sinkName: sp.sinkName, status: entry.status });
    }

    // Wait a moment for clients to connect, then check status and apply volumes
    setTimeout(async () => {
      const activeClients = listClients();
      console.log(`[theater] After 3s: ${activeClients.length} clients still running:`, activeClients);
      if (activeClients.length > 0) {
        await applyVolumes();
      } else {
        console.error('[theater] WARNING: All snapclients exited within 3 seconds of starting!');
      }
    }, 3000);

    const mode = getMode(results.length);
    res.json({ success: true, mode, speakers: results });
  } catch (err) {
    console.error('[theater] Start failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/theater/stop — stop all snapclients */
app.post('/api/theater/stop', async (req, res) => {
  stopAll();
  res.json({ success: true });
});

/** GET /api/theater/status — current theater state */
app.get('/api/theater/status', async (req, res) => {
  const clients = listClients();
  const speakers = await getConnectedSpeakers();
  const mode = getMode(speakers.length);
  res.json({
    streaming: isRunning(),
    mode,
    speakerCount: speakers.length,
    clients,
    listenerPos,
    roomSize,
  });
});

// ─── Layout / Spatial ───

/** POST /api/layout — update speaker positions, roles, listener pos */
app.post('/api/layout', async (req, res) => {
  try {
    const { speakers, listener, room } = req.body;
    if (speakers) speakerLayout = speakers;
    if (listener) listenerPos = listener;
    if (room) roomSize = room;

    // Recalculate and apply volumes if streaming
    if (isRunning()) {
      await applyVolumes();
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Recalculate spatial volumes and apply to PulseAudio sinks.
 */
async function applyVolumes() {
  const speakers = await getConnectedSpeakers();
  const withLayout = speakers.map(sp => {
    const saved = speakerLayout.find(s => s.mac === sp.mac);
    return {
      sinkName: sp.sinkName,
      role: saved?.role || 'auto',
      x: saved?.x ?? 3,
      y: saved?.y ?? 1,
    };
  }).filter(sp => sp.sinkName);

  const volumes = calculateVolumes(withLayout, listenerPos, roomSize);

  for (const v of volumes) {
    await setSinkVolume(v.sinkName, v.leftVolume, v.rightVolume);
    console.log(`[spatial] ${v.sinkName}: L=${v.leftVolume}% R=${v.rightVolume}%`);
  }
}

// ─── Now Playing (Snapserver JSON-RPC) ───

/** GET /api/now-playing — get current stream status from snapserver */
app.get('/api/now-playing', async (req, res) => {
  try {
    // Snapserver exposes a JSON-RPC API on its HTTP port
    const snapHost = req.query.host || 'localhost';
    const snapPort = req.query.port || 1780;
    const rpcPayload = JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'Server.GetStatus',
    });

    const response = await fetch(`http://${snapHost}:${snapPort}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rpcPayload,
    });

    const data = await response.json();
    const groups = data?.result?.server?.groups || [];
    const streams = data?.result?.server?.streams || [];

    // Extract stream info
    const streamInfo = streams.map(s => ({
      id: s.id,
      status: s.status,
      uri: s.uri?.raw,
    }));

    // Extract connected client info
    const clientInfo = [];
    for (const g of groups) {
      for (const c of g.clients) {
        clientInfo.push({
          id: c.id,
          name: c.config?.name || c.host?.name || 'Unknown',
          connected: c.connected,
          volume: c.config?.volume?.percent,
        });
      }
    }

    res.json({ streams: streamInfo, clients: clientInfo });
  } catch (err) {
    res.json({ streams: [], clients: [], error: err.message });
  }
});

// ─── Start ───
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔊 Speaker Server running at http://0.0.0.0:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/speakers`);
  console.log(`   Theater: http://localhost:${PORT}/api/theater/status\n`);
});
