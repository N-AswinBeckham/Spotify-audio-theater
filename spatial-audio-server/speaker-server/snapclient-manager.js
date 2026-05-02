/**
 * snapclient-manager.js — Manages multiple snapclient processes,
 * one per Bluetooth speaker, each outputting to its own PulseAudio sink.
 */
import { spawn } from 'child_process';

/** Map of sinkName -> { process, hostId, status } */
const clients = new Map();

/**
 * Start a snapclient instance that outputs to the given PulseAudio sink.
 * @param {string} sinkName  PulseAudio sink name (e.g. bluez_sink.XX_XX.a2dp_sink)
 * @param {string} hostId    Unique identifier for this client instance
 * @param {string} serverHost Snapserver host (default 'localhost')
 * @param {number} serverPort Snapserver port (default 1704)
 */
export function startClient(sinkName, hostId, serverHost = 'localhost', serverPort = 1704) {
  if (clients.has(sinkName)) {
    console.log(`[snapclient-mgr] Client for ${sinkName} already running`);
    return clients.get(sinkName);
  }

  console.log(`[snapclient-mgr] Starting snapclient → ${sinkName} (id: ${hostId})`);

  const args = [
    '-h', serverHost,
    '-p', String(serverPort),
    '-s', sinkName,
    '--hostID', hostId,
    '--player', 'pulse',
  ];

  const proc = spawn('snapclient', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  const entry = { process: proc, hostId, sinkName, status: 'starting' };

  proc.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[snapclient:${hostId}] ${msg}`);
    if (msg.includes('Connected') || msg.includes('playing')) {
      entry.status = 'streaming';
    }
  });

  proc.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[snapclient:${hostId}] ${msg}`);
  });

  proc.on('close', (code) => {
    console.log(`[snapclient-mgr] Client ${hostId} exited with code ${code}`);
    entry.status = 'stopped';
    clients.delete(sinkName);
  });

  proc.on('error', (err) => {
    console.error(`[snapclient-mgr] Failed to start client ${hostId}:`, err.message);
    entry.status = 'error';
    clients.delete(sinkName);
  });

  clients.set(sinkName, entry);
  return entry;
}

/**
 * Stop a snapclient by sink name.
 */
export function stopClient(sinkName) {
  const entry = clients.get(sinkName);
  if (!entry) return false;

  console.log(`[snapclient-mgr] Stopping client for ${sinkName}`);
  try {
    entry.process.kill('SIGTERM');
  } catch (e) { /* ignore */ }
  clients.delete(sinkName);
  return true;
}

/**
 * Stop all running snapclient instances.
 */
export function stopAll() {
  console.log(`[snapclient-mgr] Stopping all ${clients.size} clients`);
  for (const [sinkName] of clients) {
    stopClient(sinkName);
  }
}

/**
 * List all running snapclient instances.
 */
export function listClients() {
  const result = [];
  for (const [sinkName, entry] of clients) {
    result.push({
      sinkName,
      hostId: entry.hostId,
      status: entry.status,
    });
  }
  return result;
}

/**
 * Check if any clients are running.
 */
export function isRunning() {
  return clients.size > 0;
}
