/**
 * share.js
 * HTML5 Canvas Social Share Card Engine
 *
 * Draws a branded share card directly in the browser canvas.
 * No third-party image microservices required.
 *
 * Exports:
 *   generateShareCard(data, canvasElement) – draws the card on the provided canvas
 *   downloadCard(canvasElement, filename)  – triggers PNG download
 *   shareCard(canvasElement, data)         – triggers native Web Share API (with PNG fallback)
 */

'use strict';

// ─── COLOUR PALETTE BY TIER ───────────────────────────────────────────────────
const TIER_PALETTE = {
  green: {
    bg1: '#0d3d1f',
    bg2: '#1a5c30',
    accent: '#4ade80',
    text: '#e6ffec',
    badge_bg: '#16532d'
  },
  yellow: {
    bg1: '#3d3210',
    bg2: '#5c4a1a',
    accent: '#facc15',
    text: '#fffde6',
    badge_bg: '#4a3c10'
  },
  orange: {
    bg1: '#3d1f05',
    bg2: '#5c3010',
    accent: '#fb923c',
    text: '#fff3ec',
    badge_bg: '#4a2808'
  },
  red: {
    bg1: '#1a0505',
    bg2: '#380a0a',
    accent: '#f87171',
    text: '#fff0f0',
    badge_bg: '#2a0808'
  }
};

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 566;

// ─── DRAWING HELPERS ──────────────────────────────────────────────────────────

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawGradientBackground(ctx, palette) {
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, palette.bg1);
  gradient.addColorStop(1, palette.bg2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

function drawNoise(ctx) {
  // Subtle noise texture for premium feel
  ctx.save();
  ctx.globalAlpha = 0.03;
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * CARD_WIDTH;
    const y = Math.random() * CARD_HEIGHT;
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

function drawAccentLine(ctx, palette) {
  const grad = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.3, palette.accent);
  grad.addColorStop(0.7, palette.accent);
  grad.addColorStop(1, 'transparent');
  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, CARD_HEIGHT * 0.12);
  ctx.lineTo(CARD_WIDTH, CARD_HEIGHT * 0.12);
  ctx.stroke();
  ctx.restore();
}

function drawLogo(ctx, palette) {
  ctx.save();
  // Earth icon
  ctx.fillStyle = palette.accent;
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('🌍', 48, 66);

  ctx.fillStyle = palette.text;
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('CarbonMirror', 92, 56);

  ctx.fillStyle = palette.accent;
  ctx.globalAlpha = 0.7;
  ctx.font = '13px sans-serif';
  ctx.fillText('India\'s Carbon Awareness Platform', 93, 74);
  ctx.restore();
}

function drawMainScore(ctx, palette, totalKg, tier) {
  const cx = CARD_WIDTH / 2;

  // Score background blob
  ctx.save();
  const blobGrad = ctx.createRadialGradient(cx, CARD_HEIGHT / 2, 0, cx, CARD_HEIGHT / 2, 140);
  blobGrad.addColorStop(0, palette.accent + '22');
  blobGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = blobGrad;
  ctx.beginPath();
  ctx.arc(cx, CARD_HEIGHT / 2, 140, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Score number
  ctx.save();
  ctx.fillStyle = palette.accent;
  ctx.font = 'bold 80px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(Math.round(totalKg).toLocaleString('en-IN'), cx, CARD_HEIGHT / 2 - 10);

  ctx.fillStyle = palette.text;
  ctx.font = '22px sans-serif';
  ctx.globalAlpha = 0.8;
  ctx.fillText('kg CO₂ / year', cx, CARD_HEIGHT / 2 + 28);

  ctx.globalAlpha = 1;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = palette.accent;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  ctx.fillText(`${tierLabel} Zone`, cx, CARD_HEIGHT / 2 + 60);
  ctx.restore();
}

function drawEquivalencies(ctx, palette, equivalencies) {
  const startX = 80;
  const startY = CARD_HEIGHT * 0.68;
  const items = [
    { icon: '🚗', label: 'Delhi–Mumbai\nDrives', value: equivalencies.delhi_mumbai_drives },
    { icon: '🌳', label: 'Trees Needed\nto Offset', value: equivalencies.trees_needed },
    { icon: '🏠', label: 'Home Energy\nMonths', value: equivalencies.household_electricity_months }
  ];

  ctx.save();
  items.forEach((item, i) => {
    const x = startX + i * 320;

    // Card background
    ctx.fillStyle = palette.badge_bg;
    ctx.globalAlpha = 0.7;
    roundRect(ctx, x, startY, 280, 100, 12);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.font = '28px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(item.icon, x + 16, startY + 38);

    ctx.fillStyle = palette.accent;
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(String(item.value), x + 56, startY + 38);

    ctx.fillStyle = palette.text;
    ctx.globalAlpha = 0.7;
    ctx.font = '13px sans-serif';
    const lines = item.label.split('\n');
    lines.forEach((line, li) => {
      ctx.fillText(line, x + 56, startY + 58 + li * 18);
    });
    ctx.globalAlpha = 1;
  });
  ctx.restore();
}

function drawBadges(ctx, palette, badges) {
  if (!badges || badges.length === 0) return;

  ctx.save();
  const startX = 80;
  const y = CARD_HEIGHT * 0.25;

  ctx.fillStyle = palette.text;
  ctx.globalAlpha = 0.6;
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('EARNED BADGES', startX, y - 10);
  ctx.globalAlpha = 1;

  badges.slice(0, 4).forEach((badge, i) => {
    const bx = startX + i * 130;

    ctx.fillStyle = palette.badge_bg;
    ctx.globalAlpha = 0.8;
    roundRect(ctx, bx, y, 118, 50, 8);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.font = '20px sans-serif';
    ctx.fillText(badge.icon || '🏅', bx + 10, y + 32);
    ctx.fillStyle = palette.text;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(badge.name.slice(0, 14), bx + 36, y + 24);
    ctx.globalAlpha = 0.7;
    ctx.font = '10px sans-serif';
    ctx.globalAlpha = 1;
  });
  ctx.restore();
}

function drawPledge(ctx, palette, topAction) {
  if (!topAction) return;
  ctx.save();

  const y = CARD_HEIGHT * 0.43;
  const x = 80;

  ctx.fillStyle = palette.accent;
  ctx.globalAlpha = 0.15;
  roundRect(ctx, x, y, CARD_WIDTH * 0.42, 44, 8);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = palette.accent;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MY TOP PLEDGE', x + 12, y + 16);

  ctx.fillStyle = palette.text;
  ctx.font = '13px sans-serif';
  const pledgeText = topAction.action.length > 55
    ? topAction.action.slice(0, 52) + '…'
    : topAction.action;
  ctx.fillText(pledgeText, x + 12, y + 33);

  ctx.restore();
}

function drawWatermark(ctx, palette) {
  ctx.save();
  ctx.fillStyle = palette.text;
  ctx.globalAlpha = 0.3;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('carbonmirror.app • Data: CEA, MoEFCC, IEA', CARD_WIDTH - 40, CARD_HEIGHT - 20);
  ctx.restore();
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Draws the share card onto the provided canvas element.
 * @param {object} data
 * @param {number} data.totalKg - annual CO₂ footprint in kg
 * @param {string} data.tier - 'green'|'yellow'|'orange'|'red'
 * @param {object} data.equivalencies - { delhi_mumbai_drives, trees_needed, household_electricity_months }
 * @param {object[]} [data.badges] - array of badge definition objects
 * @param {object|null} [data.topAction] - highest priority action object
 * @param {HTMLCanvasElement} canvasElement
 */
export function generateShareCard(data, canvasElement) {
  const palette = TIER_PALETTE[data.tier] || TIER_PALETTE.green;

  canvasElement.width = CARD_WIDTH;
  canvasElement.height = CARD_HEIGHT;

  const ctx = canvasElement.getContext('2d');

  drawGradientBackground(ctx, palette);
  drawNoise(ctx);
  drawAccentLine(ctx, palette);
  drawLogo(ctx, palette);
  drawBadges(ctx, palette, data.badges || []);
  drawMainScore(ctx, palette, data.totalKg, data.tier);
  drawPledge(ctx, palette, data.topAction || null);
  drawEquivalencies(ctx, palette, data.equivalencies);
  drawWatermark(ctx, palette);
}

/**
 * Triggers a PNG download of the canvas content.
 * @param {HTMLCanvasElement} canvasElement
 * @param {string} [filename='my-carbon-footprint.png']
 */
export function downloadCard(canvasElement, filename = 'my-carbon-footprint.png') {
  canvasElement.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/**
 * Attempts native Web Share API with canvas image.
 * Falls back to downloadCard if Web Share is not supported.
 * @param {HTMLCanvasElement} canvasElement
 * @param {object} shareData - { title, text, url }
 */
export async function shareCard(canvasElement, shareData) {
  if (!navigator.canShare) {
    downloadCard(canvasElement);
    return;
  }

  return new Promise(resolve => {
    canvasElement.toBlob(async blob => {
      if (!blob) {
        downloadCard(canvasElement);
        resolve();
        return;
      }

      const file = new File([blob], 'carbon-footprint.png', { type: 'image/png' });
      const testData = { files: [file] };

      if (navigator.canShare(testData)) {
        try {
          await navigator.share({
            title: shareData.title || 'My Carbon Footprint – CarbonMirror',
            text: shareData.text || 'I just calculated my carbon footprint. Check yours!',
            files: [file]
          });
        } catch {
          // User cancelled or share failed – silently ignore
        }
      } else {
        downloadCard(canvasElement);
      }
      resolve();
    }, 'image/png');
  });
}
