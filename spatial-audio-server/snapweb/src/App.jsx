import React, { useState, useRef, useEffect, useCallback } from 'react';

const ROOM_SIZE = 10; // 10 meters across (from -5 to 5)

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [serverIp, setServerIp] = useState(window.location.hostname || 'localhost');
  const [sourcePos, setSourcePos] = useState({ x: 0, z: -2 });
  const [isDragging, setIsDragging] = useState(false);

  const audioCtxRef = useRef(null);
  const pannerRef = useRef(null);
  const audioElRef = useRef(null);
  const roomRef = useRef(null);

  const initAudio = () => {
    if (audioCtxRef.current) return;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = `http://${serverIp}:1780/stream`;
    audioElRef.current = audio;
    
    const source = audioCtx.createMediaElementSource(audio);
    
    const panner = audioCtx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 1;
    panner.maxDistance = 50;
    panner.rolloffFactor = 1;
    
    pannerRef.current = panner;
    source.connect(panner).connect(audioCtx.destination);
    
    // Set listener to origin facing forward
    if (audioCtx.listener.positionX) {
      audioCtx.listener.positionX.value = 0;
      audioCtx.listener.positionY.value = 0;
      audioCtx.listener.positionZ.value = 0;
      audioCtx.listener.forwardX.value = 0;
      audioCtx.listener.forwardY.value = 0;
      audioCtx.listener.forwardZ.value = -1;
    } else {
      audioCtx.listener.setPosition(0, 0, 0);
      audioCtx.listener.setOrientation(0, 0, -1, 0, 1, 0);
    }

    updatePannerPos(sourcePos.x, sourcePos.z);
  };

  const updatePannerPos = (x, z) => {
    if (pannerRef.current) {
      const panner = pannerRef.current;
      const t = audioCtxRef.current.currentTime;
      if (panner.positionX) {
        panner.positionX.setValueAtTime(x, t);
        panner.positionY.setValueAtTime(0, t);
        panner.positionZ.setValueAtTime(z, t);
      } else {
        panner.setPosition(x, 0, z);
      }
    }
  };

  const togglePlay = async () => {
    if (!audioCtxRef.current) {
      initAudio();
    }
    
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
    
    if (isPlaying) {
      audioElRef.current.pause();
    } else {
      // Prevent caching and fetch fresh stream
      audioElRef.current.src = `http://${serverIp}:1780/stream?_t=${Date.now()}`;
      try {
        await audioElRef.current.play();
      } catch (err) {
        console.error("Playback failed:", err);
      }
    }
    setIsPlaying(!isPlaying);
  };

  const handlePointerDown = (e) => {
    if (e.target.className.includes('source')) {
      setIsDragging(true);
      e.target.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || !roomRef.current) return;
    
    const rect = roomRef.current.getBoundingClientRect();
    // Calculate normalized coordinates (-1 to 1)
    let nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    let nz = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    
    // Clamp to circle radius
    const distance = Math.sqrt(nx * nx + nz * nz);
    if (distance > 1) {
      nx /= distance;
      nz /= distance;
    }
    
    // Convert to meters
    const newX = nx * (ROOM_SIZE / 2);
    const newZ = nz * (ROOM_SIZE / 2);
    
    setSourcePos({ x: newX, z: newZ });
    updatePannerPos(newX, newZ);
  }, [isDragging]);

  const handlePointerUp = (e) => {
    if (isDragging) {
      setIsDragging(false);
      e.target.releasePointerCapture(e.pointerId);
    }
  };

  // Calculate CSS positions (percentages)
  const sourceLeft = `${((sourcePos.x / (ROOM_SIZE / 2)) + 1) * 50}%`;
  const sourceTop = `${((sourcePos.z / (ROOM_SIZE / 2)) + 1) * 50}%`;

  return (
    <div className="app-container">
      <div className="header">
        <h1>Spatial Stream</h1>
        <p>Lossless HRTF Audio Network</p>
      </div>

      <div className="controls">
        <button 
          className={`btn-play ${isPlaying ? 'active' : ''}`}
          onClick={togglePlay}
        >
          {isPlaying ? 'Disconnect' : 'Connect & Play'}
        </button>

        <div className="server-input">
          <label>Snapserver IP</label>
          <input 
            type="text" 
            value={serverIp} 
            onChange={(e) => setServerIp(e.target.value)}
            disabled={isPlaying}
          />
        </div>
        
        <div 
          className="room-container"
          ref={roomRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="listener"></div>
          <div 
            className={`source ${isPlaying ? 'playing' : ''}`}
            style={{ left: sourceLeft, top: sourceTop }}
          ></div>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Drag the green source around the room. You are the blue listener in the center. Use headphones!
        </p>
      </div>
    </div>
  );
}

export default App;
