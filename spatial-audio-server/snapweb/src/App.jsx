import React, { useState, useRef, useEffect, useCallback } from 'react';

const ROOM_DEFAULT = { width: 6, height: 5 };
const API_BASE = `http://${window.location.hostname}:3456`;

const ROLE_CONFIG = {
  left:  { label: 'L', color: '#10b981', fullLabel: 'Left' },
  right: { label: 'R', color: '#38bdf8', fullLabel: 'Right' },
  bass:  { label: 'B', color: '#f59e0b', fullLabel: 'Bass' },
  auto:  { label: 'A', color: '#8b5cf6', fullLabel: 'Auto' },
};

function App() {
  // ─── State ───
  const [speakers, setSpeakers] = useState([]);
  const [listenerPos, setListenerPos] = useState({ x: 3, y: 2.5 });
  const [roomSize] = useState(ROOM_DEFAULT);
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState('No Speakers');
  const [scanning, setScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [showScanModal, setShowScanModal] = useState(false);
  const [pairing, setPairing] = useState(null);
  const [dragging, setDragging] = useState(null); // { type: 'speaker'|'listener', index }
  const [serverIp] = useState(window.location.hostname || 'localhost');
  const [snapInfo, setSnapInfo] = useState({ streams: [], clients: [] });
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const roomRef = useRef(null);

  // ─── Fetch speakers on mount and poll ───
  const fetchSpeakers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/speakers`);
      const data = await res.json();
      setSpeakers(data.speakers || []);
      setMode(data.mode || 'No Speakers');
      setStreaming(data.streaming || false);
      setError(null);
    } catch {
      setError('Cannot reach Speaker Server. Is it running on the RPi?');
    }
  }, []);

  const fetchNowPlaying = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/now-playing?host=localhost`);
      const data = await res.json();
      setSnapInfo(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchSpeakers();
    fetchNowPlaying();
    const id = setInterval(() => {
      fetchSpeakers();
      fetchNowPlaying();
    }, 5000);
    return () => clearInterval(id);
  }, [fetchSpeakers, fetchNowPlaying]);

  // ─── API Actions ───
  const scanForDevices = async () => {
    setScanning(true);
    setShowScanModal(true);
    setDiscoveredDevices([]);
    try {
      const res = await fetch(`${API_BASE}/api/speakers/scan?duration=10`);
      const data = await res.json();
      setDiscoveredDevices(data.devices || []);
    } catch (e) {
      setError('Scan failed: ' + e.message);
    }
    setScanning(false);
  };

  const pairDevice = async (mac) => {
    setPairing(mac);
    try {
      await fetch(`${API_BASE}/api/speakers/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac }),
      });
      await fetchSpeakers();
      setDiscoveredDevices(prev => prev.filter(d => d.mac !== mac));
    } catch (e) {
      setError('Pairing failed: ' + e.message);
    }
    setPairing(null);
  };

  const disconnectSpeaker = async (mac) => {
    try {
      await fetch(`${API_BASE}/api/speakers/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac }),
      });
      await fetchSpeakers();
    } catch (e) {
      setError('Disconnect failed: ' + e.message);
    }
  };

  const startTheater = async () => {
    setStarting(true);
    try {
      // Save layout first
      await saveLayout();
      const res = await fetch(`${API_BASE}/api/theater/start`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStreaming(true);
        setMode(data.mode);
      } else {
        setError(data.error || 'Failed to start');
      }
    } catch (e) {
      setError('Start failed: ' + e.message);
    }
    setStarting(false);
  };

  const stopTheater = async () => {
    try {
      await fetch(`${API_BASE}/api/theater/stop`, { method: 'POST' });
      setStreaming(false);
    } catch (e) {
      setError('Stop failed: ' + e.message);
    }
  };

  const assignRole = (mac, role) => {
    setSpeakers(prev => prev.map(s => s.mac === mac ? { ...s, role } : s));
  };

  const saveLayout = async () => {
    try {
      await fetch(`${API_BASE}/api/layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speakers: speakers.map(s => ({ mac: s.mac, sinkName: s.sinkName, name: s.name, role: s.role, x: s.x, y: s.y })),
          listener: listenerPos,
          room: roomSize,
        }),
      });
    } catch { /* silent */ }
  };

  // Debounced save
  useEffect(() => {
    if (speakers.length === 0) return;
    const t = setTimeout(saveLayout, 500);
    return () => clearTimeout(t);
  }, [speakers, listenerPos]);

  // ─── Drag logic ───
  const getPointerRoomCoords = (e) => {
    if (!roomRef.current) return null;
    const rect = roomRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0.3, Math.min(roomSize.width - 0.3, px * roomSize.width)),
      y: Math.max(0.3, Math.min(roomSize.height - 0.3, py * roomSize.height)),
    };
  };

  const handlePointerDown = (type, index, e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging({ type, index });
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return;
    const coords = getPointerRoomCoords(e);
    if (!coords) return;
    if (dragging.type === 'listener') {
      setListenerPos(coords);
    } else if (dragging.type === 'speaker') {
      setSpeakers(prev => prev.map((s, i) => i === dragging.index ? { ...s, x: coords.x, y: coords.y } : s));
    }
  }, [dragging, roomSize]);

  const handlePointerUp = () => setDragging(null);

  // ─── Helpers ───
  const toPercent = (val, max) => `${(val / max) * 100}%`;
  const streamStatus = snapInfo.streams?.[0]?.status || 'unknown';

  // ─── Render ───
  return (
    <div className="app-shell">
      {/* ─── Header ─── */}
      <header className="app-header">
        <div className="logo-group">
          <div className="logo-icon">🔊</div>
          <div>
            <h1>Spatial Theater</h1>
            <p className="subtitle">Bluetooth Home Theater System</p>
          </div>
        </div>
        <div className="header-badges">
          <span className={`badge mode-badge ${streaming ? 'streaming' : ''}`}>
            {mode}
          </span>
          <span className={`badge stream-badge ${streamStatus}`}>
            {streamStatus === 'playing' ? '● Playing' : streamStatus === 'idle' ? '○ Idle' : '○ Offline'}
          </span>
        </div>
      </header>

      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          ⚠ {error} <span className="dismiss">✕</span>
        </div>
      )}

      <div className="main-layout">
        {/* ─── Room View ─── */}
        <section className="room-section">
          <div className="section-title">
            <h2>Room Layout</h2>
            <span className="room-dims">{roomSize.width}m × {roomSize.height}m</span>
          </div>
          <div
            className="room-view"
            ref={roomRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ aspectRatio: `${roomSize.width} / ${roomSize.height}` }}
          >
            {/* Grid */}
            <div className="room-grid">
              {Array.from({ length: roomSize.width - 1 }, (_, i) => (
                <div key={`v${i}`} className="grid-v" style={{ left: toPercent(i + 1, roomSize.width) }} />
              ))}
              {Array.from({ length: roomSize.height - 1 }, (_, i) => (
                <div key={`h${i}`} className="grid-h" style={{ top: toPercent(i + 1, roomSize.height) }} />
              ))}
            </div>

            {/* Label: FRONT / REAR */}
            <span className="room-label top-label">▲ FRONT (Screen / TV)</span>
            <span className="room-label bottom-label">▼ REAR</span>

            {/* Speakers */}
            {speakers.map((sp, i) => {
              const cfg = ROLE_CONFIG[sp.role] || ROLE_CONFIG.auto;
              return (
                <div
                  key={sp.mac}
                  className={`room-marker speaker-marker ${streaming ? 'streaming' : ''}`}
                  style={{
                    left: toPercent(sp.x, roomSize.width),
                    top: toPercent(sp.y, roomSize.height),
                    '--marker-color': cfg.color,
                  }}
                  onPointerDown={(e) => handlePointerDown('speaker', i, e)}
                >
                  <span className="marker-ring" />
                  <span className="marker-dot">{cfg.label}</span>
                  <span className="marker-label">{sp.name}</span>
                </div>
              );
            })}

            {/* Listener */}
            <div
              className="room-marker listener-marker"
              style={{
                left: toPercent(listenerPos.x, roomSize.width),
                top: toPercent(listenerPos.y, roomSize.height),
              }}
              onPointerDown={(e) => handlePointerDown('listener', null, e)}
            >
              <span className="marker-dot listener-dot">🎧</span>
              <span className="marker-label">You</span>
            </div>

            {speakers.length === 0 && (
              <div className="room-empty">
                <p>No speakers connected</p>
                <p className="room-empty-sub">Scan and pair Bluetooth speakers to get started</p>
              </div>
            )}
          </div>
          <p className="room-hint">Drag speakers and listener to match your physical room layout</p>
        </section>

        {/* ─── Speaker Panel ─── */}
        <section className="speaker-section">
          <div className="section-title">
            <h2>Speakers</h2>
            <span className="speaker-count">{speakers.length}/3</span>
          </div>

          <div className="speaker-list">
            {speakers.length === 0 && (
              <div className="no-speakers-card">
                <div className="no-speakers-icon">📡</div>
                <p>No speakers paired yet</p>
              </div>
            )}
            {speakers.map((sp) => {
              const cfg = ROLE_CONFIG[sp.role] || ROLE_CONFIG.auto;
              return (
                <div key={sp.mac} className="speaker-card" style={{ '--card-accent': cfg.color }}>
                  <div className="speaker-card-header">
                    <div className="speaker-icon" style={{ background: cfg.color }}>{cfg.label}</div>
                    <div className="speaker-info">
                      <h3>{sp.name}</h3>
                      <span className="speaker-mac">{sp.mac}</span>
                    </div>
                    <button className="btn-icon btn-disconnect" onClick={() => disconnectSpeaker(sp.mac)} title="Disconnect">✕</button>
                  </div>
                  <div className="speaker-card-body">
                    <label className="role-label">Role</label>
                    <div className="role-buttons">
                      {Object.entries(ROLE_CONFIG).map(([key, val]) => (
                        <button
                          key={key}
                          className={`role-btn ${sp.role === key ? 'active' : ''}`}
                          style={{ '--role-color': val.color }}
                          onClick={() => assignRole(sp.mac, key)}
                        >
                          {val.fullLabel}
                        </button>
                      ))}
                    </div>
                    <div className="speaker-status">
                      <span className={`status-dot ${sp.sinkName ? 'ok' : 'err'}`} />
                      {sp.sinkName ? 'Audio sink ready' : 'No audio sink'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="action-buttons">
            <button className="btn btn-scan" onClick={scanForDevices} disabled={scanning}>
              {scanning ? '🔄 Scanning...' : '📡 Scan for Speakers'}
            </button>
            {speakers.length > 0 && (
              streaming ? (
                <button className="btn btn-stop" onClick={stopTheater}>⏹ Stop Theater</button>
              ) : (
                <button className="btn btn-start" onClick={startTheater} disabled={starting}>
                  {starting ? '⏳ Starting...' : '▶ Start Theater'}
                </button>
              )
            )}
          </div>

          {/* ─── Now Playing ─── */}
          <div className="now-playing-section">
            <h2>Now Playing</h2>
            <div className="now-playing-card">
              <div className="np-visual">
                {streaming && streamStatus === 'playing' ? (
                  <div className="eq-bars">
                    <span /><span /><span /><span /><span />
                  </div>
                ) : (
                  <div className="np-idle-icon">♪</div>
                )}
              </div>
              <div className="np-info">
                <p className="np-title">
                  {streamStatus === 'playing' ? 'Streaming from Spotify' : 'Not streaming'}
                </p>
                <p className="np-sub">
                  {streaming
                    ? `${speakers.length} speaker${speakers.length !== 1 ? 's' : ''} active · ${mode}`
                    : 'Start the theater to begin playback'}
                </p>
              </div>
              <div className="np-stream-status">
                <span className={`stream-indicator ${streamStatus}`} />
              </div>
            </div>

            {/* Snapcast clients */}
            {snapInfo.clients?.length > 0 && (
              <div className="snap-clients">
                <h3>Connected Clients</h3>
                {snapInfo.clients.map((c, i) => (
                  <div key={i} className="snap-client-row">
                    <span className={`status-dot ${c.connected ? 'ok' : 'err'}`} />
                    <span className="snap-client-name">{c.name}</span>
                    <span className="snap-client-vol">{c.volume ?? '—'}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ─── Scan Modal ─── */}
      {showScanModal && (
        <div className="modal-overlay" onClick={() => !scanning && setShowScanModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Discover Speakers</h2>
              <button className="btn-icon" onClick={() => setShowScanModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {scanning && (
                <div className="scan-animation">
                  <div className="scan-ring" />
                  <div className="scan-ring delay-1" />
                  <div className="scan-ring delay-2" />
                  <p>Scanning for Bluetooth devices...</p>
                </div>
              )}
              {!scanning && discoveredDevices.length === 0 && (
                <div className="scan-empty">
                  <p>No new devices found</p>
                  <p className="scan-hint">Make sure your speakers are in pairing mode, then try again.</p>
                  <button className="btn btn-scan" onClick={scanForDevices}>🔄 Scan Again</button>
                </div>
              )}
              {discoveredDevices.length > 0 && (
                <div className="device-list">
                  {discoveredDevices.map(d => (
                    <div key={d.mac} className="device-row">
                      <div className="device-info">
                        <span className="device-name">{d.name}</span>
                        <span className="device-mac">{d.mac}</span>
                      </div>
                      <button
                        className="btn btn-pair"
                        onClick={() => pairDevice(d.mac)}
                        disabled={pairing === d.mac}
                      >
                        {pairing === d.mac ? '⏳ Pairing...' : '🔗 Pair'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>Spatial Theater · Spotify → Librespot → Snapcast → Bluetooth</p>
      </footer>
    </div>
  );
}

export default App;
