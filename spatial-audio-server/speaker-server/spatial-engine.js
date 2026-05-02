/**
 * spatial-engine.js — Calculates per-speaker volume based on role and position.
 *
 * Speaker roles:
 *   'left'  → primarily left channel
 *   'right' → primarily right channel
 *   'bass'  → both channels equally (center/subwoofer)
 *
 * Adaptive modes:
 *   1 speaker  → mono, full volume both channels
 *   2 speakers → stereo L/R, no dedicated bass
 *   3 speakers → L + R + center Bass
 */

/**
 * Calculate per-channel volumes for each speaker.
 *
 * @param {Array} speakers  [{ sinkName, role, x, y }]
 * @param {{ x: number, y: number }} listenerPos  Listener position in meters
 * @param {{ width: number, height: number }} roomSize
 * @returns {Array} [{ sinkName, leftVolume, rightVolume }]  Volumes 0-100
 */
export function calculateVolumes(speakers, listenerPos, roomSize) {
  const count = speakers.length;
  if (count === 0) return [];

  // --- Mode 1: Single speaker — mono ---
  if (count === 1) {
    return [{
      sinkName: speakers[0].sinkName,
      leftVolume: 100,
      rightVolume: 100,
    }];
  }

  // --- Mode 2: Two speakers — stereo, no bass ---
  if (count === 2) {
    return speakers.map(sp => {
      const volumes = getChannelVolumes(sp, listenerPos, roomSize, false);
      return { sinkName: sp.sinkName, ...volumes };
    });
  }

  // --- Mode 3: Three speakers — L + R + Bass ---
  return speakers.map(sp => {
    const volumes = getChannelVolumes(sp, listenerPos, roomSize, true);
    return { sinkName: sp.sinkName, ...volumes };
  });
}

/**
 * Get left/right channel volumes for a single speaker based on its role and position.
 */
function getChannelVolumes(speaker, listenerPos, roomSize, hasBass) {
  const { role, x, y } = speaker;
  const dx = x - listenerPos.x;
  const maxDx = roomSize.width / 2;

  // Normalized pan: -1 (far left) to +1 (far right)
  const pan = Math.max(-1, Math.min(1, dx / Math.max(maxDx, 0.1)));

  // Distance from listener (for gentle attenuation)
  const dy = y - listenerPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const distGain = Math.max(0.4, 1 / Math.max(1, dist * 0.3));

  let leftVol, rightVol;

  switch (role) {
    case 'left':
      leftVol = 100;
      rightVol = 20;
      break;
    case 'right':
      leftVol = 20;
      rightVol = 100;
      break;
    case 'bass':
      // Both channels equal for a mono sub effect, slightly boosted
      leftVol = 90;
      rightVol = 90;
      break;
    default:
      // Auto: derive from position
      leftVol = Math.round(20 + 80 * (1 - pan) / 2);
      rightVol = Math.round(20 + 80 * (1 + pan) / 2);
  }

  // Apply distance attenuation
  leftVol = Math.round(leftVol * distGain);
  rightVol = Math.round(rightVol * distGain);

  return { leftVolume: clamp(leftVol, 0, 100), rightVolume: clamp(rightVol, 0, 100) };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Determine the effective mode label based on speaker count.
 */
export function getMode(speakerCount) {
  if (speakerCount >= 3) return '3-Speaker Surround';
  if (speakerCount === 2) return 'Stereo';
  if (speakerCount === 1) return 'Mono';
  return 'No Speakers';
}
