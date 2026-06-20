# 🌍 CarbonMirror — India's Carbon Footprint Awareness Platform

> **Make the invisible viscerally real.** CarbonMirror is a production-grade, browser-native web application that helps urban Indian users (18–35) understand, visualise, and reduce their personal carbon footprint through deterministic science, AI-powered nudges, and gamified challenges.

---

## ✨ Features

### 🧮 1. Carbon Calculator
Collects inputs across **5 lifestyle categories** and computes an annual CO₂ footprint using verified Indian emission factors (CEA, MoEFCC & IEA 2023):

| Category | Inputs |
|---|---|
| 🚗 **Transport** | Vehicle type, daily commute km, domestic & international flights |
| 🍛 **Food** | Diet type (Heavy Meat → Vegan) |
| 🏠 **Home Energy** | Monthly electricity (kWh), LPG cylinders |
| 🛍️ **Shopping** | E-commerce deliveries/month, fast-fashion items/year |
| 📱 **Digital** | Daily video streaming hours, cloud storage (GB) |

### 🌍 2. Carbon Planet Visualization
A live 2D canvas "planet" that **degrades dynamically** based on your footprint tier:

| Tier | Range | Visual State |
|---|---|---|
| 🟢 Green | < 1,500 kg/yr | Lush green, healthy atmosphere, steady rotation |
| 🟡 Yellow | 1,500–3,000 kg/yr | Pale green-beige, minor surface cracking |
| 🟠 Orange | 3,000–6,000 kg/yr | Grayish-brown, visible fissures, smog layer |
| 🔴 Red | > 6,000 kg/yr | Charred surface, chaotic rotation, volcanic smoke |

### 🔍 3. AI Decision Scanner (Gemini-powered)
Enter any planned activity ("ordering mutton biryani", "booking a Goa flight") and get:
- **Estimated CO₂ impact** (kg)
- **2 greener alternatives** with CO₂ savings and ₹ financial savings
- **Emotional analogy** calibrated for urban India ("equivalent to running an AC for 3 hours in Mumbai")

### 🏆 4. Gamified Challenge System
- **7-Day Waste Minimization** challenge with daily logging
- **30-Day Commute Swap** challenge
- **Daily check-in streaks** with current + longest streak tracking
- **4 Badges**: Carbon Rookie, Flight-Free Champion, Plant-Powered, Energy Ninja

### 📈 5. Peer Leaderboard
Compare your footprint against a simulated peer group of 10 urban Indians (calibrated to 800–3,500 kg/yr range). All state is local — no data leaves your browser.

### 🛣️ 6. Personalised Action Roadmap
Top 5 high-impact reduction actions ranked by CO₂ savings for your specific profile, with **₹ financial savings estimates** (e.g., electricity units saved × ₹7.5/unit).

### 📤 7. Social Share Card
An HTML5 Canvas-generated branded share card with your score, badges, top pledge, and equivalencies — download as PNG or use the native Web Share API.

---

## 🏗️ Architecture

```
/
├── index.html            ← Semantic HTML5, WCAG AA, strict CSP
├── style.css             ← Dark glassmorphism design system
├── app.js                ← Central AppState + observer pattern + UI router
├── calculator.js         ← Pure deterministic CO₂ math (no side effects)
├── visualization.js      ← Canvas planet rendering engine
├── nudge-engine.js       ← Ephemeral Gemini API integration
├── gamification.js       ← localStorage challenges/badges/streaks
├── share.js              ← Canvas social card generator
├── data/
│   └── emission-factors.json   ← Ground-truth Indian emission data
└── tests/
    ├── calculator.test.js      ← ~55 unit tests
    ├── nudge-engine.test.js    ← ~20 integration + mock tests
    ├── app.test.js             ← ~30 functional + localStorage tests
    └── test-runner.html        ← Self-executing browser test dashboard
```

### Data Flow (Unidirectional)
```
Form Inputs → calculator.js → AppState (app.js) → UI Redraw + Canvas Rerender
                                    ↕
                           gamification.js (localStorage)
                                    ↕
                           nudge-engine.js (Gemini API)
```

---

## 🚀 Getting Started

### Prerequisites
- A modern browser (Chrome, Firefox, Edge, Safari) — **no Node.js required**
- A local HTTP server to serve ES modules (required for `import` statements)

### Option 1: VS Code Live Server (Recommended)
1. Install the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
2. Open the project folder in VS Code
3. Right-click `index.html` → **Open with Live Server**

### Option 2: Python HTTP Server
```bash
# Python 3
python -m http.server 8080

# Then open: http://localhost:8080
```

### Option 3: npx serve
```bash
npx serve .
```

### Option 4: Node.js http-server
```bash
npm install -g http-server
http-server . -p 8080
```

> ⚠️ **Do not open `index.html` directly via `file://` protocol** — ES6 modules require an HTTP server due to CORS restrictions.

---

## 🔑 Gemini API Key Setup

1. Obtain a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Open the application in your browser
3. Paste the key into the **"Gemini API Key"** field in the top header
4. Click **Save** — the key is stored in `sessionStorage` only (cleared when you close the tab)

> 🔒 **Security guarantee**: Your API key is **never** written to source code, localStorage, or any external service. It exists only in ephemeral session memory.

---

## 🧪 Running Tests

Open the test runner in your browser (requires HTTP server):

```
http://localhost:8080/tests/test-runner.html
```

The dashboard will automatically run all three test suites and display:
- ✅ PASS / ❌ FAIL status per test
- Error messages for failed assertions
- Overall summary card (e.g., **"105/105 Tests Passed"**)

**Test coverage:**
- `calculator.test.js` — ~55 unit tests (math, edge cases, known-value assertions)
- `nudge-engine.test.js` — ~20 integration tests (fetch mocking, error codes)
- `app.test.js` — ~30 functional tests (localStorage, tier transitions, challenge lifecycle)

---

## 📊 Emission Factors

All values sourced from official Indian government and international bodies:

| Factor | Value | Source |
|---|---|---|
| Grid Electricity | 0.82 kg CO₂/kWh | CEA India 2023 |
| Petrol Car | 0.17 kg CO₂/km | MoEFCC |
| Diesel Car | 0.19 kg CO₂/km | MoEFCC |
| Two-Wheeler (Petrol) | 0.045 kg CO₂/km | MoEFCC |
| EV / Electric Two-Wheeler | 0.06 kg CO₂/km | IEA (coal-heavy grid) |
| Bus / Metro | 0.015 kg CO₂/km per passenger | MoEFCC |
| Domestic Flight | 0.12 kg CO₂/km per passenger | IEA |
| International Flight | 0.11 kg CO₂/km per passenger | IEA |
| LPG Cylinder (14.2 kg) | 42.46 kg CO₂ | MoEFCC |
| Heavy Meat Diet | 2.5 kg CO₂/day | FAO/IPCC |
| Low Meat Diet | 1.5 kg CO₂/day | FAO/IPCC |
| Vegetarian Diet | 1.0 kg CO₂/day | FAO/IPCC |
| Vegan Diet | 0.7 kg CO₂/day | FAO/IPCC |
| E-commerce Delivery | 0.35 kg CO₂/delivery | IEA |
| Fast Fashion (1 garment) | 12.5 kg CO₂ | Textile Exchange |
| Video Streaming | 0.05 kg CO₂/hour | IEA |
| Cloud Storage | 0.001 kg CO₂/GB/year | IEA |

---

## ♿ Accessibility

- **WCAG 2.1 AA compliant** — all text has ≥4.5:1 contrast ratio on the dark background
- **Full keyboard operability** — all interactive elements are tabindex-accessible with Enter/Space activation
- **ARIA labels and live regions** — dynamic content uses `aria-live="polite"` for screen reader announcements
- **Reduced motion support** — canvas animations disabled when `prefers-reduced-motion: reduce` is set

---

## 🔒 Security

- **Zero innerHTML** — all DOM updates use `textContent` or `createElement` to prevent XSS from AI-generated strings
- **Strict CSP** — Content Security Policy restricts script/style execution to local sources + Gemini endpoint only
- **No tracking** — zero analytics, telemetry, or external data collection
- **Session-only API key** — cleared automatically when the browser tab is closed

---

## 🏷️ Context

| Benchmark | kg CO₂/year |
|---|---|
| Urban India average | ~1,750 |
| Global average | ~4,000 |
| US average | ~15,000 |
| **CarbonMirror net-zero target (2030)** | **1,200** |

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

*Built with ❤️ for urban India's climate-conscious generation.*
#   c a r b o n - f o o t p r i n t - a p p  
 