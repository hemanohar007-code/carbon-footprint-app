/**
 * tests/app.test.js
 * UI and Functional Tests – AppState, localStorage, and Validation
 *
 * Tests:
 *   1. Validation – calculator form prevents incomplete submissions
 *   2. localStorage – gamification state hydration and persistence
 *   3. Tier transitions – visual canvas tier classification accuracy
 *   4. Leaderboard – user rank computation and ordering
 *   5. Streak – streak increment and break logic
 *   6. Badge deduplication – awardBadges is idempotent
 *   7. Challenge – start, log, and complete lifecycle
 */

import {
  initGamification,
  getGamificationState,
  resetGamification,
  awardBadges,
  checkIn,
  startChallenge,
  completeChallenge,
  computeLeaderboard,
  getUserRank,
  markCalculatorCompleted,
  BADGE_DEFINITIONS,
  CHALLENGES
} from '../gamification.js';

import {
  calculateTotalFootprint,
  getTier,
  evaluateBadges,
  sanitiseNumber
} from '../calculator.js';

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, status: 'pass' });
  } catch (err) {
    results.push({ name, status: 'fail', error: err.message });
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'pass' });
  } catch (err) {
    results.push({ name, status: 'fail', error: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertApprox(actual, expected, tolerance = 0.5, msg = '') {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`${msg} Expected ~${expected}, got ${actual}`);
  }
}

// ─── SETUP ────────────────────────────────────────────────────────────────────
// Use a unique test key to avoid contaminating real app state
const TEST_STORAGE_KEY = 'cfp_gamification_v1';

function setupCleanState() {
  resetGamification();
  initGamification();
}

// ─── VALIDATION TESTS ─────────────────────────────────────────────────────────
test('Validation: calculator with no vehicle type falls back gracefully', () => {
  const result = calculateTotalFootprint({
    transport: { vehicle_type: undefined, daily_km: 10, domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 0, lpg_cylinders_month: 0 },
    shopping: { deliveries_month: 0, fashion_items_year: 0 },
    digital: { streaming_hours_day: 0, cloud_storage_gb: 0 }
  });
  assert(typeof result.total_kg === 'number', 'Expected numeric result');
  assert(!isNaN(result.total_kg), 'Expected non-NaN total');
});

test('Validation: alphabetical km input produces 0 transport emissions', () => {
  const result = calculateTotalFootprint({
    transport: { vehicle_type: 'petrol_car', daily_km: 'twenty', domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 0, lpg_cylinders_month: 0 },
    shopping: { deliveries_month: 0, fashion_items_year: 0 },
    digital: { streaming_hours_day: 0, cloud_storage_gb: 0 }
  });
  assertApprox(result.categories.transport, 0, 0.01, 'Transport from alphabetical km input');
});

test('Validation: negative deliveries sanitised to 0', () => {
  const result = calculateTotalFootprint({
    transport: { vehicle_type: 'bus_metro', daily_km: 0, domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 0, lpg_cylinders_month: 0 },
    shopping: { deliveries_month: -10, fashion_items_year: 0 },
    digital: { streaming_hours_day: 0, cloud_storage_gb: 0 }
  });
  assertApprox(result.categories.shopping, 0, 0.01, 'Shopping from negative deliveries');
});

test('Validation: total is finite for all-zero inputs', () => {
  const result = calculateTotalFootprint({
    transport: { vehicle_type: 'bus_metro', daily_km: 0, domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegan' },
    home: { electricity_kwh_month: 0, lpg_cylinders_month: 0 },
    shopping: { deliveries_month: 0, fashion_items_year: 0 },
    digital: { streaming_hours_day: 0, cloud_storage_gb: 0 }
  });
  assert(isFinite(result.total_kg), 'Expected finite total');
});

// ─── LOCALSTORAGE HYDRATION ────────────────────────────────────────────────────
test('localStorage: initGamification creates fresh state if empty', () => {
  resetGamification();
  const state = initGamification();
  assert(typeof state === 'object', 'Expected object state');
  assert(Array.isArray(state.badges), 'Expected badges array');
  assert(state.streak.current === 0, 'Expected 0 current streak');
  assert(state.streak.longest === 0, 'Expected 0 longest streak');
  assert(state.calculator_completed === false, 'Expected calculator_completed false');
});

test('localStorage: badges persist across initGamification calls', () => {
  setupCleanState();
  awardBadges(['carbon_rookie']);
  const freshState = initGamification();
  assert(freshState.badges.includes('carbon_rookie'), 'Expected carbon_rookie to persist');
});

test('localStorage: markCalculatorCompleted persists footprint', () => {
  setupCleanState();
  markCalculatorCompleted(1850);
  const freshState = initGamification();
  assert(freshState.calculator_completed === true, 'Expected calculator_completed true');
  assertApprox(freshState.last_footprint_kg, 1850, 0.01, 'Expected persisted footprint');
});

test('localStorage: resetGamification clears all state', () => {
  setupCleanState();
  awardBadges(['carbon_rookie', 'plant_powered']);
  markCalculatorCompleted(2000);
  resetGamification();
  const freshState = initGamification();
  assert(freshState.badges.length === 0, 'Expected empty badges after reset');
  assert(freshState.last_footprint_kg === null, 'Expected null footprint after reset');
});

// ─── TIER TRANSITIONS ─────────────────────────────────────────────────────────
test('Tier transition: <1500 kg → green', () => {
  assert(getTier(0) === 'green', '0 kg should be green');
  assert(getTier(800) === 'green', '800 kg should be green');
  assert(getTier(1499) === 'green', '1499 kg should be green');
});

test('Tier transition: 1500–2999 kg → yellow', () => {
  assert(getTier(1500) === 'yellow', '1500 kg should be yellow');
  assert(getTier(2000) === 'yellow', '2000 kg should be yellow');
  assert(getTier(2999) === 'yellow', '2999 kg should be yellow');
});

test('Tier transition: 3000–5999 kg → orange', () => {
  assert(getTier(3000) === 'orange', '3000 kg should be orange');
  assert(getTier(4500) === 'orange', '4500 kg should be orange');
  assert(getTier(5999) === 'orange', '5999 kg should be orange');
});

test('Tier transition: ≥6000 kg → red', () => {
  assert(getTier(6000) === 'red', '6000 kg should be red');
  assert(getTier(10000) === 'red', '10000 kg should be red');
  assert(getTier(20000) === 'red', '20000 kg should be red');
});

test('Tier: footprint result contains valid tier string', () => {
  const result = calculateTotalFootprint({
    transport: { vehicle_type: 'petrol_car', daily_km: 30, domestic_flights: 3, international_flights: 0 },
    food: { diet_type: 'heavy_meat' },
    home: { electricity_kwh_month: 200, lpg_cylinders_month: 1 },
    shopping: { deliveries_month: 10, fashion_items_year: 20 },
    digital: { streaming_hours_day: 4, cloud_storage_gb: 100 }
  });
  const validTiers = ['green', 'yellow', 'orange', 'red'];
  assert(validTiers.includes(result.tier), `Expected valid tier, got: ${result.tier}`);
});

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
test('Leaderboard: returns exactly 11 entries (10 peers + user)', () => {
  const lb = computeLeaderboard(1800);
  assert(lb.length === 11, `Expected 11 entries, got ${lb.length}`);
});

test('Leaderboard: sorted ascending by kg', () => {
  const lb = computeLeaderboard(2000);
  for (let i = 0; i < lb.length - 1; i++) {
    assert(lb[i].kg <= lb[i + 1].kg, `Expected ascending order at index ${i}`);
  }
});

test('Leaderboard: user entry is marked isUser=true', () => {
  const lb = computeLeaderboard(2000);
  const userEntries = lb.filter(e => e.isUser);
  assert(userEntries.length === 1, 'Expected exactly 1 user entry');
});

test('Leaderboard: user with very low kg gets rank 1', () => {
  const rank = getUserRank(100);
  assert(rank === 1, `Expected rank 1 for 100 kg, got ${rank}`);
});

test('Leaderboard: user with very high kg gets rank 11', () => {
  const rank = getUserRank(99999);
  assert(rank === 11, `Expected rank 11 for 99999 kg, got ${rank}`);
});

test('Leaderboard: user footprint of 1800 kg ranks in middle', () => {
  const rank = getUserRank(1800);
  assert(rank >= 3 && rank <= 8, `Expected middle rank for 1800 kg, got ${rank}`);
});

test('Leaderboard: NaN footprint handled gracefully', () => {
  const lb = computeLeaderboard(NaN);
  assert(lb.length === 11, 'Expected 11 entries even for NaN input');
});

// ─── STREAK SYSTEM ────────────────────────────────────────────────────────────
test('Streak: first check-in sets current to 1', () => {
  setupCleanState();
  const result = checkIn();
  assert(!result.alreadyCheckedIn, 'First check-in should not be duplicate');
  assert(result.current === 1, `Expected current streak of 1, got ${result.current}`);
});

test('Streak: same-day check-in returns alreadyCheckedIn=true', () => {
  setupCleanState();
  checkIn(); // first check-in
  const secondResult = checkIn(); // same day
  assert(secondResult.alreadyCheckedIn === true, 'Expected alreadyCheckedIn on same day');
  assert(secondResult.current === 1, 'Streak should stay at 1');
});

test('Streak: longest streak updates when current exceeds it', () => {
  setupCleanState();
  checkIn();
  const state = getGamificationState();
  assert(state.streak.longest >= state.streak.current, 'Longest should be >= current');
});

// ─── BADGE SYSTEM ─────────────────────────────────────────────────────────────
test('Badges: awardBadges is idempotent – no duplicates', () => {
  setupCleanState();
  awardBadges(['carbon_rookie']);
  awardBadges(['carbon_rookie']);
  const state = getGamificationState();
  const count = state.badges.filter(b => b === 'carbon_rookie').length;
  assert(count === 1, `Expected 1 carbon_rookie badge, got ${count}`);
});

test('Badges: awardBadges returns only newly awarded badges', () => {
  setupCleanState();
  awardBadges(['carbon_rookie']);
  const newBadges = awardBadges(['carbon_rookie', 'plant_powered']);
  assert(newBadges.length === 1, `Expected 1 newly awarded badge, got ${newBadges.length}`);
  assert(newBadges[0] === 'plant_powered', 'Expected plant_powered as new badge');
});

test('Badges: unknown badge IDs are silently ignored', () => {
  setupCleanState();
  const newBadges = awardBadges(['unknown_badge_xyz']);
  assert(newBadges.length === 0, 'Expected no badges for unknown ID');
});

test('Badges: all 4 badge definitions exist', () => {
  const expectedBadges = ['carbon_rookie', 'flight_free_champion', 'plant_powered', 'energy_ninja'];
  expectedBadges.forEach(id => {
    assert(BADGE_DEFINITIONS[id], `Expected badge definition for ${id}`);
  });
});

// ─── CHALLENGE LIFECYCLE ──────────────────────────────────────────────────────
test('Challenge: startChallenge activates waste_minimization_7', () => {
  setupCleanState();
  const result = startChallenge('waste_minimization_7');
  assert(result.success, 'Expected successful challenge start');
  const state = getGamificationState();
  assert(state.challenges.waste_minimization_7.active, 'Expected challenge to be active');
});

test('Challenge: cannot start same challenge twice', () => {
  setupCleanState();
  startChallenge('waste_minimization_7');
  const secondAttempt = startChallenge('waste_minimization_7');
  assert(!secondAttempt.success, 'Expected failure on second start');
});

test('Challenge: completeChallenge logs a day', () => {
  setupCleanState();
  startChallenge('waste_minimization_7');
  const result = completeChallenge('waste_minimization_7');
  assert(result.success, 'Expected successful day log');
  const state = getGamificationState();
  assert(state.challenges.waste_minimization_7.completed_days === 1, 'Expected 1 completed day');
});

test('Challenge: challenge completes after duration_days', () => {
  setupCleanState();
  startChallenge('waste_minimization_7');
  const duration = CHALLENGES.waste_minimization_7.duration_days;
  let lastResult;
  for (let i = 0; i < duration; i++) {
    lastResult = completeChallenge('waste_minimization_7');
  }
  assert(lastResult.completed, 'Expected challenge to be completed');
  const state = getGamificationState();
  assert(state.challenges.waste_minimization_7.completed, 'Expected completed flag in state');
  assert(!state.challenges.waste_minimization_7.active, 'Expected active to be false');
});

test('Challenge: cannot log days when challenge not started', () => {
  setupCleanState();
  const result = completeChallenge('commute_swap_30');
  assert(!result.success, 'Expected failure when challenge not active');
});

test('Challenge: startChallenge with unknown ID returns failure', () => {
  setupCleanState();
  const result = startChallenge('nonexistent_challenge');
  assert(!result.success, 'Expected failure for unknown challenge');
});

// ─── EQUIVALENCIES IN RESULTS ─────────────────────────────────────────────────
test('Result: equivalencies present in total footprint result', () => {
  const result = calculateTotalFootprint({
    transport: { vehicle_type: 'petrol_car', daily_km: 20, domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 100, lpg_cylinders_month: 0 },
    shopping: { deliveries_month: 0, fashion_items_year: 0 },
    digital: { streaming_hours_day: 0, cloud_storage_gb: 0 }
  });
  assert(typeof result.equivalencies.delhi_mumbai_drives === 'number', 'Expected numeric drives equiv');
  assert(typeof result.equivalencies.trees_needed === 'number', 'Expected numeric trees equiv');
  assert(typeof result.equivalencies.household_electricity_months === 'number', 'Expected numeric home months equiv');
});

test('Result: roadmap contains at most 5 items', () => {
  const result = calculateTotalFootprint({
    transport: { vehicle_type: 'petrol_car', daily_km: 30, domestic_flights: 4, international_flights: 2 },
    food: { diet_type: 'heavy_meat' },
    home: { electricity_kwh_month: 300, lpg_cylinders_month: 2 },
    shopping: { deliveries_month: 20, fashion_items_year: 30 },
    digital: { streaming_hours_day: 6, cloud_storage_gb: 500 }
  });
  assert(result.reductionRoadmap.length <= 5, `Expected ≤5 roadmap items, got ${result.reductionRoadmap.length}`);
});

test('Result: progress_to_net_zero_pct between 0 and 100', () => {
  const result = calculateTotalFootprint({
    transport: { vehicle_type: 'bus_metro', daily_km: 10, domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 80, lpg_cylinders_month: 0 },
    shopping: { deliveries_month: 2, fashion_items_year: 3 },
    digital: { streaming_hours_day: 1, cloud_storage_gb: 15 }
  });
  const pct = result.progress_to_net_zero_pct;
  assert(pct >= 0 && pct <= 100, `Expected 0–100%, got ${pct}`);
});

// ─── EXPORT ───────────────────────────────────────────────────────────────────
export function getTestResults() {
  return results;
}

export function getSummary() {
  const passed = results.filter(r => r.status === 'pass').length;
  const total = results.length;
  return { passed, failed: total - passed, total };
}
