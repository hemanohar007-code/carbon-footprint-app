/**
 * tests/nudge-engine.test.js
 * Integration Tests – Gemini API Mock & Error Handling
 *
 * Intercepts fetch via a mock and simulates:
 *   - Successful structured JSON payload
 *   - Invalid API key (401)
 *   - Rate limiting (429)
 *   - Network timeout
 *   - Malformed JSON response
 *   - Missing alternatives array
 *
 * All tests run in-browser via test-runner.html (no build pipeline needed).
 */

import {
  setApiKey, getApiKey, clearApiKey, hasApiKey,
  analyseActivity, isNudgeError
} from '../nudge-engine.js';

const results = [];

// ─── TEST FRAMEWORK ───────────────────────────────────────────────────────────
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

function assertApprox(actual, expected, tolerance = 0.01, msg = '') {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`${msg} Expected ~${expected}, got ${actual}`);
  }
}

// ─── FETCH MOCK INFRASTRUCTURE ────────────────────────────────────────────────
const _originalFetch = globalThis.fetch;
let _fetchMock = null;

function mockFetch(implementation) {
  _fetchMock = implementation;
  globalThis.fetch = (...args) => {
    if (_fetchMock) return _fetchMock(...args);
    return _originalFetch(...args);
  };
}

function restoreFetch() {
  globalThis.fetch = _originalFetch;
  _fetchMock = null;
}

function makeGeminiResponse(text) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      candidates: [{
        content: { parts: [{ text }] },
        finishReason: 'STOP'
      }]
    })
  });
}

function makeErrorResponse(status) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ error: { message: 'API error' } })
  });
}

const VALID_GEMINI_PAYLOAD = JSON.stringify({
  estimated_co2: 1.5,
  alternatives: [
    { name: 'Cook at home with lentils', co2_savings: 1.2, rupee_savings: 120 },
    { name: 'Order a paneer dish instead', co2_savings: 0.8, rupee_savings: 50 }
  ],
  emotional_analogy: 'This meal emits as much CO₂ as running an AC for 3 hours in Mumbai.'
});

// ─── API KEY MANAGEMENT TESTS ─────────────────────────────────────────────────
test('API key: setApiKey stores key in sessionStorage', () => {
  setApiKey('test-key-abc');
  assert(getApiKey() === 'test-key-abc', 'Expected key to be stored');
  clearApiKey();
});

test('API key: clearApiKey removes key', () => {
  setApiKey('test-key-xyz');
  clearApiKey();
  assert(getApiKey() === null, 'Expected key to be null after clear');
});

test('API key: hasApiKey returns false when no key', () => {
  clearApiKey();
  assert(!hasApiKey(), 'Expected hasApiKey to be false');
});

test('API key: hasApiKey returns true when key is set', () => {
  setApiKey('my-api-key');
  assert(hasApiKey(), 'Expected hasApiKey to be true');
  clearApiKey();
});

test('API key: setApiKey throws on empty string', () => {
  let threw = false;
  try { setApiKey(''); } catch { threw = true; }
  assert(threw, 'Expected error on empty key');
});

test('API key: setApiKey throws on whitespace-only', () => {
  let threw = false;
  try { setApiKey('   '); } catch { threw = true; }
  assert(threw, 'Expected error on whitespace key');
});

// ─── SUCCESSFUL PARSE TESTS ───────────────────────────────────────────────────
await testAsync('Nudge: successful response parses estimated_co2 correctly', async () => {
  setApiKey('test-key');
  mockFetch(() => makeGeminiResponse(VALID_GEMINI_PAYLOAD));

  const result = await analyseActivity('ordering mutton biryani');
  assertApprox(result.estimated_co2, 1.5, 0.001, 'estimated_co2');
  restoreFetch();
  clearApiKey();
});

await testAsync('Nudge: successful response has exactly 2 alternatives', async () => {
  setApiKey('test-key');
  mockFetch(() => makeGeminiResponse(VALID_GEMINI_PAYLOAD));

  const result = await analyseActivity('booking a flight to Goa');
  assert(result.alternatives.length === 2, 'Expected exactly 2 alternatives');
  restoreFetch();
  clearApiKey();
});

await testAsync('Nudge: alternative names are strings', async () => {
  setApiKey('test-key');
  mockFetch(() => makeGeminiResponse(VALID_GEMINI_PAYLOAD));

  const result = await analyseActivity('buying jeans');
  result.alternatives.forEach(alt => {
    assert(typeof alt.name === 'string', 'Expected alternative name to be a string');
  });
  restoreFetch();
  clearApiKey();
});

await testAsync('Nudge: alternative co2_savings are non-negative numbers', async () => {
  setApiKey('test-key');
  mockFetch(() => makeGeminiResponse(VALID_GEMINI_PAYLOAD));

  const result = await analyseActivity('driving 40 km by car');
  result.alternatives.forEach(alt => {
    assert(typeof alt.co2_savings === 'number', 'Expected co2_savings to be a number');
    assert(alt.co2_savings >= 0, 'Expected co2_savings to be non-negative');
  });
  restoreFetch();
  clearApiKey();
});

await testAsync('Nudge: rupee_savings is non-negative number', async () => {
  setApiKey('test-key');
  mockFetch(() => makeGeminiResponse(VALID_GEMINI_PAYLOAD));

  const result = await analyseActivity('ordering biryani');
  assert(result.alternatives[0].rupee_savings >= 0, 'Expected non-negative rupee_savings');
  restoreFetch();
  clearApiKey();
});

await testAsync('Nudge: emotional_analogy is a non-empty string', async () => {
  setApiKey('test-key');
  mockFetch(() => makeGeminiResponse(VALID_GEMINI_PAYLOAD));

  const result = await analyseActivity('watching 5 hours of Netflix');
  assert(typeof result.emotional_analogy === 'string', 'Expected string analogy');
  assert(result.emotional_analogy.length > 0, 'Expected non-empty analogy');
  restoreFetch();
  clearApiKey();
});

// ─── MARKDOWN CODE FENCE STRIPPING ───────────────────────────────────────────
await testAsync('Nudge: strips markdown code fences from response', async () => {
  const wrappedPayload = '```json\n' + VALID_GEMINI_PAYLOAD + '\n```';
  setApiKey('test-key');
  mockFetch(() => makeGeminiResponse(wrappedPayload));

  const result = await analyseActivity('test activity');
  assertApprox(result.estimated_co2, 1.5, 0.001, 'Should still parse after stripping fences');
  restoreFetch();
  clearApiKey();
});

// ─── ERROR HANDLING TESTS ─────────────────────────────────────────────────────
await testAsync('Nudge: 401 response throws NudgeError UNAUTHORIZED', async () => {
  setApiKey('bad-key');
  mockFetch(() => makeErrorResponse(401));

  let errorCode = null;
  try {
    await analyseActivity('test');
  } catch (err) {
    errorCode = err.code;
    assert(isNudgeError(err), 'Expected NudgeError');
    assert(err.userMessage.length > 0, 'Expected user-facing message');
  }
  assert(errorCode === 'UNAUTHORIZED', `Expected UNAUTHORIZED, got ${errorCode}`);
  restoreFetch();
  clearApiKey();
});

await testAsync('Nudge: 429 response throws NudgeError RATE_LIMITED', async () => {
  setApiKey('test-key');
  mockFetch(() => makeErrorResponse(429));

  let errorCode = null;
  try {
    await analyseActivity('test');
  } catch (err) {
    errorCode = err.code;
    assert(isNudgeError(err), 'Expected NudgeError');
  }
  assert(errorCode === 'RATE_LIMITED', `Expected RATE_LIMITED, got ${errorCode}`);
  restoreFetch();
  clearApiKey();
});

await testAsync('Nudge: 500 response throws NudgeError API_ERROR', async () => {
  setApiKey('test-key');
  mockFetch(() => makeErrorResponse(500));

  let errorCode = null;
  try {
    await analyseActivity('test');
  } catch (err) {
    errorCode = err.code;
  }
  assert(errorCode === 'API_ERROR', `Expected API_ERROR, got ${errorCode}`);
  restoreFetch();
  clearApiKey();
});

await testAsync('Nudge: malformed JSON throws NudgeError PARSE_ERROR', async () => {
  setApiKey('test-key');
  mockFetch(() => makeGeminiResponse('{not valid json {{'));

  let errorCode = null;
  try {
    await analyseActivity('test');
  } catch (err) {
    errorCode = err.code;
    assert(isNudgeError(err), 'Expected NudgeError');
  }
  assert(errorCode === 'PARSE_ERROR', `Expected PARSE_ERROR, got ${errorCode}`);
  restoreFetch();
  clearApiKey();
});

await testAsync('Nudge: missing alternatives array throws PARSE_ERROR', async () => {
  const badPayload = JSON.stringify({
    estimated_co2: 1.5,
    emotional_analogy: 'test'
    // alternatives missing
  });
  setApiKey('test-key');
  mockFetch(() => makeGeminiResponse(badPayload));

  let errorCode = null;
  try {
    await analyseActivity('test');
  } catch (err) {
    errorCode = err.code;
  }
  assert(errorCode === 'PARSE_ERROR', `Expected PARSE_ERROR, got ${errorCode}`);
  restoreFetch();
  clearApiKey();
});

await testAsync('Nudge: no API key throws NudgeError NO_API_KEY', async () => {
  clearApiKey();

  let errorCode = null;
  try {
    await analyseActivity('test activity');
  } catch (err) {
    errorCode = err.code;
    assert(isNudgeError(err), 'Expected NudgeError');
  }
  assert(errorCode === 'NO_API_KEY', `Expected NO_API_KEY, got ${errorCode}`);
});

await testAsync('Nudge: empty activity string throws INVALID_INPUT', async () => {
  setApiKey('test-key');

  let errorCode = null;
  try {
    await analyseActivity('  ');
  } catch (err) {
    errorCode = err.code;
  }
  assert(errorCode === 'INVALID_INPUT', `Expected INVALID_INPUT, got ${errorCode}`);
  clearApiKey();
});

await testAsync('Nudge: network error throws NudgeError NETWORK_ERROR', async () => {
  setApiKey('test-key');
  mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));

  let errorCode = null;
  try {
    await analyseActivity('test activity');
  } catch (err) {
    errorCode = err.code;
    assert(isNudgeError(err), 'Expected NudgeError');
  }
  assert(errorCode === 'NETWORK_ERROR', `Expected NETWORK_ERROR, got ${errorCode}`);
  restoreFetch();
  clearApiKey();
});

// ─── SAFETY BLOCK TEST ────────────────────────────────────────────────────────
await testAsync('Nudge: safety block response throws EMPTY_RESPONSE or SAFETY_BLOCK', async () => {
  setApiKey('test-key');
  mockFetch(() => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      candidates: [{
        finishReason: 'SAFETY',
        content: null
      }]
    })
  }));

  let caught = false;
  try {
    await analyseActivity('test activity');
  } catch (err) {
    caught = true;
    assert(isNudgeError(err), 'Expected NudgeError for safety block');
    assert(
      err.code === 'SAFETY_BLOCK' || err.code === 'EMPTY_RESPONSE',
      `Expected SAFETY_BLOCK or EMPTY_RESPONSE, got ${err.code}`
    );
  }
  assert(caught, 'Expected an error to be thrown for safety block');
  restoreFetch();
  clearApiKey();
});

// ─── isNudgeError TESTS ───────────────────────────────────────────────────────
test('isNudgeError: returns true for NudgeError instances', () => {
  const fakeErr = new Error('test');
  fakeErr.name = 'NudgeError';
  fakeErr.code = 'TEST';
  fakeErr.userMessage = 'test message';
  assert(isNudgeError(fakeErr), 'Expected true for NudgeError');
});

test('isNudgeError: returns false for plain Error', () => {
  const plainErr = new Error('plain error');
  assert(!isNudgeError(plainErr), 'Expected false for plain Error');
});

test('isNudgeError: returns false for null', () => {
  assert(!isNudgeError(null), 'Expected false for null');
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
