/**
 * gamification.js
 * Challenges, Badges, Streaks, and Leaderboard Engine
 *
 * All persistence uses localStorage (browser-local, no server communication).
 *
 * Exports:
 *   initGamification()           – loads state from localStorage
 *   saveGamification(state)      – persists state to localStorage
 *   resetGamification()          – clears all gamification state
 *   getGamificationState()       – returns current state snapshot
 *   checkIn()                    – records a daily check-in and updates streaks
 *   startChallenge(id)           – activates a challenge
 *   completeChallenge(id)        – marks a challenge day complete
 *   awardBadges(badgeIds)        – merges new badge IDs into state
 *   computeLeaderboard(userKg)   – returns a 10-person peer ranking
 */

'use strict';

const STORAGE_KEY = 'cfp_gamification_v1';
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ─── CHALLENGE DEFINITIONS ────────────────────────────────────────────────────
export const CHALLENGES = {
  waste_minimization_7: {
    id: 'waste_minimization_7',
    name: '7-Day Waste Minimization',
    description: 'Eliminate single-use plastics and reduce household waste for 7 consecutive days.',
    duration_days: 7,
    co2_saved_kg_per_day: 0.4,
    badge_reward: null,
    icon: '♻️'
  },
  commute_swap_30: {
    id: 'commute_swap_30',
    name: '30-Day Commute Swap',
    description: 'Replace your regular vehicle commute with public transit or cycling for 30 days.',
    duration_days: 30,
    co2_saved_kg_per_day: 1.2,
    badge_reward: null,
    icon: '🚇'
  }
};

// ─── BADGE DEFINITIONS ────────────────────────────────────────────────────────
export const BADGE_DEFINITIONS = {
  carbon_rookie: {
    id: 'carbon_rookie',
    name: 'Carbon Rookie',
    description: 'Completed your first carbon footprint calculation.',
    icon: '🌱',
    color: '#38a169'
  },
  flight_free_champion: {
    id: 'flight_free_champion',
    name: 'Flight-Free Champion',
    description: 'Zero flights this year – keeping your sky clean.',
    icon: '✈️',
    color: '#3182ce'
  },
  plant_powered: {
    id: 'plant_powered',
    name: 'Plant-Powered',
    description: 'Vegan or vegetarian diet – eating for the planet.',
    icon: '🥗',
    color: '#2f855a'
  },
  energy_ninja: {
    id: 'energy_ninja',
    name: 'Energy Ninja',
    description: 'Electricity usage under 100 kWh/month – seriously efficient.',
    icon: '⚡',
    color: '#d69e2e'
  }
};

// ─── VIRTUAL PEER PROFILES ────────────────────────────────────────────────────
// Simulated peer footprints calibrated to urban Indian range (800–3500 kg/yr)
const VIRTUAL_PEERS = [
  { name: 'Arjun M.', kg: 980 },
  { name: 'Priya S.', kg: 1250 },
  { name: 'Rohan K.', kg: 1480 },
  { name: 'Neha G.', kg: 1650 },
  { name: 'Vikram D.', kg: 1900 },
  { name: 'Sneha P.', kg: 2100 },
  { name: 'Karthik R.', kg: 2400 },
  { name: 'Ananya B.', kg: 2700 },
  { name: 'Manish T.', kg: 3050 },
  { name: 'Divya N.', kg: 3400 }
];

// ─── DEFAULT STATE ────────────────────────────────────────────────────────────
/**
 * Creates the initial default state for the gamification engine.
 * @returns {object} The default state object.
 */
function createDefaultState() {
  return {
    version: 1,
    badges: [],
    challenges: {
      waste_minimization_7: {
        active: false,
        started_date: null,
        completed_days: 0,
        completed: false
      },
      commute_swap_30: {
        active: false,
        started_date: null,
        completed_days: 0,
        completed: false
      }
    },
    streak: {
      current: 0,
      longest: 0,
      last_checkin_date: null
    },
    total_co2_saved_kg: 0,
    calculator_completed: false,
    last_footprint_kg: null
  };
}

// ─── DATE UTILITIES ───────────────────────────────────────────────────────────
/**
 * Returns today's date formatted as YYYY-MM-DD.
 * @returns {string} The formatted date string.
 */
function getTodayString() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Calculates the number of full days between two date strings.
 * @param {string|null} dateStr1 - The earlier date (YYYY-MM-DD).
 * @param {string|null} dateStr2 - The later date (YYYY-MM-DD).
 * @returns {number} The difference in days, or Infinity if missing.
 */
function daysBetween(dateStr1, dateStr2) {
  if (!dateStr1 || !dateStr2) return Infinity;
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return Math.round((d2 - d1) / MS_PER_DAY);
}

// ─── PERSISTENCE ──────────────────────────────────────────────────────────────

let _state = null;

/**
 * Loads gamification state from localStorage or creates a fresh default state.
 * @returns {object} current gamification state
 */
export function initGamification() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge with defaults to handle version upgrades
      _state = Object.assign(createDefaultState(), parsed);
    } else {
      _state = createDefaultState();
    }
  } catch {
    _state = createDefaultState();
  }
  return getGamificationState();
}

/**
 * Persists current state to localStorage.
 */
function _persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
  } catch {
    // localStorage may be unavailable in private mode
  }
}

/**
 * Returns a deep-cloned snapshot of the current gamification state.
 * @returns {object}
 */
export function getGamificationState() {
  if (!_state) initGamification();
  return JSON.parse(JSON.stringify(_state));
}

/**
 * Replaces internal state with a given state object and persists it.
 * @param {object} newState
 */
export function saveGamification(newState) {
  _state = newState;
  _persistState();
}

/**
 * Clears all gamification data from localStorage and resets in-memory state.
 */
export function resetGamification() {
  _state = createDefaultState();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

// ─── DAILY CHECK-IN ───────────────────────────────────────────────────────────

/**
 * Records a daily check-in. Updates streak counters.
 * Returns { alreadyCheckedIn, streak } result object.
 * @returns {{ alreadyCheckedIn: boolean, current: number, longest: number }}
 */
export function checkIn() {
  if (!_state) initGamification();

  const today = getTodayString();
  const lastDate = _state.streak.last_checkin_date;

  if (lastDate === today) {
    return { alreadyCheckedIn: true, current: _state.streak.current, longest: _state.streak.longest };
  }

  const gap = daysBetween(lastDate, today);

  if (gap === 1) {
    // Consecutive day
    _state.streak.current += 1;
  } else {
    // Streak broken or first check-in
    _state.streak.current = 1;
  }

  if (_state.streak.current > _state.streak.longest) {
    _state.streak.longest = _state.streak.current;
  }

  _state.streak.last_checkin_date = today;
  _persistState();

  return {
    alreadyCheckedIn: false,
    current: _state.streak.current,
    longest: _state.streak.longest
  };
}

// ─── CHALLENGES ───────────────────────────────────────────────────────────────

/**
 * Activates a challenge if it exists and hasn't been started yet.
 * @param {string} challengeId
 * @returns {{ success: boolean, message: string }}
 */
export function startChallenge(challengeId) {
  if (!_state) initGamification();
  if (!CHALLENGES[challengeId]) {
    return { success: false, message: 'Unknown challenge.' };
  }

  const cState = _state.challenges[challengeId];
  if (!cState) {
    return { success: false, message: 'Challenge state not found.' };
  }
  if (cState.active) {
    return { success: false, message: 'Challenge already in progress.' };
  }
  if (cState.completed) {
    return { success: false, message: 'Challenge already completed.' };
  }

  _state.challenges[challengeId] = {
    active: true,
    started_date: getTodayString(),
    completed_days: 0,
    completed: false
  };
  _persistState();

  return { success: true, message: `${CHALLENGES[challengeId].name} started!` };
}

/**
 * Records a daily completion for an active challenge.
 * Marks challenge as completed if all days are done.
 * @param {string} challengeId
 * @returns {{ success: boolean, completed: boolean, daysRemaining: number, co2Saved: number }}
 */
export function completeChallenge(challengeId) {
  if (!_state) initGamification();
  const definition = CHALLENGES[challengeId];
  if (!definition) return { success: false, completed: false, daysRemaining: 0, co2Saved: 0 };

  const cState = _state.challenges[challengeId];
  if (!cState || !cState.active) {
    return { success: false, completed: false, daysRemaining: 0, co2Saved: 0 };
  }

  cState.completed_days = Math.min(cState.completed_days + 1, definition.duration_days);
  const co2Saved = definition.co2_saved_kg_per_day;
  _state.total_co2_saved_kg = +(_state.total_co2_saved_kg + co2Saved).toFixed(3);

  if (cState.completed_days >= definition.duration_days) {
    cState.completed = true;
    cState.active = false;
  }

  const daysRemaining = definition.duration_days - cState.completed_days;
  _persistState();

  return {
    success: true,
    completed: cState.completed,
    daysRemaining,
    co2Saved
  };
}

// ─── BADGES ───────────────────────────────────────────────────────────────────

/**
 * Awards one or more badge IDs to the user (idempotent – no duplicates).
 * @param {string[]} badgeIds
 * @returns {string[]} newly awarded badge IDs (not previously held)
 */
export function awardBadges(badgeIds) {
  if (!_state) initGamification();
  const newBadges = [];
  for (const id of badgeIds) {
    if (BADGE_DEFINITIONS[id] && !_state.badges.includes(id)) {
      _state.badges.push(id);
      newBadges.push(id);
    }
  }
  if (newBadges.length > 0) _persistState();
  return newBadges;
}

/**
 * Returns the full badge definition objects for all earned badge IDs.
 * @returns {object[]}
 */
export function getEarnedBadges() {
  if (!_state) initGamification();
  return _state.badges
    .filter(id => BADGE_DEFINITIONS[id])
    .map(id => BADGE_DEFINITIONS[id]);
}

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────

/**
 * Computes a 10-person peer leaderboard (9 virtual + the user),
 * sorted by ascending kg CO₂ (lower is better).
 * @param {number} userKg - user's annual footprint in kg
 * @param {string} [userName='You'] - display name for the user
 * @returns {Array<{ rank: number, name: string, kg: number, isUser: boolean }>}
 */
export function computeLeaderboard(userKg, userName = 'You') {
  const safeKg = isNaN(userKg) || userKg < 0 ? 9999 : userKg;

  const entries = [
    ...VIRTUAL_PEERS.map(p => ({ name: p.name, kg: p.kg, isUser: false })),
    { name: userName, kg: safeKg, isUser: true }
  ];

  entries.sort((a, b) => a.kg - b.kg);

  return entries.map((entry, index) => ({
    rank: index + 1,
    name: entry.name,
    kg: entry.kg,
    isUser: entry.isUser
  }));
}

/**
 * Returns the user's rank among the simulated peer group.
 * @param {number} userKg
 * @returns {number} 1–11 (1 = lowest footprint)
 */
export function getUserRank(userKg) {
  const lb = computeLeaderboard(userKg);
  const entry = lb.find(e => e.isUser);
  return entry ? entry.rank : 11;
}

// ─── CALCULATOR COMPLETION ────────────────────────────────────────────────────

/**
 * Marks the calculator as completed and stores the last footprint value.
 * @param {number} footprintKg
 */
export function markCalculatorCompleted(footprintKg) {
  if (!_state) initGamification();
  _state.calculator_completed = true;
  _state.last_footprint_kg = footprintKg;
  _persistState();
}
