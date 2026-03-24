# faulttreev2 – Project Overview

This is **Version 2** of the Fault Tree Visualization application.
It is a separate product from `faultTreeVis` (v1), built on the same Next.js stack but intended for new features, redesigns, or architectural changes.

---

## Distinction from V1 (`faultTreeVis`)

| | V1 – `faultTreeVis` | V2 – `faulttreev2` |
|---|---|---|
| Folder | `/Desktop/faultTreeVis` | `/Desktop/faulttreev2/faulttreevisv2` |
| Git remote | `https://github.com/gorkemcardak/faulttreevisv2.git` | TBD |
| Status | Completed reference implementation | In development |
| Purpose | Original prototype | Next iteration / new product |

---

## V1 Feature Baseline (what this version starts from)

The V1 app established:

- **Fault tree canvas** — pan & zoom (0.15×–5×), SVG rendering via custom React components
- **Two analysis modes:**
  - *Probabilistic* — exact failure probability calculation with interactive sliders
  - *Monte Carlo* — animated simulation with dot-grid visualization
- **Gate types:** OR (arch shape) and AND (dome shape), rendered with red/green probability fill
- **Basic events:** label pill + probability bar + draggable blue slider
- **Sankey lines:** thick curved connections colored by probability (rgba red, thickness ∝ probability)
- **Audio system:** Web Audio API sawtooth oscillator; pitch/gain reacts to max probability of any basic event
- **Tree persistence:** in-memory POST/GET API at `pages/api/trees.js`
- **Import:** custom JSON tree via modal
- **Reset:** resets all basic event probabilities to 0.5

### V1 Tree (Small Airplane Engine fault tree)
```
root: "Cylinder 1 Fails to Provide Mech. Force" [OR]
├── fi_gate: "Fuel Injector Fails to Inject fuel" [OR]
│   ├── fi_int: "Fuel Injector Internal" (basic, p=0.05)
│   └── fp_gate: "Fuel Pump Fails to Pump fuel out" [OR]
│       ├── ft_gate: "Fuel Tank Fails to Provide fuel" [OR]
│       │   └── ft_int: "Fuel Tank Internal" (basic, p=0.03)
│       ├── mag_and: "Both Magnetos Fail" [AND]
│       │   ├── mag1: "Magneto 1 Fails to Produce electricity" [OR]
│       │   │   └── mag1_int: "Magneto 1 Internal" (basic, p=0.15)
│       │   └── mag2: "Magneto 2 Fails to Produce electricity" [OR]
│       │       └── mag2_int: "Magneto 2 Internal" (basic, p=0.15)
│       └── fp_int: "Fuel Pump Internal" (basic, p=0.08)
└── cyl1_int: "Cylinder 1 Internal" (basic, p=0.05)
```

---

## V2 File Structure

```
faulttreev2/
└── faulttreevisv2/        ← Next.js app root
    ├── pages/
    │   ├── index.js       ← active page served in browser
    │   └── api/
    ├── components/
    │   └── App.jsx        ← reference component
    ├── public/
    ├── package.json
    └── faulttreev2.md     ← this file
```

---

## V2 Goals / New Direction

> Fill this section as the product evolves.

- [ ] Define what differentiates V2 from V1 (new UI, new analysis features, new data model, etc.)
- [ ] Set up `.gitignore` to exclude `node_modules/` and `.next/`
- [ ] Initialize new git remote for V2
