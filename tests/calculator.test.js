/**
 * tests/calculator.test.js
 * Unit Test Suite – Deterministic Carbon Math Assertions
 *
 * Tests all five emission categories, edge cases, known-value assertions,
 * and boundary conditions. Designed to run in browser via test-runner.html.
 */

import {
  calculateTransport,
  calculateFood,
  calculateHomeEnergy,
  calculateShopping,
  calculateDigital,
  calculateTotalFootprint,
  getTier,
  calculateEquivalencies,
  generateReductionRoadmap,
  evaluateBadges,
  sanitiseNumber,
  EMISSION_FACTORS,
  BENCHMARKS
} from '../calculator.js';

// ─── TEST FRAMEWORK ───────────────────────────────────────────────────────────
const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, status: 'pass' });
  } catch (err) {
    results.push({ name, status: 'fail', error: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertApprox(actual, expected, tolerance = 0.01, msg = '') {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `${msg} Expected ~${expected}, got ${actual} (diff: ${diff.toFixed(4)})`
    );
  }
}

// ─── SANITISE NUMBER ─────────────────────────────────────────────────────────
test('sanitiseNumber: returns 0 for NaN', () => {
  assert(sanitiseNumber('abc') === 0, 'Expected 0 for "abc"');
});

test('sanitiseNumber: returns 0 for negative values', () => {
  assert(sanitiseNumber(-50) === 0, 'Expected 0 for -50');
});

test('sanitiseNumber: parses valid numeric strings', () => {
  assert(sanitiseNumber('42.5') === 42.5, 'Expected 42.5');
});

test('sanitiseNumber: returns 0 for empty string', () => {
  assert(sanitiseNumber('') === 0, 'Expected 0 for empty string');
});

test('sanitiseNumber: handles zero correctly', () => {
  assert(sanitiseNumber(0) === 0, 'Expected 0 for 0 input');
});

// ─── HOME ENERGY: KNOWN VALUE ─────────────────────────────────────────────────
test('Electricity: 100 kWh/month → 984 kg CO₂/yr', () => {
  const result = calculateHomeEnergy({ electricity_kwh_month: 100, lpg_cylinders_month: 0 });
  // 100 * 12 * 0.82 = 984
  assertApprox(result.annual_kg, 984, 0.01, 'Electricity 100 kWh/month');
  assertApprox(result.breakdown.electricity_kg, 984, 0.01, 'Electricity breakdown');
});

test('Electricity: 0 kWh → 0 kg CO₂', () => {
  const result = calculateHomeEnergy({ electricity_kwh_month: 0, lpg_cylinders_month: 0 });
  assert(result.annual_kg === 0, 'Expected 0 CO2 for 0 electricity');
});

test('LPG: 1 cylinder/month → ~509.5 kg CO₂/yr', () => {
  const result = calculateHomeEnergy({ electricity_kwh_month: 0, lpg_cylinders_month: 1 });
  // 1 * 12 * 42.458 = 509.496
  assertApprox(result.annual_kg, 509.496, 0.1, 'LPG 1 cyl/month');
});

test('Home: combined electricity + LPG', () => {
  const result = calculateHomeEnergy({ electricity_kwh_month: 100, lpg_cylinders_month: 1 });
  assertApprox(result.annual_kg, 984 + 509.496, 0.1, 'Combined electricity + LPG');
});

// ─── TRANSPORT ────────────────────────────────────────────────────────────────
test('Transport: petrol car 20 km/day', () => {
  const result = calculateTransport({
    vehicle_type: 'petrol_car',
    daily_km: 20,
    domestic_flights: 0,
    international_flights: 0
  });
  // 20 * 0.17 * 365 = 1241
  assertApprox(result.annual_kg, 1241, 0.1, 'Petrol car 20 km/day');
});

test('Transport: diesel car 10 km/day', () => {
  const result = calculateTransport({
    vehicle_type: 'diesel_car',
    daily_km: 10,
    domestic_flights: 0,
    international_flights: 0
  });
  // 10 * 0.19 * 365 = 693.5
  assertApprox(result.annual_kg, 693.5, 0.1, 'Diesel car 10 km/day');
});

test('Transport: two_wheeler 15 km/day', () => {
  const result = calculateTransport({
    vehicle_type: 'two_wheeler',
    daily_km: 15,
    domestic_flights: 0,
    international_flights: 0
  });
  // 15 * 0.045 * 365 = 246.375
  assertApprox(result.annual_kg, 246.375, 0.01, 'Two-wheeler 15 km/day');
});

test('Transport: bus/metro 30 km/day', () => {
  const result = calculateTransport({
    vehicle_type: 'bus_metro',
    daily_km: 30,
    domestic_flights: 0,
    international_flights: 0
  });
  // 30 * 0.015 * 365 = 164.25
  assertApprox(result.annual_kg, 164.25, 0.01, 'Bus/Metro 30 km/day');
});

test('Transport: EV 20 km/day', () => {
  const result = calculateTransport({
    vehicle_type: 'electric_vehicle',
    daily_km: 20,
    domestic_flights: 0,
    international_flights: 0
  });
  // 20 * 0.06 * 365 = 438
  assertApprox(result.annual_kg, 438, 0.01, 'EV 20 km/day');
});

test('Transport: 2 domestic flights → 240 kg CO₂', () => {
  const result = calculateTransport({
    vehicle_type: 'bus_metro',
    daily_km: 0,
    domestic_flights: 2,
    international_flights: 0
  });
  // 2 * 0.12 * 1000 = 240
  assertApprox(result.annual_kg, 240, 0.01, '2 domestic flights');
  assertApprox(result.breakdown.domestic_flights_kg, 240, 0.01);
});

test('Transport: 1 international flight → 440 kg CO₂', () => {
  const result = calculateTransport({
    vehicle_type: 'bus_metro',
    daily_km: 0,
    domestic_flights: 0,
    international_flights: 1
  });
  // 1 * 0.11 * 4000 = 440
  assertApprox(result.annual_kg, 440, 0.01, '1 international flight');
  assertApprox(result.breakdown.international_flights_kg, 440, 0.01);
});

test('Transport: zero inputs → 0 kg', () => {
  const result = calculateTransport({
    vehicle_type: 'bus_metro',
    daily_km: 0,
    domestic_flights: 0,
    international_flights: 0
  });
  assert(result.annual_kg === 0, 'Expected 0 kg for zero transport');
});

// ─── FOOD ─────────────────────────────────────────────────────────────────────
test('Food: heavy_meat → 912.5 kg CO₂/yr', () => {
  const result = calculateFood({ diet_type: 'heavy_meat' });
  assertApprox(result.annual_kg, 2.5 * 365, 0.1, 'Heavy meat diet');
});

test('Food: low_meat → 547.5 kg CO₂/yr', () => {
  const result = calculateFood({ diet_type: 'low_meat' });
  assertApprox(result.annual_kg, 1.5 * 365, 0.1, 'Low meat diet');
});

test('Food: vegetarian → 365 kg CO₂/yr', () => {
  const result = calculateFood({ diet_type: 'vegetarian' });
  assertApprox(result.annual_kg, 365, 0.01, 'Vegetarian diet');
});

test('Food: vegan → 255.5 kg CO₂/yr', () => {
  const result = calculateFood({ diet_type: 'vegan' });
  assertApprox(result.annual_kg, 0.7 * 365, 0.1, 'Vegan diet');
});

test('Food: unknown diet falls back to vegetarian', () => {
  const result = calculateFood({ diet_type: 'invalid_type' });
  assertApprox(result.annual_kg, 365, 0.01, 'Unknown diet fallback');
});

// ─── SHOPPING ─────────────────────────────────────────────────────────────────
test('Shopping: 10 deliveries/month → 42 kg CO₂/yr', () => {
  const result = calculateShopping({ deliveries_month: 10, fashion_items_year: 0 });
  // 10 * 12 * 0.35 = 42
  assertApprox(result.annual_kg, 42, 0.01, '10 deliveries/month');
});

test('Shopping: 12 fashion items/year → 150 kg CO₂/yr', () => {
  const result = calculateShopping({ deliveries_month: 0, fashion_items_year: 12 });
  // 12 * 12.5 = 150
  assertApprox(result.annual_kg, 150, 0.01, '12 fashion items');
});

test('Shopping: combined deliveries + fashion', () => {
  const result = calculateShopping({ deliveries_month: 5, fashion_items_year: 4 });
  // (5*12*0.35) + (4*12.5) = 21 + 50 = 71
  assertApprox(result.annual_kg, 71, 0.01, 'Combined shopping');
});

test('Shopping: zero inputs → 0 kg', () => {
  const result = calculateShopping({ deliveries_month: 0, fashion_items_year: 0 });
  assert(result.annual_kg === 0, 'Expected 0 for zero shopping');
});

// ─── DIGITAL ─────────────────────────────────────────────────────────────────
test('Digital: 2 hours streaming/day → 36.5 kg CO₂/yr', () => {
  const result = calculateDigital({ streaming_hours_day: 2, cloud_storage_gb: 0 });
  // 2 * 365 * 0.05 = 36.5
  assertApprox(result.annual_kg, 36.5, 0.01, '2 hours streaming/day');
});

test('Digital: 100 GB cloud storage → 0.1 kg CO₂/yr', () => {
  const result = calculateDigital({ streaming_hours_day: 0, cloud_storage_gb: 100 });
  // 100 * 0.001 = 0.1
  assertApprox(result.annual_kg, 0.1, 0.001, '100 GB cloud storage');
});

test('Digital: zero inputs → 0 kg', () => {
  const result = calculateDigital({ streaming_hours_day: 0, cloud_storage_gb: 0 });
  assert(result.annual_kg === 0, 'Expected 0 for zero digital');
});

// ─── TOTAL FOOTPRINT ──────────────────────────────────────────────────────────
test('Total: known inputs produce verifiable sum', () => {
  const inputs = {
    transport: { vehicle_type: 'petrol_car', daily_km: 20, domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 100, lpg_cylinders_month: 0 },
    shopping: { deliveries_month: 0, fashion_items_year: 0 },
    digital: { streaming_hours_day: 0, cloud_storage_gb: 0 }
  };
  const result = calculateTotalFootprint(inputs);
  // transport: 1241, food: 365, home: 984, shopping: 0, digital: 0 = 2590
  assertApprox(result.total_kg, 2590, 1, 'Known input total');
});

test('Total: empty inputs → food-only result (default vegetarian)', () => {
  const result = calculateTotalFootprint({
    transport: {},
    food: {},
    home: {},
    shopping: {},
    digital: {}
  });
  // Only food with default vegetarian = 365 kg
  assertApprox(result.total_kg, 365, 1, 'Empty inputs total');
});

test('Total: all zero inputs produces only food baseline', () => {
  const result = calculateTotalFootprint({
    transport: { vehicle_type: 'bus_metro', daily_km: 0, domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegan' },
    home: { electricity_kwh_month: 0, lpg_cylinders_month: 0 },
    shopping: { deliveries_month: 0, fashion_items_year: 0 },
    digital: { streaming_hours_day: 0, cloud_storage_gb: 0 }
  });
  assertApprox(result.total_kg, 0.7 * 365, 0.1, 'Vegan zero other inputs');
});

// ─── TIER CLASSIFICATION ──────────────────────────────────────────────────────
test('Tier: 0 kg → green', () => {
  assert(getTier(0) === 'green', 'Expected green for 0');
});

test('Tier: 1499 kg → green', () => {
  assert(getTier(1499) === 'green', 'Expected green for 1499');
});

test('Tier: 1500 kg → yellow', () => {
  assert(getTier(1500) === 'yellow', 'Expected yellow for 1500');
});

test('Tier: 2999 kg → yellow', () => {
  assert(getTier(2999) === 'yellow', 'Expected yellow for 2999');
});

test('Tier: 3000 kg → orange', () => {
  assert(getTier(3000) === 'orange', 'Expected orange for 3000');
});

test('Tier: 6000 kg → red', () => {
  assert(getTier(6000) === 'red', 'Expected red for 6000');
});

test('Tier: 10000 kg → red', () => {
  assert(getTier(10000) === 'red', 'Expected red for extreme value');
});

// ─── EQUIVALENCIES ───────────────────────────────────────────────────────────
test('Equivalencies: 2400 kg → 10 Delhi-Mumbai drives', () => {
  const eq = calculateEquivalencies(2400);
  assertApprox(eq.delhi_mumbai_drives, 10, 0.1, 'Delhi-Mumbai drives');
});

test('Equivalencies: 1000 kg → 50 trees needed', () => {
  const eq = calculateEquivalencies(1000);
  assert(eq.trees_needed === 50, 'Expected 50 trees for 1000 kg');
});

test('Equivalencies: 500 kg → 5 household months', () => {
  const eq = calculateEquivalencies(500);
  assertApprox(eq.household_electricity_months, 5, 0.1, 'Household electricity months');
});

// ─── EDGE CASES ───────────────────────────────────────────────────────────────
test('Edge: extremely large electricity input does not crash', () => {
  const result = calculateHomeEnergy({ electricity_kwh_month: 99999, lpg_cylinders_month: 0 });
  assert(isFinite(result.annual_kg), 'Expected finite result for very large input');
  assert(result.annual_kg > 0, 'Expected positive result');
});

test('Edge: alphabetical input sanitised to 0', () => {
  const result = calculateHomeEnergy({ electricity_kwh_month: 'hello', lpg_cylinders_month: 0 });
  assert(result.annual_kg === 0, 'Expected 0 for alphabetical input');
});

test('Edge: negative daily km sanitised to 0', () => {
  const result = calculateTransport({
    vehicle_type: 'petrol_car',
    daily_km: -50,
    domestic_flights: 0,
    international_flights: 0
  });
  assert(result.annual_kg === 0, 'Expected 0 for negative daily km');
});

test('Edge: negative flights sanitised to 0', () => {
  const result = calculateTransport({
    vehicle_type: 'bus_metro',
    daily_km: 0,
    domestic_flights: -5,
    international_flights: -3
  });
  assert(result.annual_kg === 0, 'Expected 0 for negative flights');
});

test('Edge: null inputs handled gracefully', () => {
  const result = calculateTotalFootprint({});
  assert(typeof result.total_kg === 'number', 'Expected numeric total_kg');
  assert(!isNaN(result.total_kg), 'Expected non-NaN total_kg');
});

// ─── BADGE EVALUATION ─────────────────────────────────────────────────────────
test('Badge: carbon_rookie awarded on completion', () => {
  const badges = evaluateBadges(
    { transport: { domestic_flights: 0, international_flights: 0 }, food: { diet_type: 'vegetarian' }, home: { electricity_kwh_month: 50 } },
    true
  );
  assert(badges.includes('carbon_rookie'), 'Expected carbon_rookie');
});

test('Badge: flight_free_champion when no flights', () => {
  const badges = evaluateBadges({
    transport: { domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 50 }
  });
  assert(badges.includes('flight_free_champion'), 'Expected flight_free_champion');
});

test('Badge: flight_free_champion NOT awarded with flights', () => {
  const badges = evaluateBadges({
    transport: { domestic_flights: 2, international_flights: 0 },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 50 }
  });
  assert(!badges.includes('flight_free_champion'), 'Expected no flight_free_champion with flights');
});

test('Badge: plant_powered for vegan', () => {
  const badges = evaluateBadges({
    transport: { domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegan' },
    home: { electricity_kwh_month: 50 }
  });
  assert(badges.includes('plant_powered'), 'Expected plant_powered for vegan');
});

test('Badge: plant_powered for vegetarian', () => {
  const badges = evaluateBadges({
    transport: { domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 50 }
  });
  assert(badges.includes('plant_powered'), 'Expected plant_powered for vegetarian');
});

test('Badge: plant_powered NOT for heavy_meat', () => {
  const badges = evaluateBadges({
    transport: { domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'heavy_meat' },
    home: { electricity_kwh_month: 50 }
  });
  assert(!badges.includes('plant_powered'), 'Expected no plant_powered for heavy meat');
});

test('Badge: energy_ninja for <100 kWh/month', () => {
  const badges = evaluateBadges({
    transport: { domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 80 }
  });
  assert(badges.includes('energy_ninja'), 'Expected energy_ninja for 80 kWh');
});

test('Badge: energy_ninja NOT for >=100 kWh/month', () => {
  const badges = evaluateBadges({
    transport: { domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 100 }
  });
  assert(!badges.includes('energy_ninja'), 'Expected no energy_ninja for 100 kWh');
});

test('Badge: energy_ninja NOT for 0 kWh (no electricity usage)', () => {
  const badges = evaluateBadges({
    transport: { domestic_flights: 0, international_flights: 0 },
    food: { diet_type: 'vegetarian' },
    home: { electricity_kwh_month: 0 }
  });
  assert(!badges.includes('energy_ninja'), 'Expected no energy_ninja for 0 kWh');
});

// ─── EXPORT RESULTS ───────────────────────────────────────────────────────────
export function getTestResults() {
  return results;
}

export function getSummary() {
  const passed = results.filter(r => r.status === 'pass').length;
  const total = results.length;
  return { passed, failed: total - passed, total };
}
