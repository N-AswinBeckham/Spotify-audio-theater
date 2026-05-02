/**
 * server.js — Express API for managing Wi-Fi Snapclients and spatial volume control.
 *
 * Runs on the Raspberry Pi alongside snapserver.
 * The React web app (snapweb) calls these endpoints from the browser.
 */
import express from 'express';
import cors from 'cors';
import { calculateVolumes, getMode } from './spatial-engine.js';

const app = express();
const PORT = 3456;

app.use(cors());
app.use(express.json());

// ─── Speaker state (persisted in memory) ───
let speakerLayout = [];  // [{ id, name, role, x, y }]
let listenerPos = { x: 3, y: 2.5 };
let roomSize = { width: 6, height: 5 };

// ─── Snapserver JSON-RPC Helper ───
async function snapserverRpc(method, params = {}) {
  try {
    const response = await fetch('http://localhost:1780/jsonrpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
    });
    const data = await response.json();
    return data.result;
  } catch (err) {
    console.error(`[snapserver] RPC Error (${method}):`, err.message);
    throw err;
  }
}

// ─── Wi-Fi Discovery ───

/** GET /api/speakers — list connected Wi-Fi clients */
app.get('/api/speakers', async (req, res) => {
  try {
    const result = await snapserverRpc('Server.GetStatus');
    const groups = result?.server?.groups || [];
    
    // Extract clients
    const clients = [];
    for (const g of groups) {
      for (const c of g.clients) {
        if (c.connected) {
          clients.push({
            id: c.id,
            name: c.config?.name || c.host?.name || 'Unknown',
            volume: c.config?.volume?.percent || 0,
            muted: c.config?.volume?.muted || false,
          });
        }
      }
    }

    // Merge with saved layout data
    const merged = clients.map(sp => {
      const saved = speakerLayout.find(s => s.id === sp.id);
      return {
        ...sp,
        role: saved?.role || 'auto',
        x: saved?.x ?? 3,
        y: saved?.y ?? 1,
      };
    });

    const mode = getMode(merged.length);
    res.json({ speakers: merged, mode, streaming: true, clients: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Theater Control (Volume Sync) ───

/** POST /api/layout — update speaker positions, roles, listener pos */
app.post('/api/layout', async (req, res) => {
  try {
    const { speakers, listener, room } = req.body;
    if (speakers) speakerLayout = speakers;
    if (listener) listenerPos = listener;
    if (room) roomSize = room;

    await applyVolumes();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Recalculate spatial volumes and apply to Snapserver clients via RPC.
 */
async function applyVolumes() {
  const result = await snapserverRpc('Server.GetStatus');
  if (!result) return;
  
  const connectedIds = new Set();
  for (const g of result.server.groups) {
    for (const c of g.clients) {
      if (c.connected) connectedIds.add(c.id);
    }
  }

  const withLayout = speakerLayout
    .filter(s => connectedIds.has(s.id))
    .map(s => ({
      sinkName: s.id, // Reusing sinkName property for Client ID in spatial-engine
      role: s.role,
      x: s.x,
      y: s.y,
    }));

  const volumes = calculateVolumes(withLayout, listenerPos, roomSize);

  for (const v of volumes) {
    // Snapserver RPC only sets master volume. We use the max of left/right 
    // for distance attenuation. Channel separation must be set in the client app.
    const masterVol = Math.max(v.leftVolume, v.rightVolume);
    try {
      await snapserverRpc('Client.SetVolume', {
        id: v.sinkName,
        volume: { percent: masterVol, muted: false }
      });
      console.log(`[spatial] Client ${v.sinkName} volume set to ${masterVol}%`);
    } catch (e) {
      console.error(`[spatial] Failed to set volume for ${v.sinkName}`);
    }
  }
}

// ─── Now Playing (Snapserver JSON-RPC) ───

/** GET /api/now-playing — get current stream status from snapserver */
app.get('/api/now-playing', async (req, res) => {
  try {
    const result = await snapserverRpc('Server.GetStatus');
    const groups = result?.server?.groups || [];
    const streams = result?.server?.streams || [];

    const streamInfo = streams.map(s => ({
      id: s.id,
      status: s.status,
      uri: s.uri?.raw,
    }));

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
  console.log(`\n🔊 Speaker Server (Wi-Fi Mode) running at http://0.0.0.0:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/speakers\n`);
});
