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
  const [speakers, setSpeakers] = useState([]); // Wi-Fi Clients
  const [listenerPos, setListenerPos] = useState({ x: 3, y: 2.5 });
  const [roomSize] = useState(ROOM_DEFAULT);
  const [streaming, setStreaming] = useState(true);
  const [mode, setMode] = useState('No Speakers');
  const [snapInfo, setSnapInfo] = useState({ streams: [], clients: [] });
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(null); // { type: 'speaker'|'listener', index }
  const roomRef = useRef(null);

  // ─── Fetch clients on mount and poll ───
  const fetchSpeakers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/speakers`);
      const data = await res.json();
      setSpeakers(data.speakers || []);
      setMode(data.mode || 'No Speakers');
      setError(null);
    } catch {
      setError('Cannot reach Speaker Server. Is it running?');
    }
  }, []);

  const fetchNowPlaying = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/now-playing`);
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
    }, 3000);
    return () => clearInterval(id);
  }, [fetchSpeakers, fetchNowPlaying]);

  // ─── Actions ───

  const assignRole = (id, role) => {
    setSpeakers(prev => prev.map(s => s.id === id ? { ...s, role } : s));
  };

  const saveLayout = async () => {
    try {
      await fetch(`${API_BASE}/api/layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speakers: speakers.map(s => ({ id: s.id, name: s.name, role: s.role, x: s.x, y: s.y })),
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
            <h1>Wi-Fi Spatial Theater</h1>
            <p className="subtitle">Snapcast Multiroom System</p>
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
                  key={sp.id}
                  className={`room-marker speaker-marker streaming`}
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
                <p>No Wi-Fi clients connected</p>
                <p className="room-empty-sub">Open the Snapcast app on your devices on this network</p>
              </div>
            )}
          </div>
          <p className="room-hint">Drag speakers and listener to match your physical room layout. Distance affects volume.</p>
        </section>

        {/* ─── Speaker Panel ─── */}
        <section className="speaker-section">
          <div className="section-title">
            <h2>Wi-Fi Speakers</h2>
            <span className="speaker-count">{speakers.length} Connected</span>
          </div>

          <div className="speaker-list">
            {speakers.length === 0 && (
              <div className="no-speakers-card">
                <div className="no-speakers-icon">📡</div>
                <p>Waiting for clients...</p>
                <p style={{fontSize: '0.85em', color: '#94a3b8', marginTop: '4px'}}>
                  Connect phones or laptops to this Wi-Fi network and open the Snapcast app.
                </p>
              </div>
            )}
            {speakers.map((sp) => {
              const cfg = ROLE_CONFIG[sp.role] || ROLE_CONFIG.auto;
              return (
                <div key={sp.id} className="speaker-card" style={{ '--card-accent': cfg.color }}>
                  <div className="speaker-card-header">
                    <div className="speaker-icon" style={{ background: cfg.color }}>{cfg.label}</div>
                    <div className="speaker-info">
                      <h3>{sp.name}</h3>
                      <span className="speaker-mac">ID: {sp.id.substring(0, 12)}...</span>
                    </div>
                    <div className="client-volume">{sp.volume}%</div>
                  </div>
                  <div className="speaker-card-body">
                    <label className="role-label">Role</label>
                    <div className="role-buttons">
                      {Object.entries(ROLE_CONFIG).map(([key, val]) => (
                        <button
                          key={key}
                          className={`role-btn ${sp.role === key ? 'active' : ''}`}
                          style={{ '--role-color': val.color }}
                          onClick={() => assignRole(sp.id, key)}
                        >
                          {val.fullLabel}
                        </button>
                      ))}
                    </div>
                    <div className="speaker-status" style={{marginTop: '12px'}}>
                      <span className={`status-dot ok`} />
                      Connected to server
                      {['left', 'right'].includes(sp.role) && (
                        <span style={{display: 'block', fontSize: '0.8em', color: '#f59e0b', marginTop: '4px'}}>
                          * Set the {sp.role} channel natively in your device's Snapcast app settings.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── Now Playing ─── */}
          <div className="now-playing-section">
            <h2>Now Playing</h2>
            <div className="now-playing-card">
              <div className="np-visual">
                {streamStatus === 'playing' ? (
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
                  {speakers.length} active client{speakers.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="np-stream-status">
                <span className={`stream-indicator ${streamStatus}`} />
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer className="app-footer">
        <p>Wi-Fi Spatial Theater · Spotify → Librespot → Snapserver → Wi-Fi Clients</p>
      </footer>
    </div>
  );
}

export default App;
