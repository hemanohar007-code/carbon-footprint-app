<div align="center">
  <h1>🌍 CarbonMirror</h1>
  <p><strong>India's Carbon Footprint Awareness Platform</strong></p>
  <p>Make the invisible viscerally real. A production-grade, browser-native web application helping urban Indian users understand, visualise, and reduce their personal carbon footprint.</p>
</div>

<br />

<div align="center">
  <img src="https://img.shields.io/badge/Status-Active-success.svg" alt="Status" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/Architecture-Vanilla_JS-yellow.svg" alt="Architecture" />
</div>

---

## ✨ Key Features

### 🧮 1. Deterministic Carbon Calculator
Collects inputs across **5 lifestyle categories** and computes your annual CO₂ footprint using verified Indian emission factors (CEA, MoEFCC & IEA 2023).

### 🌍 2. Dynamic Carbon Planet Visualization
A live 2D canvas "planet" that **degrades dynamically** based on your footprint tier:
- 🟢 **Green** (< 1,500 kg/yr): Lush green, healthy atmosphere, steady rotation.
- 🟡 **Yellow** (1,500–3,000 kg/yr): Pale green-beige, minor surface cracking.
- 🟠 **Orange** (3,000–6,000 kg/yr): Grayish-brown, visible fissures, smog layer.
- 🔴 **Red** (> 6,000 kg/yr): Charred surface, chaotic rotation, volcanic smoke.

### 🔍 3. AI Decision Scanner (Gemini-powered)
Enter any planned activity (e.g., *"ordering mutton biryani"*, *"booking a Goa flight"*) and instantly get:
- **Estimated CO₂ impact** (kg).
- **2 greener alternatives** with CO₂ and ₹ financial savings.
- **Emotional analogies** calibrated for urban India (e.g., *"equivalent to running an AC for 3 hours in Mumbai"*).

### 🏆 4. Gamification & Action Roadmap
- **Challenges:** 7-Day Waste Minimization, 30-Day Commute Swap.
- **Badges:** Unlock badges like *Carbon Rookie*, *Plant-Powered*, and *Energy Ninja* by hitting milestones in your Net-Zero Roadmap.
- **Personalised Roadmap:** High-impact reduction actions ranked by CO₂ and ₹ savings.

### 📤 5. Social Share Cards
Generate branded HTML5 Canvas share cards with your score, badges, and top pledges. Download as PNG or share via the native Web Share API.

---

## 🏗️ Architecture & Data Flow

CarbonMirror is built using **Zero Dependencies** (Vanilla JS, HTML5, CSS3) and features a strict unidirectional data flow.

```text
Form Inputs → calculator.js → AppState (app.js) → UI Redraw + Canvas Rerender
                                    ↕
                           gamification.js (localStorage)
                                    ↕
                           nudge-engine.js (Gemini API)
```

- **Pure Functions:** `calculator.js` uses strict, side-effect-free math.
- **Observer Pattern:** `app.js` manages state with `setState(partial)` → `notify()`.
- **Zero innerHTML:** Uses only `textContent` or `createElement` to prevent XSS.

---

## 🚀 Getting Started

No `Node.js` or build steps required. Simply serve the directory over HTTP.

### Option 1: VS Code Live Server (Recommended)
1. Install the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer).
2. Right-click `index.html` → **Open with Live Server**.

### Option 2: Python HTTP Server
```bash
python -m http.server 3000
# Open http://localhost:3000
```

> ⚠️ **Note:** Do not open `index.html` directly via `file://`. ES6 modules require an HTTP server.

---

## 🔑 Gemini API Key Setup

1. Obtain a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Paste the key into the **"Gemini API Key"** field in the app header.
3. Click **Save**.

> 🔒 **Privacy:** Your API key is stored securely in ephemeral `sessionStorage`. It is automatically wiped when you close the tab and never touches any backend.

---

## 📊 Emission Factors (India Context)

All calculations use verified data tailored for the Indian context:

| Factor | Value | Source |
|---|---|---|
| **Grid Electricity** | 0.82 kg CO₂/kWh | CEA India 2023 |
| **Petrol Car** | 0.17 kg CO₂/km | MoEFCC |
| **Heavy Meat Diet** | 2.5 kg CO₂/day | FAO/IPCC |
| **Vegan Diet** | 0.7 kg CO₂/day | FAO/IPCC |
| **E-commerce Delivery**| 0.35 kg CO₂/delivery | IEA |

*For the complete list, see `data/emission-factors.json`.*

---

## ♿ Accessibility & Security

- **WCAG 2.1 AA Compliant:** High contrast text and full keyboard operability.
- **Reduced Motion Support:** Respects OS-level `prefers-reduced-motion` settings.
- **Content Security Policy:** Strict CSP restricts execution to local sources and the Gemini endpoint.
- **No Tracking:** Zero analytics, telemetry, or external data collection.

---

<div align="center">
  <p><i>Built with ❤️ for urban India's climate-conscious generation.</i></p>
</div>