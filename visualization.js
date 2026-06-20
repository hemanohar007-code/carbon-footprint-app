/**
 * visualization.js
 * Canvas-based Carbon Planet Visualization Engine
 *
 * Renders a dynamic 2D canvas "Carbon Planet" whose appearance degrades
 * in direct proportion to the user's annual CO₂ footprint tier.
 *
 * Tiers:
 *   Green  (<1,500 kg/yr): Lush green, healthy blue atmosphere, steady rotation
 *   Yellow (1,500–3,000): Pale green-beige, minor surface cracking, slower rotation
 *   Orange (3,000–6,000): Grayish-brown, visible fissures, ambient smog
 *   Red    (>6,000 kg/yr): Charred body, chaotic rotation, volcanic smoke particles
 *
 * API:
 *   init(canvasElement)  – sets up the canvas and starts the animation loop
 *   update(tier, totalKg) – updates planet state without reinitializing
 *   destroy()            – cleans up all resources, cancels animation frame
 */

'use strict';

const TIER_CONFIG = {
  green: {
    surfaceColor: '#2d7a3a',
    atmosphereColor: 'rgba(56, 189, 248, 0.35)',
    crackOpacity: 0,
    smokeEnabled: false,
    rotationSpeed: 0.003,
    surfaceVariance: 0.06,
    landColors: ['#2d7a3a', '#38a169', '#276749'],
    oceanColor: '#1a6fa8',
    glowColor: 'rgba(56, 189, 248, 0.4)'
  },
  yellow: {
    surfaceColor: '#8a9a5b',
    atmosphereColor: 'rgba(234, 210, 100, 0.30)',
    crackOpacity: 0.3,
    smokeEnabled: false,
    rotationSpeed: 0.0018,
    surfaceVariance: 0.12,
    landColors: ['#8a9a5b', '#a0a860', '#7a8a4b'],
    oceanColor: '#5a8a7a',
    glowColor: 'rgba(200, 200, 80, 0.35)'
  },
  orange: {
    surfaceColor: '#7a6040',
    atmosphereColor: 'rgba(200, 140, 60, 0.38)',
    crackOpacity: 0.65,
    smokeEnabled: true,
    smokeColor: 'rgba(120, 110, 90, 0.15)',
    rotationSpeed: 0.001,
    surfaceVariance: 0.20,
    landColors: ['#7a6040', '#8a7050', '#6a5030'],
    oceanColor: '#4a5a5a',
    glowColor: 'rgba(200, 120, 40, 0.4)'
  },
  red: {
    surfaceColor: '#2a1a10',
    atmosphereColor: 'rgba(200, 60, 30, 0.45)',
    crackOpacity: 1.0,
    smokeEnabled: true,
    smokeColor: 'rgba(80, 60, 40, 0.25)',
    rotationSpeed: 0.007,
    chaotic: true,
    surfaceVariance: 0.35,
    landColors: ['#2a1a10', '#3a2010', '#1a0a00'],
    oceanColor: '#1a0808',
    glowColor: 'rgba(220, 50, 20, 0.55)'
  }
};

const MAX_PARTICLES = 60;
const MAX_CRACKS = 12;

let _canvas = null;
let _ctx = null;
let _rafId = null;
let _tier = 'green';
let _totalKg = 0;
let _particles = [];
let _cracks = [];
let _rotation = 0;
let _width = 0;
let _height = 0;
let _radius = 0;
let _resizeTimeout = null;
let _reducedMotion = false;
let _initialized = false;

// ─── SEEDED PSEUDO-RANDOM (deterministic for cracks/terrain) ─────────────────
/**
 * Creates a deterministic pseudo-random number generator based on a seed.
 * @param {number} seed - The initial seed value.
 * @returns {function(): number} A function returning a float between 0 and 1.
 */
function seededRand(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ─── PARTICLE SYSTEM ──────────────────────────────────────────────────────────
/**
 * Creates a single smoke particle object.
 * @param {number} cx - Center X coordinate.
 * @param {number} cy - Center Y coordinate.
 * @param {number} r - Planet radius.
 * @param {object} config - Tier configuration object.
 * @returns {object} Particle object with coordinates and physics properties.
 */
function createParticle(cx, cy, r, config) {
  const angle = Math.random() * Math.PI * 2;
  const dist = r * (0.8 + Math.random() * 0.4);
  return {
    x: cx + Math.cos(angle) * dist,
    y: cy + Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 0.4,
    vy: -Math.random() * 0.8 - 0.2,
    life: 1.0,
    decay: 0.004 + Math.random() * 0.008,
    size: 2 + Math.random() * 6,
    color: config.smokeColor || 'rgba(80,60,40,0.2)'
  };
}

/**
 * Generates an array of crack objects radiating from the planet surface.
 * @param {number} seed - Random seed for deterministic cracks.
 * @param {number} count - Number of cracks to generate.
 * @param {number} radius - Planet radius.
 * @param {number} cx - Center X coordinate.
 * @param {number} cy - Center Y coordinate.
 * @returns {object[]} Array of crack objects.
 */
function generateCracks(seed, count, radius, cx, cy) {
  const rand = seededRand(seed);
  const cracks = [];
  for (let i = 0; i < count; i++) {
    const startAngle = rand() * Math.PI * 2;
    const startDist = radius * (0.2 + rand() * 0.6);
    const startX = cx + Math.cos(startAngle) * startDist;
    const startY = cy + Math.sin(startAngle) * startDist;
    const segments = [];
    let x = startX;
    let y = startY;
    const segCount = 3 + Math.floor(rand() * 5);
    for (let s = 0; s < segCount; s++) {
      const dx = (rand() - 0.5) * radius * 0.3;
      const dy = (rand() - 0.5) * radius * 0.3;
      segments.push({ x: x + dx, y: y + dy });
      x += dx;
      y += dy;
    }
    cracks.push({ segments, startX, startY });
  }
  return cracks;
}

// ─── DRAW PLANET SURFACE ──────────────────────────────────────────────────────
/**
 * Renders the main planet body, atmosphere, and surface features.
 * @param {object} config - Tier configuration object.
 * @param {number} cx - Center X coordinate.
 * @param {number} cy - Center Y coordinate.
 * @param {number} r - Planet radius.
 */
function drawPlanet(config, cx, cy, r) {
  const ctx = _ctx;
  ctx.save();

  // Atmosphere glow
  const atmoGrad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.25);
  atmoGrad.addColorStop(0, config.atmosphereColor);
  atmoGrad.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2);
  ctx.fillStyle = atmoGrad;
  ctx.fill();

  // Planet body gradient
  const bodyGrad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
  bodyGrad.addColorStop(0, lightenColor(config.surfaceColor, 40));
  bodyGrad.addColorStop(0.6, config.surfaceColor);
  bodyGrad.addColorStop(1, darkenColor(config.surfaceColor, 40));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Land patches (terrain)
  const rand = seededRand(42);
  const patchCount = 6;
  for (let i = 0; i < patchCount; i++) {
    const patchAngle = (i / patchCount) * Math.PI * 2 + _rotation;
    const patchX = cx + Math.cos(patchAngle) * r * 0.45;
    const patchY = cy + Math.sin(patchAngle) * r * 0.38;
    const patchR = r * (0.15 + rand() * 0.18);
    const landColor = config.landColors[i % config.landColors.length];
    const landGrad = ctx.createRadialGradient(patchX, patchY, 0, patchX, patchY, patchR);
    landGrad.addColorStop(0, landColor);
    landGrad.addColorStop(1, config.surfaceColor);
    ctx.beginPath();
    ctx.arc(patchX, patchY, patchR, 0, Math.PI * 2);
    ctx.fillStyle = landGrad;
    ctx.fill();
  }

  // Ocean (small patches in non-red tiers)
  if (_tier !== 'red') {
    const oceanRand = seededRand(99);
    for (let i = 0; i < 3; i++) {
      const oAngle = ((i + 0.5) / 3) * Math.PI * 2 + _rotation + 0.5;
      const oX = cx + Math.cos(oAngle) * r * 0.3;
      const oY = cy + Math.sin(oAngle) * r * 0.25;
      const oR = r * (0.08 + oceanRand() * 0.12);
      ctx.beginPath();
      ctx.arc(oX, oY, oR, 0, Math.PI * 2);
      ctx.fillStyle = config.oceanColor;
      ctx.fill();
    }
  }

  // Surface cracks
  if (config.crackOpacity > 0 && _cracks.length > 0) {
    ctx.save();
    ctx.globalAlpha = config.crackOpacity;
    ctx.strokeStyle = darkenColor(config.surfaceColor, 60);
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    for (const crack of _cracks) {
      ctx.beginPath();
      ctx.moveTo(crack.startX, crack.startY);
      for (const seg of crack.segments) {
        ctx.lineTo(seg.x, seg.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Terminator (shadow edge for 3D feel)
  const shadowGrad = ctx.createRadialGradient(cx + r * 0.3, cy + r * 0.1, 0, cx, cy, r);
  shadowGrad.addColorStop(0.6, 'transparent');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = shadowGrad;
  ctx.fill();

  // Highlight (specular)
  const highlightGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx - r * 0.3, cy - r * 0.3, r * 0.5);
  highlightGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
  highlightGrad.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = highlightGrad;
  ctx.fill();

  // Clip to planet for particles
  ctx.restore();
}

// ─── DRAW SMOKE PARTICLES ─────────────────────────────────────────────────────
/**
 * Renders all active smoke particles to the canvas.
 */
function drawParticles() {
  const ctx = _ctx;
  for (const p of _particles) {
    ctx.save();
    ctx.globalAlpha = p.life * 0.7;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.restore();
  }
}

// ─── UPDATE PARTICLES ────────────────────────────────────────────────────────
/**
 * Updates physics for existing particles and spawns new ones if needed.
 * @param {object} config - Tier configuration object.
 * @param {number} cx - Center X coordinate.
 * @param {number} cy - Center Y coordinate.
 * @param {number} r - Planet radius.
 */
function updateParticles(config, cx, cy, r) {
  if (!config.smokeEnabled || _reducedMotion) {
    _particles = [];
    return;
  }
  // Spawn
  if (_particles.length < MAX_PARTICLES) {
    _particles.push(createParticle(cx, cy, r, config));
  }
  // Update
  _particles = _particles.filter(p => p.life > 0);
  for (const p of _particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    p.size *= 1.004;
    if (_tier === 'red') {
      p.vx += (Math.random() - 0.5) * 0.05;
    }
  }
}

// ─── MAIN DRAW LOOP ───────────────────────────────────────────────────────────
/**
 * The core animation loop. Clears the canvas and renders the next frame.
 */
function draw() {
  if (!_canvas || !_ctx) return;

  const ctx = _ctx;
  const config = TIER_CONFIG[_tier] || TIER_CONFIG.green;
  const cx = _width / 2;
  const cy = _height / 2;
  const r = _radius;

  // Clear
  ctx.clearRect(0, 0, _width, _height);

  // Update rotation
  if (!_reducedMotion) {
    let speed = config.rotationSpeed;
    if (config.chaotic) {
      speed += Math.sin(Date.now() / 500) * 0.003;
    }
    _rotation += speed;
  }

  updateParticles(config, cx, cy, r);
  drawPlanet(config, cx, cy, r);
  drawParticles();

  _rafId = requestAnimationFrame(draw);
}

// ─── RESIZE HANDLER ───────────────────────────────────────────────────────────
/**
 * Handles window resize events, debounced to prevent performance drops.
 */
function onResize() {
  if (_resizeTimeout) clearTimeout(_resizeTimeout);
  _resizeTimeout = setTimeout(() => {
    if (!_canvas) return;
    _width = _canvas.clientWidth;
    _height = _canvas.clientHeight;
    _canvas.width = _width;
    _canvas.height = _height;
    _radius = Math.min(_width, _height) * 0.38;
    const cx = _width / 2;
    const cy = _height / 2;
    _cracks = generateCracks(Date.now() % 9999, MAX_CRACKS, _radius, cx, cy);
  }, 150);
}

// ─── COLOR UTILITIES ──────────────────────────────────────────────────────────
/**
 * Lightens a hex color by a specified amount.
 * @param {string} hex - Hex color code.
 * @param {number} amount - Amount to lighten (0-255).
 * @returns {string} The resulting rgb() color.
 */
function lightenColor(hex, amount) {
  return adjustColor(hex, amount);
}
/**
 * Darkens a hex color by a specified amount.
 * @param {string} hex - Hex color code.
 * @param {number} amount - Amount to darken (0-255).
 * @returns {string} The resulting rgb() color.
 */
function darkenColor(hex, amount) {
  return adjustColor(hex, -amount);
}
/**
 * Adjusts a hex color's brightness.
 * @param {string} hex - Hex color code.
 * @param {number} amount - Positive to lighten, negative to darken.
 * @returns {string} The resulting rgb() color.
 */
function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Initializes the canvas visualization engine.
 * @param {HTMLCanvasElement} canvasElement
 */
export function init(canvasElement) {
  if (_initialized) destroy();

  _canvas = canvasElement;
  _ctx = canvasElement.getContext('2d');
  _reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  _width = canvasElement.clientWidth || 400;
  _height = canvasElement.clientHeight || 400;
  _canvas.width = _width;
  _canvas.height = _height;
  _radius = Math.min(_width, _height) * 0.38;

  const cx = _width / 2;
  const cy = _height / 2;
  _cracks = generateCracks(1337, MAX_CRACKS, _radius, cx, cy);

  window.addEventListener('resize', onResize);

  _initialized = true;
  draw();
}

/**
 * Updates the planet visualization to reflect a new tier.
 * @param {string} tier - 'green'|'yellow'|'orange'|'red'
 * @param {number} totalKg - annual footprint in kg
 */
export function update(tier, totalKg) {
  _tier = tier || 'green';
  _totalKg = totalKg || 0;
  _particles = [];

  // Regenerate cracks with tier-specific density
  const crackCount = {
    green: 0,
    yellow: 4,
    orange: 8,
    red: MAX_CRACKS
  }[_tier] || 0;

  if (_canvas) {
    const cx = _canvas.width / 2;
    const cy = _canvas.height / 2;
    _cracks = generateCracks(Math.floor(totalKg), crackCount, _radius, cx, cy);
  }
}

/**
 * Cleans up all canvas resources and cancels animation frame.
 */
export function destroy() {
  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  window.removeEventListener('resize', onResize);
  if (_resizeTimeout) {
    clearTimeout(_resizeTimeout);
    _resizeTimeout = null;
  }
  _canvas = null;
  _ctx = null;
  _particles = [];
  _cracks = [];
  _initialized = false;
}

/**
 * Returns whether the visualization engine is currently running.
 * @returns {boolean}
 */
export function isRunning() {
  return _initialized && _rafId !== null;
}
