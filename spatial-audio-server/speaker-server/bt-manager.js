/**
 * bt-manager.js — Bluetooth device discovery, pairing, and PulseAudio sink management.
 * Wraps bluetoothctl and pactl CLI commands for use on Raspberry Pi.
 */
import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Run a shell command and return stdout. Swallows stderr unless it throws.
 */
async function run(cmd, timeoutMs = 15000) {
  try {
    const { stdout } = await execAsync(cmd, { timeout: timeoutMs });
    return stdout.trim();
  } catch (err) {
    console.error(`[bt-manager] cmd failed: ${cmd}`, err.message);
    return '';
  }
}

/**
 * Scan for nearby Bluetooth devices for ~10 seconds.
 * Returns an array of { mac, name }.
 */
export async function scanDevices(durationSec = 10) {
  console.log(`[bt-manager] Scanning for ${durationSec}s...`);
  // Start a scan in the background, then collect devices
  await run(`timeout ${durationSec} bluetoothctl scan on`, (durationSec + 2) * 1000);
  const output = await run('bluetoothctl devices');
  if (!output) return [];

  const devices = [];
  for (const line of output.split('\n')) {
    // Format: "Device AA:BB:CC:DD:EE:FF Device Name"
    const match = line.match(/^Device\s+([\dA-Fa-f:]{17})\s+(.+)$/);
    if (match) {
      devices.push({ mac: match[1], name: match[2] });
    }
  }
  return devices;
}

/**
 * List currently connected Bluetooth devices.
 */
export async function listConnectedDevices() {
  const output = await run('bluetoothctl devices Connected');
  if (!output) return [];

  const devices = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^Device\s+([\dA-Fa-f:]{17})\s+(.+)$/);
    if (match) {
      const info = await getDeviceInfo(match[1]);
      if (info && info.isAudioSink) {
        devices.push({ mac: match[1], name: match[2], ...info });
      }
    }
  }
  return devices;
}

/**
 * Get detailed info about a Bluetooth device.
 */
export async function getDeviceInfo(mac) {
  const output = await run(`bluetoothctl info ${mac}`);
  if (!output) return null;

  const paired = /Paired:\s*yes/i.test(output);
  const connected = /Connected:\s*yes/i.test(output);
  const trusted = /Trusted:\s*yes/i.test(output);
  const isAudioSink = /UUID:.*Audio Sink/i.test(output) ||
                      /Icon:\s*audio/i.test(output) ||
                      /Class:.*0x..24/i.test(output);
  const nameMatch = output.match(/Alias:\s*(.+)/);
  const name = nameMatch ? nameMatch[1].trim() : mac;

  return { paired, connected, trusted, isAudioSink, name };
}

/**
 * Pair, trust, and connect a Bluetooth device.
 */
export async function pairAndConnect(mac) {
  console.log(`[bt-manager] Pairing ${mac}...`);
  await run(`bluetoothctl pair ${mac}`, 30000);
  await run(`bluetoothctl trust ${mac}`);
  await run(`bluetoothctl connect ${mac}`, 15000);
  // Wait for PulseAudio to register the sink
  await new Promise(r => setTimeout(r, 3000));
  const info = await getDeviceInfo(mac);
  return info;
}

/**
 * Connect an already-paired device.
 */
export async function connectDevice(mac) {
  await run(`bluetoothctl connect ${mac}`, 15000);
  await new Promise(r => setTimeout(r, 2000));
  return await getDeviceInfo(mac);
}

/**
 * Disconnect a device.
 */
export async function disconnectDevice(mac) {
  await run(`bluetoothctl disconnect ${mac}`);
}

/**
 * List PulseAudio sinks that are Bluetooth devices.
 * Returns [{ index, sinkName, mac, state }]
 */
export async function listBluetoothSinks() {
  const output = await run('pactl list sinks short');
  if (!output) return [];

  const sinks = [];
  for (const line of output.split('\n')) {
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const sinkName = parts[1];
      // Match either bluez_sink.XX_XX... or bluez_output.XX_XX...
      const macMatch = sinkName.match(/bluez_(?:sink|output)\.([\dA-Fa-f_]{17})/i);
      
      if (macMatch) {
        const mac = macMatch[1].replace(/_/g, ':');
        sinks.push({
          index: parseInt(parts[0]),
          sinkName: sinkName,
          mac: mac.toUpperCase(),
          state: parts[4] || 'UNKNOWN',
        });
      }
    }
  }
  return sinks;
}

/**
 * Set per-channel volume on a PulseAudio sink.
 * leftPct and rightPct are 0-100.
 */
export async function setSinkVolume(sinkName, leftPct, rightPct) {
  const l = Math.round(Math.max(0, Math.min(150, leftPct)));
  const r = Math.round(Math.max(0, Math.min(150, rightPct)));
  await run(`pactl set-sink-volume "${sinkName}" ${l}% ${r}%`);
}

/**
 * Get a combined list of connected BT speakers with their PulseAudio sink info.
 */
export async function getConnectedSpeakers() {
  const [btDevices, paSinks] = await Promise.all([
    listConnectedDevices(),
    listBluetoothSinks(),
  ]);

  return btDevices.map(dev => {
    const sink = paSinks.find(s => s.mac === dev.mac.toUpperCase());
    return {
      mac: dev.mac,
      name: dev.name,
      connected: dev.connected,
      sinkName: sink ? sink.sinkName : null,
      sinkState: sink ? sink.state : 'UNAVAILABLE',
    };
  });
}
