/**
 * nudge-engine.js
 * Ephemeral Gemini API Integration – Real-Time Contextual Nudge Engine
 *
 * Connects to the Gemini API to analyse planned user activities
 * and return structured CO₂ impact data with alternatives.
 *
 * SECURITY:
 * - API key is stored in sessionStorage only (ephemeral)
 * - Never written to source code or localStorage
 * - All DOM updates use textContent / createElement (no innerHTML)
 *
 * API key lifecycle:
 *   setApiKey(key)   – stores key in session memory
 *   getApiKey()      – retrieves key from session memory
 *   clearApiKey()    – removes key from session memory
 *
 * Core function:
 *   analyseActivity(activityText) → Promise<NudgeResult>
 */

'use strict';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SESSION_KEY = '_cfp_gemini_key';

// ─── API KEY MANAGEMENT ───────────────────────────────────────────────────────

/**
 * Stores the Gemini API key in sessionStorage (ephemeral – cleared on tab close).
 * @param {string} key
 */
export function setApiKey(key) {
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('Invalid API key: must be a non-empty string.');
  }
  sessionStorage.setItem(SESSION_KEY, key.trim());
}

/**
 * Retrieves the API key from sessionStorage.
 * @returns {string|null}
 */
export function getApiKey() {
  return sessionStorage.getItem(SESSION_KEY);
}

/**
 * Removes the API key from sessionStorage.
 */
export function clearApiKey() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Checks whether a valid API key is currently stored.
 * @returns {boolean}
 */
export function hasApiKey() {
  const key = getApiKey();
  return key !== null && key.length > 0;
}

// ─── PROMPT BUILDER ───────────────────────────────────────────────────────────

function buildPrompt(activityText) {
  return `You are a carbon footprint analyst for urban Indian users aged 18-35.
A user is planning to do: "${activityText}"

Respond ONLY with a JSON object (no markdown, no code fences, no explanation) in this exact format:
{
  "estimated_co2": <number in kg CO2>,
  "alternatives": [
    {
      "name": "<alternative action description>",
      "co2_savings": <number in kg CO2 saved vs original>,
      "rupee_savings": <number in INR saved>
    },
    {
      "name": "<alternative action description>",
      "co2_savings": <number in kg CO2 saved vs original>,
      "rupee_savings": <number in INR saved>
    }
  ],
  "emotional_analogy": "<one striking sentence comparing the footprint to something relatable for an urban Indian – e.g., equivalent to X chai cups worth of CO2, or driving from Delhi to Jaipur Y times>"
}

Rules:
- Always return exactly 2 alternatives.
- estimated_co2 must be a positive number.
- co2_savings must be positive (savings compared to original activity).
- rupee_savings is financial saving in INR (0 if no financial saving).
- emotional_analogy must be brief, vivid, and culturally calibrated for urban India.
- If the activity has negligible CO2, set estimated_co2 to 0.01.`;
}

// ─── RESPONSE PARSER ─────────────────────────────────────────────────────────

/**
 * Parses and validates the Gemini API response into a NudgeResult.
 * @param {string} rawText
 * @returns {NudgeResult}
 * @throws {Error} if parsing fails or structure is invalid
 */
function parseGeminiResponse(rawText) {
  // Strip markdown code fences if present
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new Error('PARSE_ERROR: Gemini response was not valid JSON.');
  }

  // Validate structure
  if (typeof data.estimated_co2 !== 'number' || isNaN(data.estimated_co2)) {
    throw new Error('INVALID_STRUCTURE: estimated_co2 must be a number.');
  }
  if (!Array.isArray(data.alternatives) || data.alternatives.length < 2) {
    throw new Error('INVALID_STRUCTURE: alternatives must be an array of at least 2 items.');
  }
  for (const alt of data.alternatives.slice(0, 2)) {
    if (typeof alt.name !== 'string' ||
        typeof alt.co2_savings !== 'number' ||
        typeof alt.rupee_savings !== 'number') {
      throw new Error('INVALID_STRUCTURE: alternatives items have incorrect types.');
    }
  }
  if (typeof data.emotional_analogy !== 'string') {
    throw new Error('INVALID_STRUCTURE: emotional_analogy must be a string.');
  }

  return {
    estimated_co2: Math.max(0, data.estimated_co2),
    alternatives: data.alternatives.slice(0, 2).map(alt => ({
      name: String(alt.name).slice(0, 200),
      co2_savings: Math.max(0, alt.co2_savings),
      rupee_savings: Math.max(0, alt.rupee_savings)
    })),
    emotional_analogy: String(data.emotional_analogy).slice(0, 300)
  };
}

// ─── CORE API CALL ────────────────────────────────────────────────────────────

/**
 * @typedef {object} NudgeResult
 * @property {number} estimated_co2 - kg CO₂ for the activity
 * @property {Array<{name: string, co2_savings: number, rupee_savings: number}>} alternatives
 * @property {string} emotional_analogy
 */

/**
 * Analyses a planned activity and returns carbon impact data via Gemini API.
 * @param {string} activityText - description of planned activity
 * @returns {Promise<NudgeResult>}
 * @throws {NudgeError} structured error with a user-facing message
 */
export async function analyseActivity(activityText) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw createNudgeError(
      'NO_API_KEY',
      'Please configure your Gemini API key to use the Decision Scanner.'
    );
  }

  if (typeof activityText !== 'string' || activityText.trim().length < 3) {
    throw createNudgeError(
      'INVALID_INPUT',
      'Please describe your planned activity in at least 3 characters.'
    );
  }

  const prompt = buildPrompt(activityText.trim().slice(0, 500));
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
      responseMimeType: 'application/json'
    }
  };

  let response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(15000) // 15-second timeout
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw createNudgeError(
        'TIMEOUT',
        'The request timed out. Please check your network connection and try again.'
      );
    }
    throw createNudgeError(
      'NETWORK_ERROR',
      'Network error. Please check your internet connection and try again.'
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw createNudgeError(
      'UNAUTHORIZED',
      'Invalid API key. Please check your Gemini API key in the settings panel.'
    );
  }
  if (response.status === 429) {
    throw createNudgeError(
      'RATE_LIMITED',
      'Too many requests. Please wait a moment and try again.'
    );
  }
  if (!response.ok) {
    throw createNudgeError(
      'API_ERROR',
      `Gemini API returned an error (${response.status}). Please try again later.`
    );
  }

  let responseData;
  try {
    responseData = await response.json();
  } catch {
    throw createNudgeError('PARSE_ERROR', 'Could not read API response. Please try again.');
  }

  // Extract text from Gemini response structure
  const rawText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    // Check for safety block
    const blockReason = responseData?.candidates?.[0]?.finishReason;
    if (blockReason === 'SAFETY') {
      throw createNudgeError(
        'SAFETY_BLOCK',
        'The activity description was flagged. Please rephrase and try again.'
      );
    }
    throw createNudgeError(
      'EMPTY_RESPONSE',
      'Received an empty response from Gemini. Please try again.'
    );
  }

  try {
    return parseGeminiResponse(rawText);
  } catch (parseErr) {
    throw createNudgeError(
      'PARSE_ERROR',
      'Could not interpret the AI response. Please try again with a different description.'
    );
  }
}

// ─── ERROR FACTORY ────────────────────────────────────────────────────────────

/**
 * Creates a structured NudgeError object.
 * @param {string} code - machine-readable error code
 * @param {string} userMessage - display-safe user-facing message
 * @returns {Error}
 */
function createNudgeError(code, userMessage) {
  const err = new Error(userMessage);
  err.name = 'NudgeError';
  err.code = code;
  err.userMessage = userMessage;
  return err;
}

/**
 * Returns whether an error is a NudgeError (user-displayable).
 * @param {Error} err
 * @returns {boolean}
 */
export function isNudgeError(err) {
  return err && err.name === 'NudgeError';
}
