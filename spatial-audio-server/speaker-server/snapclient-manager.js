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
    '--hostID', hostId,
    '--player', 'pulse',
  ];

  console.log(`[snapclient-mgr] Command: PULSE_SINK="${sinkName}" snapclient ${args.join(' ')}`);

  const proc = spawn('snapclient', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PULSE_SINK: sinkName },
    detached: false,
  });

  const entry = { process: proc, hostId, sinkName, status: 'starting', pid: null };

  proc.on('spawn', () => {
    entry.pid = proc.pid;
    console.log(`[snapclient-mgr] Client ${hostId} spawned with PID ${proc.pid}`);
    // After 2 seconds, try to move the sink-input to the correct sink as a fallback
    setTimeout(() => moveSinkInput(proc.pid, sinkName), 2000);
  });

  proc.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[snapclient:${hostId}:stdout] ${msg}`);
    if (msg.includes('Connected') || msg.includes('playing')) {
      entry.status = 'streaming';
    }
  });

  proc.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[snapclient:${hostId}:stderr] ${msg}`);
    // Snapclient often logs status changes to stderr
    if (msg.includes('Connected') || msg.includes('playing')) {
      entry.status = 'streaming';
    }
  });

  proc.on('close', (code) => {
    console.log(`[snapclient-mgr] Client ${hostId} exited with code ${code}`);
    entry.status = 'stopped';
    // Only remove from map if it hasn't been replaced by a restart
    if (clients.get(sinkName) === entry) {
      clients.delete(sinkName);
    }
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
 * Move a snapclient's PulseAudio sink-input to the correct sink.
 * This is a fallback in case PULSE_SINK env var isn't honored.
 */
async function moveSinkInput(pid, sinkName) {
  try {
    const { execSync } = await import('child_process');
    // Find sink-inputs belonging to this PID
    const output = execSync('pactl list sink-inputs', { timeout: 5000 }).toString();
    const inputs = output.split('Sink Input #');
    for (const block of inputs) {
      if (block.includes(`application.process.id = "${pid}"`)) {
        const indexMatch = block.match(/^(\d+)/);
        if (indexMatch) {
          const inputIndex = indexMatch[1];
          console.log(`[snapclient-mgr] Moving sink-input #${inputIndex} → ${sinkName}`);
          execSync(`pactl move-sink-input ${inputIndex} "${sinkName}"`, { timeout: 5000 });
        }
      }
    }
  } catch (err) {
    // Non-fatal — PULSE_SINK may have worked
    console.log(`[snapclient-mgr] move-sink-input fallback: ${err.message}`);
  }
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
