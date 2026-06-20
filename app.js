/**
 * app.js
 * Main Orchestrator & Centralized State Manager
 *
 * Architecture:
 *   - Single AppState object with observer pattern
 *   - Unidirectional data flow: Form → Calculator → AppState → UI/Canvas
 *   - No cross-module side effects outside explicit interfaces
 *
 * Views: 'calculator' | 'results' | 'nudge' | 'challenges' | 'leaderboard'
 */

'use strict';

import {
  calculateTotalFootprint,
  evaluateBadges,
  sanitiseNumber,
  BENCHMARKS
} from './calculator.js';

import * as Viz from './visualization.js';

import {
  setApiKey, getApiKey, clearApiKey, hasApiKey,
  analyseActivity, isNudgeError
} from './nudge-engine.js';

import {
  initGamification, getGamificationState, awardBadges,
  computeLeaderboard, checkIn, startChallenge, completeChallenge,
  markCalculatorCompleted, getEarnedBadges, BADGE_DEFINITIONS, CHALLENGES
} from './gamification.js';

import {
  generateShareCard, downloadCard, shareCard
} from './share.js';

// ─── CENTRALIZED APP STATE ────────────────────────────────────────────────────
const AppState = {
  currentView: 'calculator',
  calculatorInputs: {
    transport: {
      vehicle_type: 'bus_metro',
      daily_km: 0,
      domestic_flights: 0,
      international_flights: 0
    },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 0, lpg_cylinders_month: 0 },
    shopping: { deliveries_month: 0, fashion_items_year: 0 },
    digital: { streaming_hours_day: 0, cloud_storage_gb: 0 }
  },
  results: null,
  gamification: null,
  apiKeyConfigured: false,
  nudgeResult: null,
  nudgeLoading: false,
  _observers: []
};

// ─── OBSERVER PATTERN ────────────────────────────────────────────────────────

/**
 * Subscribes a callback to AppState changes.
 * @param {function} fn - The callback function.
 */
function subscribe(fn) {
  AppState._observers.push(fn);
}

/**
 * Notifies all observers of a state change.
 * @param {string} changedKey - The state key that changed.
 */
function notify(changedKey) {
  for (const fn of AppState._observers) {
    try { fn(changedKey, AppState); } catch { /* prevent one bad observer from halting others */ }
  }
}

/**
 * Updates the centralized state and notifies observers.
 * @param {object} partial - Partial state object to merge.
 */
function setState(partial) {
  Object.assign(AppState, partial);
  notify(Object.keys(partial)[0]);
}

// ─── DOM HELPERS ─────────────────────────────────────────────────────────────

/**
 * Shorthand for document.getElementById.
 * @param {string} id - The DOM element ID.
 * @returns {HTMLElement|null}
 */
function el(id) { return document.getElementById(id); }

/**
 * Safely sets textContent on a DOM element.
 * @param {string} id - The DOM element ID.
 * @param {string|number} text - The text to set.
 */
function setText(id, text) {
  const node = el(id);
  if (node) node.textContent = String(text);
}

/**
 * Safely sets display style on a DOM element.
 * @param {string} id - The DOM element ID.
 * @param {boolean} show - Whether to show (true) or hide (false).
 */
function setDisplay(id, show) {
  const node = el(id);
  if (node) node.style.display = show ? '' : 'none';
}

/**
 * Displays a specific view section and scrolls it into view.
 * @param {string} id - The section element ID.
 */
function showSection(id) {
  document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
  const target = el(id);
  if (target) {
    target.style.display = '';
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Displays an ephemeral toast notification.
 * @param {string} message - The message to display.
 * @param {string} [type='info'] - The toast type ('info', 'success', 'error').
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// ─── VIEW NAVIGATION ─────────────────────────────────────────────────────────

/**
 * Navigates to a specific top-level view.
 * @param {string} view - The view identifier (e.g. 'calculator', 'results').
 */
function navigateTo(view) {
  setState({ currentView: view });

  // Update nav tabs
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.classList.toggle('nav-tab--active', btn.dataset.nav === view);
    btn.setAttribute('aria-selected', btn.dataset.nav === view ? 'true' : 'false');
  });

  const sectionMap = {
    calculator: 'section-calculator',
    results: 'section-results',
    nudge: 'section-nudge',
    challenges: 'section-challenges',
    roadmap: 'section-roadmap',
    leaderboard: 'section-leaderboard'
  };

  Object.entries(sectionMap).forEach(([v, sId]) => {
    const s = el(sId);
    if (s) s.style.display = v === view ? 'block' : 'none';
  });

  if (view === 'results' && AppState.results) {
    renderResultsView();
  }
  if (view === 'challenges') {
    renderChallengesView();
  }
  if (view === 'leaderboard') {
    renderLeaderboardView();
  }
  if (view === 'roadmap') {
    renderRoadmapMilestones();
  }
}

// ─── CALCULATOR FORM READING ──────────────────────────────────────────────────

function readCalculatorInputs() {
  const getVal = id => el(id)?.value ?? '';
  const getNum = id => sanitiseNumber(el(id)?.value);

  return {
    transport: {
      vehicle_type: getVal('input-vehicle-type'),
      daily_km: getNum('input-daily-km'),
      domestic_flights: getNum('input-domestic-flights'),
      international_flights: getNum('input-intl-flights')
    },
    food: {
      diet_type: getVal('input-diet-type')
    },
    home: {
      electricity_kwh_month: getNum('input-electricity'),
      lpg_cylinders_month: getNum('input-lpg')
    },
    shopping: {
      deliveries_month: getNum('input-deliveries'),
      fashion_items_year: getNum('input-fashion')
    },
    digital: {
      streaming_hours_day: getNum('input-streaming'),
      cloud_storage_gb: getNum('input-cloud-storage')
    }
  };
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────

function validateInputs(inputs) {
  const errors = [];

  if (!inputs.transport.vehicle_type) {
    errors.push('Please select a vehicle type.');
  }
  if (!inputs.food.diet_type) {
    errors.push('Please select a diet type.');
  }

  return errors;
}

// ─── CALCULATOR SUBMISSION ────────────────────────────────────────────────────

function handleCalculatorSubmit(e) {
  e.preventDefault();

  const inputs = readCalculatorInputs();
  const errors = validateInputs(inputs);

  // Clear previous errors
  document.querySelectorAll('.field-error').forEach(n => n.textContent = '');

  if (errors.length > 0) {
    errors.forEach(msg => showToast(msg, 'error'));
    return;
  }

  const results = calculateTotalFootprint(inputs);
  const badgeIds = evaluateBadges(inputs, true);
  const newBadges = awardBadges(badgeIds);
  markCalculatorCompleted(results.total_kg);

  const gamState = getGamificationState();

  setState({
    calculatorInputs: inputs,
    results,
    gamification: gamState,
    currentView: 'results'
  });

  // Update visualization
  Viz.update(results.tier, results.total_kg);

  if (newBadges.length > 0) {
    newBadges.forEach(id => {
      const badge = BADGE_DEFINITIONS[id];
      if (badge) showToast(`🏅 Badge Earned: ${badge.name}`, 'success');
    });
  }

  navigateTo('results');
}

// ─── RESULTS RENDERING ────────────────────────────────────────────────────────

function renderResultsView() {
  const r = AppState.results;
  if (!r) return;

  // Total score
  setText('result-total-kg', r.total_kg.toLocaleString('en-IN', { maximumFractionDigits: 1 }));
  setText('result-tier-label', capitalize(r.tier) + ' Zone');

  // Update tier styling
  const tierEl = el('result-tier-label');
  if (tierEl) {
    tierEl.className = 'tier-badge tier-badge--' + r.tier;
  }

  // Category breakdown
  const categories = r.categories;
  const total = r.total_kg || 1;
  ['transport', 'food', 'home', 'shopping', 'digital'].forEach(cat => {
    const kg = categories[cat] || 0;
    const pct = Math.round((kg / total) * 100);
    setText(`cat-${cat}-kg`, kg.toFixed(1));
    setText(`cat-${cat}-pct`, pct + '%');
    const bar = el(`cat-${cat}-bar`);
    if (bar) {
      bar.style.width = Math.min(pct, 100) + '%';
      bar.setAttribute('aria-valuenow', pct);
    }
  });

  // Equivalencies
  const eq = r.equivalencies;
  setText('equiv-drives', eq.delhi_mumbai_drives);
  setText('equiv-trees', eq.trees_needed);
  setText('equiv-home-months', eq.household_electricity_months);

  // Benchmarks
  const diff = r.vs_india_avg;
  const diffEl = el('result-vs-india');
  if (diffEl) {
    diffEl.textContent = (diff > 0 ? '+' : '') + Math.round(diff).toLocaleString('en-IN') + ' kg vs India avg';
    diffEl.className = 'benchmark-diff ' + (diff > 0 ? 'benchmark-diff--above' : 'benchmark-diff--below');
  }

  // Net-zero progress
  const progressEl = el('netzero-progress-bar');
  if (progressEl) {
    const pct = Math.max(0, Math.min(100, r.progress_to_net_zero_pct));
    progressEl.style.width = pct + '%';
    progressEl.setAttribute('aria-valuenow', Math.round(pct));
  }
  setText('netzero-gap-kg', Math.max(0, Math.round(r.vs_net_zero)).toLocaleString('en-IN'));

  // Action roadmap
  renderActionRoadmap(r.reductionRoadmap);

  // Badges
  renderBadgesPanel();

  // Update share card preview
  renderShareCardPreview();
}

function renderActionRoadmap(actions) {
  const container = el('roadmap-list');
  if (!container) return;

  while (container.firstChild) container.removeChild(container.firstChild);

  if (!actions || actions.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = 'Great job! Your footprint is already very low.';
    container.appendChild(msg);
    return;
  }

  actions.forEach((action, index) => {
    const item = document.createElement('div');
    item.className = 'roadmap-item';
    item.setAttribute('tabindex', '0');

    const num = document.createElement('span');
    num.className = 'roadmap-item__number';
    num.textContent = String(index + 1);

    const content = document.createElement('div');
    content.className = 'roadmap-item__content';

    const title = document.createElement('p');
    title.className = 'roadmap-item__title';
    title.textContent = action.action;

    const savings = document.createElement('div');
    savings.className = 'roadmap-item__savings';

    const co2Span = document.createElement('span');
    co2Span.className = 'savings-co2';
    co2Span.textContent = `−${action.co2_saved_kg.toLocaleString('en-IN')} kg CO₂/yr`;

    savings.appendChild(co2Span);

    if (action.inr_savings > 0) {
      const inrSpan = document.createElement('span');
      inrSpan.className = 'savings-inr';
      inrSpan.textContent = `Save ₹${action.inr_savings.toLocaleString('en-IN')}/yr`;
      savings.appendChild(inrSpan);
    }

    const catBadge = document.createElement('span');
    catBadge.className = `cat-badge cat-badge--${action.category}`;
    catBadge.textContent = capitalize(action.category);

    content.appendChild(title);
    content.appendChild(savings);
    content.appendChild(catBadge);
    item.appendChild(num);
    item.appendChild(content);
    container.appendChild(item);
  });
}

function renderBadgesPanel() {
  const container = el('badges-grid');
  if (!container) return;

  while (container.firstChild) container.removeChild(container.firstChild);

  const earned = getEarnedBadges();
  const allBadges = Object.values(BADGE_DEFINITIONS);

  allBadges.forEach(badge => {
    const isEarned = earned.some(b => b.id === badge.id);
    const card = document.createElement('div');
    card.className = `badge-card ${isEarned ? 'badge-card--earned' : 'badge-card--locked'}`;
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${badge.name}: ${badge.description}`);
    card.setAttribute('title', badge.description);

    const icon = document.createElement('span');
    icon.className = 'badge-icon';
    icon.textContent = badge.icon;

    const name = document.createElement('p');
    name.className = 'badge-name';
    name.textContent = badge.name;

    const desc = document.createElement('p');
    desc.className = 'badge-desc';
    desc.textContent = isEarned ? badge.description : '🔒 Not yet earned';

    card.appendChild(icon);
    card.appendChild(name);
    card.appendChild(desc);
    container.appendChild(card);
  });
}

// ─── CHALLENGES VIEW ──────────────────────────────────────────────────────────

function renderChallengesView() {
  const gamState = getGamificationState();

  Object.entries(CHALLENGES).forEach(([id, def]) => {
    const cState = gamState.challenges[id];
    if (!cState) return;

    const progressEl = el(`challenge-progress-${id}`);
    const statusEl = el(`challenge-status-${id}`);
    const startBtn = el(`challenge-start-${id}`);
    const checkBtn = el(`challenge-check-${id}`);

    if (progressEl) {
      const pct = cState.completed_days > 0
        ? (cState.completed_days / def.duration_days) * 100
        : 0;
      progressEl.style.width = Math.round(pct) + '%';
      progressEl.setAttribute('aria-valuenow', Math.round(pct));
    }

    const daysText = `${cState.completed_days}/${def.duration_days} days`;

    if (statusEl) {
      statusEl.textContent = cState.completed
        ? '✅ Completed!'
        : cState.active
          ? `In Progress – ${daysText}`
          : 'Not started';
    }

    if (startBtn) {
      startBtn.style.display = (!cState.active && !cState.completed) ? '' : 'none';
    }
    if (checkBtn) {
      checkBtn.style.display = (cState.active && !cState.completed) ? '' : 'none';
    }
  });

  // Streak
  const gamification = getGamificationState();
  setText('streak-current', gamification.streak.current);
  setText('streak-longest', gamification.streak.longest);
}

// ─── LEADERBOARD VIEW ─────────────────────────────────────────────────────────

function renderLeaderboardView() {
  const footprintKg = AppState.results?.total_kg ?? 9999;
  const leaderboard = computeLeaderboard(footprintKg);

  const tbody = el('leaderboard-tbody');
  if (!tbody) return;

  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

  leaderboard.forEach(entry => {
    const row = document.createElement('tr');
    row.className = entry.isUser ? 'lb-row lb-row--user' : 'lb-row';

    const rankCell = document.createElement('td');
    const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;
    rankCell.textContent = medal;
    rankCell.className = 'lb-rank';

    const nameCell = document.createElement('td');
    nameCell.textContent = entry.isUser ? '👤 You' : entry.name;
    nameCell.className = 'lb-name';

    const kgCell = document.createElement('td');
    kgCell.textContent = Math.round(entry.kg).toLocaleString('en-IN') + ' kg';
    kgCell.className = 'lb-kg';

    const barCell = document.createElement('td');
    const bar = document.createElement('div');
    bar.className = 'lb-bar-track';
    const fill = document.createElement('div');
    fill.className = 'lb-bar-fill';
    const pct = Math.min(100, (entry.kg / 3500) * 100);
    fill.style.width = Math.round(pct) + '%';
    bar.appendChild(fill);
    barCell.appendChild(bar);
    barCell.className = 'lb-bar-cell';

    row.appendChild(rankCell);
    row.appendChild(nameCell);
    row.appendChild(kgCell);
    row.appendChild(barCell);
    tbody.appendChild(row);
  });

  const rank = leaderboard.find(e => e.isUser)?.rank;
  if (rank) {
    setText('user-rank-text', `You rank #${rank} out of ${leaderboard.length} in your peer group`);
  }
}

// ─── NUDGE ENGINE UI ─────────────────────────────────────────────────────────

async function handleNudgeScan() {
  const input = el('nudge-input');
  if (!input) return;
  const activityText = input.value.trim();

  if (!activityText) {
    showToast('Please describe an activity to scan.', 'error');
    return;
  }

  if (!hasApiKey()) {
    showToast('Please set your Gemini API key first.', 'error');
    el('api-key-panel')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  setState({ nudgeLoading: true, nudgeResult: null });
  renderNudgeResult(null, true);

  try {
    const result = await analyseActivity(activityText);
    setState({ nudgeLoading: false, nudgeResult: result });
    renderNudgeResult(result, false);
  } catch (err) {
    setState({ nudgeLoading: false, nudgeResult: null });
    const msg = isNudgeError(err) ? err.userMessage : 'An unexpected error occurred. Please try again.';
    showToast(msg, 'error');
    renderNudgeResult(null, false, msg);
  }
}

function renderNudgeResult(result, loading, errorMsg) {
  const container = el('nudge-result-panel');
  if (!container) return;

  while (container.firstChild) container.removeChild(container.firstChild);

  if (loading) {
    const spinner = document.createElement('div');
    spinner.className = 'nudge-spinner';
    spinner.setAttribute('aria-label', 'Analysing activity…');
    spinner.setAttribute('role', 'status');
    const spinnerText = document.createElement('p');
    spinnerText.textContent = '🔍 Analysing with Gemini AI…';
    spinner.appendChild(spinnerText);
    container.appendChild(spinner);
    return;
  }

  if (errorMsg) {
    const errEl = document.createElement('div');
    errEl.className = 'nudge-error';
    errEl.setAttribute('role', 'alert');
    const errText = document.createElement('p');
    errText.textContent = '⚠️ ' + errorMsg;
    errEl.appendChild(errText);
    container.appendChild(errEl);
    return;
  }

  if (!result) return;

  // CO2 estimate
  const scoreCard = document.createElement('div');
  scoreCard.className = 'nudge-score-card';

  const scoreLabel = document.createElement('p');
  scoreLabel.className = 'nudge-score-label';
  scoreLabel.textContent = 'Estimated Carbon Impact';

  const scoreValue = document.createElement('p');
  scoreValue.className = 'nudge-score-value';
  scoreValue.textContent = result.estimated_co2.toFixed(3) + ' kg CO₂';
  scoreValue.setAttribute('aria-live', 'polite');

  const analogy = document.createElement('p');
  analogy.className = 'nudge-analogy';
  analogy.textContent = '💡 ' + result.emotional_analogy;

  scoreCard.appendChild(scoreLabel);
  scoreCard.appendChild(scoreValue);
  scoreCard.appendChild(analogy);
  container.appendChild(scoreCard);

  // Alternatives
  const altTitle = document.createElement('h3');
  altTitle.className = 'nudge-alt-title';
  altTitle.textContent = 'Greener Alternatives';
  container.appendChild(altTitle);

  result.alternatives.forEach(alt => {
    const altCard = document.createElement('div');
    altCard.className = 'nudge-alt-card';
    altCard.setAttribute('tabindex', '0');

    const altName = document.createElement('p');
    altName.className = 'nudge-alt-name';
    altName.textContent = alt.name;

    const altSavings = document.createElement('div');
    altSavings.className = 'nudge-alt-savings';

    const co2Span = document.createElement('span');
    co2Span.className = 'savings-co2';
    co2Span.textContent = `−${alt.co2_savings.toFixed(3)} kg CO₂`;

    altSavings.appendChild(co2Span);

    if (alt.rupee_savings > 0) {
      const inrSpan = document.createElement('span');
      inrSpan.className = 'savings-inr';
      inrSpan.textContent = `Save ₹${Math.round(alt.rupee_savings).toLocaleString('en-IN')}`;
      altSavings.appendChild(inrSpan);
    }

    altCard.appendChild(altName);
    altCard.appendChild(altSavings);
    container.appendChild(altCard);
  });
}

// ─── API KEY PANEL ────────────────────────────────────────────────────────────

function handleApiKeySave() {
  const input = el('api-key-input');
  if (!input) return;
  const key = input.value.trim();
  if (!key) {
    showToast('Please enter a valid API key.', 'error');
    return;
  }
  try {
    setApiKey(key);
    input.value = '';
    setState({ apiKeyConfigured: true });
    setText('api-key-status', '✅ API key configured (session only)');
    el('api-key-status')?.classList.add('status--ok');
    showToast('Gemini API key saved for this session.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function handleApiKeyClear() {
  clearApiKey();
  setState({ apiKeyConfigured: false });
  setText('api-key-status', '⚠️ No API key configured');
  el('api-key-status')?.classList.remove('status--ok');
  showToast('API key cleared.', 'info');
}

// ─── SHARE CARD ───────────────────────────────────────────────────────────────

function renderShareCardPreview() {
  const canvas = el('share-canvas');
  if (!canvas || !AppState.results) return;

  const badges = getEarnedBadges();
  const topAction = AppState.results.reductionRoadmap?.[0] || null;

  generateShareCard({
    totalKg: AppState.results.total_kg,
    tier: AppState.results.tier,
    equivalencies: AppState.results.equivalencies,
    badges,
    topAction
  }, canvas);
}

function handleDownloadCard() {
  const canvas = el('share-canvas');
  if (!canvas) return;
  downloadCard(canvas, 'my-carbon-footprint.png');
  showToast('Downloading share card…', 'info');
}

async function handleShareCard() {
  const canvas = el('share-canvas');
  if (!canvas) return;
  await shareCard(canvas, {
    title: 'My Carbon Footprint – CarbonMirror',
    text: `My annual carbon footprint is ${Math.round(AppState.results?.total_kg || 0)} kg CO₂. Check yours at CarbonMirror!`
  });
}

// ─── CHECK-IN HANDLER ─────────────────────────────────────────────────────────

function handleCheckIn() {
  const result = checkIn();
  if (result.alreadyCheckedIn) {
    showToast('Already checked in today! See you tomorrow. 🌱', 'info');
  } else {
    showToast(`Check-in recorded! 🔥 Streak: ${result.current} day${result.current > 1 ? 's' : ''}`, 'success');
  }
  renderChallengesView();
}

// ─── CHALLENGE HANDLERS ───────────────────────────────────────────────────────

function handleStartChallenge(challengeId) {
  const result = startChallenge(challengeId);
  showToast(result.message, result.success ? 'success' : 'error');
  renderChallengesView();
}

function handleLogChallengeDay(challengeId) {
  const result = completeChallenge(challengeId);
  if (result.success) {
    if (result.completed) {
      showToast(`🎉 Challenge complete! You saved ${(result.co2Saved).toFixed(1)} kg CO₂ today.`, 'success');
    } else {
      showToast(`Day logged! ${result.daysRemaining} day${result.daysRemaining !== 1 ? 's' : ''} remaining.`, 'success');
    }
  } else {
    showToast('Could not log day – challenge may not be active.', 'error');
  }
  renderChallengesView();
}

// ─── KEYBOARD ACCESSIBILITY ──────────────────────────────────────────────────

function handleGlobalKeydown(e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('roadmap-item')) {
    e.preventDefault();
  }
}

// ─── CAPITALIZE HELPER ────────────────────────────────────────────────────────
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── ROADMAP MILESTONES RENDERING ────────────────────────────────────────────

const ROADMAP_MILESTONES = [
  { id: 1, threshold: 1650, badgeName: 'Conscious Starter', icon: '🌿' },
  { id: 2, threshold: 1500, badgeName: 'Green Zone Pioneer', icon: '🌱' },
  { id: 3, threshold: 1400, badgeName: 'Climate Conscious', icon: '🌍' },
  { id: 4, threshold: 1300, badgeName: 'Carbon Minimalist', icon: '🌳' },
  { id: 5, threshold: 1200, badgeName: 'Net-Zero Champion', icon: '🏆' }
];

function renderRoadmapMilestones() {
  const currentKg = AppState.results?.total_kg ?? null;

  // Update hero score
  if (currentKg !== null) {
    setText('rm-current-kg', Math.round(currentKg).toLocaleString('en-IN'));
    setText('rm-hint-text', '');

    // Master progress bar: 1750 → 1200 is 100%
    const startKg = 1750;
    const endKg = 1200;
    const clampedKg = Math.min(startKg, Math.max(endKg, currentKg));
    const pct = ((startKg - clampedKg) / (startKg - endKg)) * 100;
    const masterFill = el('rm-master-fill');
    if (masterFill) masterFill.style.width = Math.min(100, Math.round(pct)) + '%';
  } else {
    setText('rm-hint-text', 'Calculate your footprint first to see your progress on the roadmap.');
  }

  // Update tick dots
  ROADMAP_MILESTONES.forEach((m) => {
    const tickDot = el(`rm-tick-${m.id}`);
    if (tickDot) {
      if (currentKg !== null && currentKg <= m.threshold) {
        tickDot.classList.add('rm-tick-dot--reached');
      } else {
        tickDot.classList.remove('rm-tick-dot--reached');
      }
    }
  });

  // Update milestone cards
  ROADMAP_MILESTONES.forEach((m, idx) => {
    const card = el(`milestone-card-${m.id}`);
    const body = card?.querySelector('.milestone-body');
    const statusPill = el(`milestone-status-${m.id}`);
    const badgeIcon = el(`milestone-badge-${m.id}`);
    const connector = el(`milestone-connector-${m.id}`);

    const isUnlocked = currentKg !== null && currentKg <= m.threshold;

    if (statusPill) {
      statusPill.textContent = isUnlocked ? '✅ Unlocked!' : '🔒 Locked';
      statusPill.className = isUnlocked
        ? 'milestone-status-pill milestone-status-pill--unlocked'
        : 'milestone-status-pill';
    }

    if (body) {
      if (isUnlocked) {
        body.classList.add('milestone-body--unlocked');
      } else {
        body.classList.remove('milestone-body--unlocked');
      }
    }

    if (badgeIcon) {
      if (isUnlocked) {
        badgeIcon.classList.add('milestone-badge-icon--unlocked');
      } else {
        badgeIcon.classList.remove('milestone-badge-icon--unlocked');
      }
    }

    if (connector) {
      const nextUnlocked = idx < ROADMAP_MILESTONES.length - 1 && currentKg !== null && currentKg <= ROADMAP_MILESTONES[idx + 1]?.threshold;
      if (nextUnlocked) {
        connector.classList.add('milestone-connector--lit');
      } else {
        connector.classList.remove('milestone-connector--lit');
      }
    }
  });

  // Render roadmap badge grid
  renderRoadmapBadgesPanel(currentKg);
}

function renderRoadmapBadgesPanel(currentKg) {
  const container = el('roadmap-badges-grid');
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  ROADMAP_MILESTONES.forEach((m) => {
    const isEarned = currentKg !== null && currentKg <= m.threshold;
    const card = document.createElement('div');
    card.className = `badge-card ${isEarned ? 'badge-card--earned' : 'badge-card--locked'}`;
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${m.badgeName} badge – ${isEarned ? 'earned' : 'locked'}`);

    const icon = document.createElement('span');
    icon.className = 'badge-icon';
    icon.textContent = m.icon;

    const name = document.createElement('p');
    name.className = 'badge-name';
    name.textContent = m.badgeName;

    const desc = document.createElement('p');
    desc.className = 'badge-desc';
    desc.textContent = isEarned
      ? `Unlocked at ≤ ${m.threshold.toLocaleString('en-IN')} kg CO₂/yr`
      : `🔒 Reach ≤ ${m.threshold.toLocaleString('en-IN')} kg CO₂/yr`;

    card.appendChild(icon);
    card.appendChild(name);
    card.appendChild(desc);
    container.appendChild(card);
  });
}

// ─── SLIDER LIVE FEEDBACK ─────────────────────────────────────────────────────

const SLIDER_LABELS = {
  'input-daily-km': v => `${v} km/day`,
  'input-domestic-flights': v => `${v} flight${v == 1 ? '' : 's'}`,
  'input-intl-flights': v => `${v} flight${v == 1 ? '' : 's'}`,
  'input-electricity': v => `${v} kWh`,
  'input-lpg': v => `${v} cyl`,
  'input-deliveries': v => `${v} order${v == 1 ? '' : 's'}`,
  'input-fashion': v => `${v} item${v == 1 ? '' : 's'}`,
  'input-streaming': v => `${v} hrs`,
  'input-cloud-storage': v => `${v} GB`
};

function updateSliderFill(sliderEl) {
  const min = parseFloat(sliderEl.min) || 0;
  const max = parseFloat(sliderEl.max) || 100;
  const val = parseFloat(sliderEl.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;
  sliderEl.style.backgroundSize = `${pct}% 100%`;
}

function attachSliderBindings() {
  Object.keys(SLIDER_LABELS).forEach(sliderId => {
    const slider = el(sliderId);
    if (!slider) return;
    const badgeId = `val-${sliderId.replace('input-', '')}`;

    const update = () => {
      const val = parseFloat(slider.value) || 0;
      const label = SLIDER_LABELS[sliderId](val);
      setText(badgeId, label);
      updateSliderFill(slider);
      // Trigger live CO2 preview
      try {
        const inputs = readCalculatorInputs();
        const result = calculateTotalFootprint(inputs);
        const liveEl = el('live-summary');
        if (liveEl) liveEl.textContent = `Estimated: ~${Math.round(result.total_kg).toLocaleString('en-IN')} kg CO\u2082/yr`;
        Viz.update(result.tier, result.total_kg);
      } catch { /* ignore mid-edit errors */ }
    };

    slider.addEventListener('input', update);
    update(); // init
  });
}

function attachDietPillBindings() {
  const radios = document.querySelectorAll('.diet-radio');
  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      // Keep hidden select in sync
      const hiddenSelect = el('input-diet-type');
      if (hiddenSelect) hiddenSelect.value = radio.value;
      // Trigger live CO2 preview
      try {
        const inputs = readCalculatorInputs();
        const result = calculateTotalFootprint(inputs);
        const liveEl = el('live-summary');
        if (liveEl) liveEl.textContent = `Estimated: ~${Math.round(result.total_kg).toLocaleString('en-IN')} kg CO\u2082/yr`;
        Viz.update(result.tier, result.total_kg);
      } catch { /* ignore mid-edit errors */ }
    });
  });
}

// ─── LIVE INPUT FEEDBACK ─────────────────────────────────────────────────────

function attachLiveInputFeedback() {
  const calcForm = el('calculator-form');
  if (!calcForm) return;

  // vehicle type change
  el('input-vehicle-type')?.addEventListener('change', () => {
    try {
      const inputs = readCalculatorInputs();
      const result = calculateTotalFootprint(inputs);
      const liveEl = el('live-summary');
      if (liveEl) liveEl.textContent = `Estimated: ~${Math.round(result.total_kg).toLocaleString('en-IN')} kg CO\u2082/yr`;
      Viz.update(result.tier, result.total_kg);
    } catch { /* ignore */ }
  });
}

// ─── THEME TOGGLE ────────────────────────────────────────────────────────────

function initTheme() {
  // Default to light theme as requested for high readability
  const savedTheme = localStorage.getItem('carbonmirror_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const btn = el('btn-theme-toggle');
  if (btn) {
    btn.textContent = savedTheme === 'light' ? '🌙' : '☀️';
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('carbonmirror_theme', next);
      btn.textContent = next === 'light' ? '🌙' : '☀️';
      
      // Update canvas slightly to ensure colors match theme (e.g. text labels if any)
      if (AppState.results) {
        Viz.update(AppState.results.tier, AppState.results.total_kg);
      } else {
        Viz.update('green', 0);
      }
    });
  }
}

// ─── INITIALIZATION ───────────────────────────────────────────────────────────

function init() {
  // Init theme
  initTheme();

  // Initialize gamification
  initGamification();
  setState({ gamification: getGamificationState() });

  // Check API key session state
  setState({ apiKeyConfigured: hasApiKey() });

  // Initialize canvas visualization
  const canvas = el('planet-canvas');
  if (canvas) {
    Viz.init(canvas);
    Viz.update('green', 0);
  }

  bindNavigation();
  bindCalculatorForm();
  bindApiKeyPanel();
  bindNudgeEngine();
  bindGamification();
  attachSliderBindings();
  attachDietPillBindings();
  attachLiveInputFeedback();

  bindShareCard();
  bindKeyboardEvents();
  showInitialApiStatus();

  // Show calculator by default
  navigateTo('calculator');

  console.log('[CarbonMirror] Application initialized.');
}

// ─── EVENT BINDING HELPERS ────────────────────────────────────────────────────

function bindNavigation() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateTo(btn.dataset.nav);
      }
    });
  });
}

function bindCalculatorForm() {
  const form = el('calculator-form');
  if (form) form.addEventListener('submit', handleCalculatorSubmit);
}

function bindApiKeyPanel() {
  el('btn-api-save')?.addEventListener('click', handleApiKeySave);
  el('btn-api-clear')?.addEventListener('click', handleApiKeyClear);
}

function bindNudgeEngine() {
  el('btn-nudge-scan')?.addEventListener('click', handleNudgeScan);
  el('nudge-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleNudgeScan();
  });
}

function bindGamification() {
  Object.keys(CHALLENGES).forEach(id => {
    el(`challenge-start-${id}`)?.addEventListener('click', () => handleStartChallenge(id));
    el(`challenge-check-${id}`)?.addEventListener('click', () => handleLogChallengeDay(id));
  });
  el('btn-checkin')?.addEventListener('click', handleCheckIn);
}

function bindShareCard() {
  el('btn-download-card')?.addEventListener('click', handleDownloadCard);
  el('btn-share-card')?.addEventListener('click', handleShareCard);
}

function bindKeyboardEvents() {
  document.addEventListener('keydown', handleGlobalKeydown);
}

function showInitialApiStatus() {
  if (hasApiKey()) {
    setText('api-key-status', '✅ API key configured (session only)');
    el('api-key-status')?.classList.add('status--ok');
  }
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
