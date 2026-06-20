/**
 * calculator.js
 * Deterministic Carbon Emission Math Engine
 * Sources: CEA (Central Electricity Authority), MoEFCC, IEA 2023
 *
 * All functions are pure and side-effect-free.
 * Input validation is handled at the boundary to guard against malformed data.
 */

'use strict';

const DAYS_IN_YEAR = 365;
const MONTHS_IN_YEAR = 12;

// ─── EMISSION FACTORS ────────────────────────────────────────────────────────
export const EMISSION_FACTORS = {
  transport: {
    petrol_car: 0.17,           // kg CO₂ / km
    diesel_car: 0.19,           // kg CO₂ / km
    two_wheeler: 0.045,         // kg CO₂ / km
    electric_vehicle: 0.06,    // kg CO₂ / km (indirect grid)
    bus_metro: 0.015,           // kg CO₂ / km per passenger
    domestic_flight: 0.12,     // kg CO₂ / km per passenger
    international_flight: 0.11 // kg CO₂ / km per passenger
  },
  transport_distances: {
    domestic_flight_avg_km: 1000,
    international_flight_avg_km: 4000
  },
  food: {
    heavy_meat: 2.5,    // kg CO₂ / day
    low_meat: 1.5,      // kg CO₂ / day
    vegetarian: 1.0,    // kg CO₂ / day
    vegan: 0.7          // kg CO₂ / day
  },
  home_energy: {
    electricity: 0.82,           // kg CO₂ / kWh
    lpg_per_cylinder: 42.458     // kg CO₂ / 14.2 kg cylinder (2.99 * 14.2)
  },
  shopping: {
    ecommerce_delivery: 0.35,  // kg CO₂ / delivery
    fast_fashion: 12.5         // kg CO₂ / garment
  },
  digital: {
    streaming: 0.05,    // kg CO₂ / hour
    cloud_storage: 0.001 // kg CO₂ / GB / year
  }
};

// ─── BENCHMARKS ───────────────────────────────────────────────────────────────
export const BENCHMARKS = {
  urban_india_avg: 1750,       // kg CO₂ / year
  global_avg: 4000,            // kg CO₂ / year
  net_zero_target: 1200,       // kg CO₂ / year by 2030
  tiers: {
    green: 1500,
    yellow: 3000,
    orange: 6000
    // red: > 6000
  }
};

// ─── EQUIVALENCIES ────────────────────────────────────────────────────────────
export const EQUIVALENCIES = {
  delhi_mumbai_drive_kg: 240,        // kg CO₂ per one Delhi-Mumbai petrol drive
  tree_year_absorption_kg: 20,       // kg CO₂ absorbed by 1 mature tree per year
  avg_indian_household_monthly_kg: 100 // kg CO₂ per month for average Indian family home
};

// ─── FINANCIAL SAVINGS RATES ──────────────────────────────────────────────────
export const FINANCIAL_RATES = {
  electricity_per_unit_inr: 7.5,  // INR per kWh saved
  fuel_per_km_inr: 10             // INR per km not driven (petrol)
};

// ─── INPUT SANITISER ──────────────────────────────────────────────────────────
/**
 * Parses and sanitises a numeric input value.
 * Returns 0 for negative, NaN, or non-numeric values.
 * @param {*} value
 * @returns {number}
 */
export function sanitiseNumber(value) {
  const num = parseFloat(value);
  if (isNaN(num) || !isFinite(num)) return 0;
  if (num < 0) return 0;
  return num;
}

// ─── TRANSPORT CALCULATIONS ───────────────────────────────────────────────────
/**
 * Calculates annual transport CO₂ from daily commute and flights.
 * @param {object} transport
 * @param {string} transport.vehicle_type - 'petrol_car'|'diesel_car'|'two_wheeler'|'electric_vehicle'|'bus_metro'
 * @param {number} transport.daily_km - km driven per day
 * @param {number} transport.domestic_flights - domestic flights per year
 * @param {number} transport.international_flights - international flights per year
 * @returns {{ annual_kg: number, breakdown: object }}
 */
export function calculateTransport(transport) {
  const vehicleType = transport.vehicle_type || 'bus_metro';
  const dailyKm = sanitiseNumber(transport.daily_km);
  const domesticFlights = sanitiseNumber(transport.domestic_flights);
  const internationalFlights = sanitiseNumber(transport.international_flights);

  const factor = EMISSION_FACTORS.transport[vehicleType] ?? EMISSION_FACTORS.transport.bus_metro;
  const annualCommuteKg = dailyKm * factor * DAYS_IN_YEAR;

  const domesticFlightKg =
    domesticFlights *
    EMISSION_FACTORS.transport.domestic_flight *
    EMISSION_FACTORS.transport_distances.domestic_flight_avg_km;

  const internationalFlightKg =
    internationalFlights *
    EMISSION_FACTORS.transport.international_flight *
    EMISSION_FACTORS.transport_distances.international_flight_avg_km;

  const annual_kg = annualCommuteKg + domesticFlightKg + internationalFlightKg;

  return {
    annual_kg,
    breakdown: {
      commute_kg: annualCommuteKg,
      domestic_flights_kg: domesticFlightKg,
      international_flights_kg: internationalFlightKg
    }
  };
}

// ─── FOOD CALCULATIONS ────────────────────────────────────────────────────────
/**
 * Calculates annual food CO₂ based on diet type.
 * @param {object} food
 * @param {string} food.diet_type - 'heavy_meat'|'low_meat'|'vegetarian'|'vegan'
 * @returns {{ annual_kg: number, daily_kg: number }}
 */
export function calculateFood(food) {
  const dietType = food.diet_type || 'vegetarian';
  const dailyKg = EMISSION_FACTORS.food[dietType] ?? EMISSION_FACTORS.food.vegetarian;
  const annual_kg = dailyKg * DAYS_IN_YEAR;

  return {
    annual_kg,
    daily_kg: dailyKg
  };
}

// ─── HOME ENERGY CALCULATIONS ─────────────────────────────────────────────────
/**
 * Calculates annual home energy CO₂.
 * @param {object} home
 * @param {number} home.electricity_kwh_month - monthly electricity consumption in kWh
 * @param {number} home.lpg_cylinders_month - LPG cylinders used per month
 * @returns {{ annual_kg: number, breakdown: object }}
 */
export function calculateHomeEnergy(home) {
  const monthlyKwh = sanitiseNumber(home.electricity_kwh_month);
  const monthlyCylinders = sanitiseNumber(home.lpg_cylinders_month);

  const annualElectricityKg = monthlyKwh * MONTHS_IN_YEAR * EMISSION_FACTORS.home_energy.electricity;
  const annualLpgKg = monthlyCylinders * MONTHS_IN_YEAR * EMISSION_FACTORS.home_energy.lpg_per_cylinder;

  const annual_kg = annualElectricityKg + annualLpgKg;

  return {
    annual_kg,
    breakdown: {
      electricity_kg: annualElectricityKg,
      lpg_kg: annualLpgKg
    }
  };
}

// ─── SHOPPING CALCULATIONS ────────────────────────────────────────────────────
/**
 * Calculates annual shopping CO₂.
 * @param {object} shopping
 * @param {number} shopping.deliveries_month - e-commerce deliveries per month
 * @param {number} shopping.fashion_items_year - fast-fashion garments per year
 * @returns {{ annual_kg: number, breakdown: object }}
 */
export function calculateShopping(shopping) {
  const monthlyDeliveries = sanitiseNumber(shopping.deliveries_month);
  const yearlyFashion = sanitiseNumber(shopping.fashion_items_year);

  const deliveryKg = monthlyDeliveries * MONTHS_IN_YEAR * EMISSION_FACTORS.shopping.ecommerce_delivery;
  const fashionKg = yearlyFashion * EMISSION_FACTORS.shopping.fast_fashion;

  const annual_kg = deliveryKg + fashionKg;

  return {
    annual_kg,
    breakdown: {
      deliveries_kg: deliveryKg,
      fashion_kg: fashionKg
    }
  };
}

// ─── DIGITAL CALCULATIONS ─────────────────────────────────────────────────────
/**
 * Calculates annual digital CO₂.
 * @param {object} digital
 * @param {number} digital.streaming_hours_day - daily video streaming hours
 * @param {number} digital.cloud_storage_gb - cloud storage in GB
 * @returns {{ annual_kg: number, breakdown: object }}
 */
export function calculateDigital(digital) {
  const dailyStreamingHours = sanitiseNumber(digital.streaming_hours_day);
  const cloudStorageGb = sanitiseNumber(digital.cloud_storage_gb);

  const streamingKg = dailyStreamingHours * DAYS_IN_YEAR * EMISSION_FACTORS.digital.streaming;
  const cloudKg = cloudStorageGb * EMISSION_FACTORS.digital.cloud_storage;

  const annual_kg = streamingKg + cloudKg;

  return {
    annual_kg,
    breakdown: {
      streaming_kg: streamingKg,
      cloud_storage_kg: cloudKg
    }
  };
}

// ─── TOTAL FOOTPRINT ──────────────────────────────────────────────────────────
/**
 * Aggregates all category results into a total footprint object.
 * @param {object} inputs - All five category input objects
 * @returns {object} Full footprint result with totals, breakdowns, tier, and equivalencies
 */
export function calculateTotalFootprint(inputs) {
  const transportResult = calculateTransport(inputs.transport || {});
  const foodResult = calculateFood(inputs.food || {});
  const homeResult = calculateHomeEnergy(inputs.home || {});
  const shoppingResult = calculateShopping(inputs.shopping || {});
  const digitalResult = calculateDigital(inputs.digital || {});

  const total_kg = (
    transportResult.annual_kg +
    foodResult.annual_kg +
    homeResult.annual_kg +
    shoppingResult.annual_kg +
    digitalResult.annual_kg
  );

  const categories = {
    transport: transportResult.annual_kg,
    food: foodResult.annual_kg,
    home: homeResult.annual_kg,
    shopping: shoppingResult.annual_kg,
    digital: digitalResult.annual_kg
  };

  const tier = getTier(total_kg);
  const equivalencies = calculateEquivalencies(total_kg);
  const reductionRoadmap = generateReductionRoadmap(categories, inputs);

  return {
    total_kg,
    categories,
    breakdown: {
      transport: transportResult.breakdown,
      food: { diet_type: inputs.food?.diet_type },
      home: homeResult.breakdown,
      shopping: shoppingResult.breakdown,
      digital: digitalResult.breakdown
    },
    tier,
    equivalencies,
    reductionRoadmap,
    vs_india_avg: total_kg - BENCHMARKS.urban_india_avg,
    vs_net_zero: total_kg - BENCHMARKS.net_zero_target,
    progress_to_net_zero_pct: Math.min(100, Math.max(0,
      ((BENCHMARKS.urban_india_avg - total_kg) / (BENCHMARKS.urban_india_avg - BENCHMARKS.net_zero_target)) * 100
    ))
  };
}

// ─── TIER CLASSIFICATION ──────────────────────────────────────────────────────
/**
 * Returns tier classification based on annual kg CO₂.
 * @param {number} totalKg
 * @returns {'green'|'yellow'|'orange'|'red'}
 */
export function getTier(totalKg) {
  if (totalKg < BENCHMARKS.tiers.green) return 'green';
  if (totalKg < BENCHMARKS.tiers.yellow) return 'yellow';
  if (totalKg < BENCHMARKS.tiers.orange) return 'orange';
  return 'red';
}

// ─── EQUIVALENCIES ────────────────────────────────────────────────────────────
/**
 * Converts annual footprint to human-relatable equivalencies.
 * @param {number} annualKg
 * @returns {object}
 */
export function calculateEquivalencies(annualKg) {
  return {
    delhi_mumbai_drives: +(annualKg / EQUIVALENCIES.delhi_mumbai_drive_kg).toFixed(1),
    trees_needed: Math.ceil(annualKg / EQUIVALENCIES.tree_year_absorption_kg),
    household_electricity_months: +(annualKg / EQUIVALENCIES.avg_indian_household_monthly_kg).toFixed(1)
  };
}

// ─── REDUCTION ROADMAP HELPERS ────────────────────────────────────────────────

function getTransportActions(categories, inputs) {
  const actions = [];
  if (categories.transport > 200) {
    const vehicleType = inputs.transport?.vehicle_type;
    if (vehicleType === 'petrol_car' || vehicleType === 'diesel_car') {
      const dailyKm = sanitiseNumber(inputs.transport?.daily_km);
      const annualKmSaved = dailyKm * 0.5 * DAYS_IN_YEAR;
      const co2Saved = annualKmSaved * (EMISSION_FACTORS.transport[vehicleType] - EMISSION_FACTORS.transport.bus_metro);
      actions.push({
        category: 'transport',
        action: 'Switch 50% of commute to Metro/Bus',
        co2_saved_kg: Math.round(co2Saved),
        inr_savings: Math.round(annualKmSaved * FINANCIAL_RATES.fuel_per_km_inr),
        priority: categories.transport
      });
    }
    if ((inputs.transport?.domestic_flights || 0) > 0) {
      const flightsSaved = Math.ceil(sanitiseNumber(inputs.transport?.domestic_flights) / 2);
      const co2Saved = flightsSaved * EMISSION_FACTORS.transport.domestic_flight * EMISSION_FACTORS.transport_distances.domestic_flight_avg_km;
      actions.push({
        category: 'transport',
        action: `Skip ${flightsSaved} domestic flight(s) and take train`,
        co2_saved_kg: Math.round(co2Saved),
        inr_savings: Math.round(flightsSaved * 4500),
        priority: co2Saved
      });
    }
  }
  return actions;
}

function getFoodActions(categories, inputs) {
  const actions = [];
  if (inputs.food?.diet_type === 'heavy_meat') {
    const saved = (EMISSION_FACTORS.food.heavy_meat - EMISSION_FACTORS.food.low_meat) * DAYS_IN_YEAR;
    actions.push({
      category: 'food',
      action: 'Shift to Low-Meat diet (reduce red meat to 2x/week)',
      co2_saved_kg: Math.round(saved),
      inr_savings: Math.round(saved * 8),
      priority: categories.food
    });
  } else if (inputs.food?.diet_type === 'low_meat') {
    const saved = (EMISSION_FACTORS.food.low_meat - EMISSION_FACTORS.food.vegetarian) * DAYS_IN_YEAR;
    actions.push({
      category: 'food',
      action: 'Go Vegetarian 5 days a week',
      co2_saved_kg: Math.round(saved),
      inr_savings: Math.round(saved * 8),
      priority: categories.food
    });
  }
  return actions;
}

function getHomeActions(categories, inputs) {
  const actions = [];
  if (sanitiseNumber(inputs.home?.electricity_kwh_month) > 100) {
    const monthlyKwh = sanitiseNumber(inputs.home?.electricity_kwh_month);
    const savedKwh = monthlyKwh * 0.2 * MONTHS_IN_YEAR;
    const co2Saved = savedKwh * EMISSION_FACTORS.home_energy.electricity;
    actions.push({
      category: 'home',
      action: 'Reduce electricity by 20% with LED upgrades & smart strips',
      co2_saved_kg: Math.round(co2Saved),
      inr_savings: Math.round(savedKwh * FINANCIAL_RATES.electricity_per_unit_inr),
      priority: categories.home
    });
  }
  return actions;
}

function getShoppingActions(categories, inputs) {
  const actions = [];
  if (sanitiseNumber(inputs.shopping?.fashion_items_year) > 5) {
    const items = sanitiseNumber(inputs.shopping?.fashion_items_year);
    const halfItems = Math.floor(items / 2);
    const co2Saved = halfItems * EMISSION_FACTORS.shopping.fast_fashion;
    actions.push({
      category: 'shopping',
      action: `Cut fast-fashion purchases by half (skip ~${halfItems} items)`,
      co2_saved_kg: Math.round(co2Saved),
      inr_savings: Math.round(halfItems * 800),
      priority: categories.shopping
    });
  }
  return actions;
}

function getDigitalActions(categories, inputs) {
  const actions = [];
  if (sanitiseNumber(inputs.digital?.streaming_hours_day) > 2) {
    const hoursDay = sanitiseNumber(inputs.digital?.streaming_hours_day);
    const savedHours = hoursDay * 0.5 * DAYS_IN_YEAR;
    const co2Saved = savedHours * EMISSION_FACTORS.digital.streaming;
    actions.push({
      category: 'digital',
      action: 'Reduce daily streaming by 50% (or switch to audio)',
      co2_saved_kg: Math.round(co2Saved),
      inr_savings: Math.round(co2Saved * 5),
      priority: categories.digital
    });
  }
  return actions;
}

// ─── REDUCTION ROADMAP ────────────────────────────────────────────────────────
/**
 * Generates top 5 prioritised action roadmap based on the user's footprint profile.
 * @param {object} categories - { transport, food, home, shopping, digital } in kg/yr
 * @param {object} inputs - original user inputs
 * @returns {Array<object>} sorted action items
 */
export function generateReductionRoadmap(categories, inputs) {
  const actions = [
    ...getTransportActions(categories, inputs),
    ...getFoodActions(categories, inputs),
    ...getHomeActions(categories, inputs),
    ...getShoppingActions(categories, inputs),
    ...getDigitalActions(categories, inputs),
    {
      category: 'offset',
      action: 'Plant 5 native trees through a verified NGO',
      co2_saved_kg: 5 * EQUIVALENCIES.tree_year_absorption_kg,
      inr_savings: 0,
      priority: 1
    }
  ];

  return actions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
}

// ─── BADGE EVALUATION ─────────────────────────────────────────────────────────
/**
 * Evaluates which badges the user has earned.
 * @param {object} inputs - full calculator inputs
 * @param {boolean} calculatorCompleted - whether the calculator was submitted
 * @returns {string[]} array of earned badge IDs
 */
export function evaluateBadges(inputs, calculatorCompleted = true) {
  const badges = [];

  if (calculatorCompleted) {
    badges.push('carbon_rookie');
  }

  const domesticFlights = sanitiseNumber(inputs.transport?.domestic_flights);
  const intlFlights = sanitiseNumber(inputs.transport?.international_flights);
  if (domesticFlights === 0 && intlFlights === 0) {
    badges.push('flight_free_champion');
  }

  const dietType = inputs.food?.diet_type;
  if (dietType === 'vegan' || dietType === 'vegetarian') {
    badges.push('plant_powered');
  }

  const monthlyKwh = sanitiseNumber(inputs.home?.electricity_kwh_month);
  if (monthlyKwh > 0 && monthlyKwh < 100) {
    badges.push('energy_ninja');
  }

  return badges;
}
