/**
 * Fault Tree Visualization — Version 2
 * ─────────────────────────────────────────────────────────────
 * An interactive fault tree analysis tool for the Small Airplane
 * Engine model. Combines two analysis modes (Probabilistic and
 * Monte Carlo) with a reactive audio engine whose sounds and
 * tempo mirror the failure probabilities of each component.
 *
 * Key concepts:
 *  • Basic Events  — leaf nodes with adjustable failure probability (0–1)
 *  • Gate Nodes    — AND / OR logic gates that propagate failure upward
 *  • Top Event     — the root gate; its probability is the system failure risk
 *  • Probabilistic mode — exact calculated probabilities shown live
 *  • Monte Carlo mode   — stochastic simulation run N times, animated dot-by-dot
 *  • Audio engine  — each component has a characteristic sound; heartbeat
 *                    tempo scales with the top-event failure probability
 */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════
   MATH — Probability calculation engine
   ═══════════════════════════════════════════════════════════ */

/**
 * Recursively calculates the failure probability of a node.
 *  • Basic event  → returns its raw probability directly
 *  • AND gate     → system fails only when ALL children fail  (product rule)
 *  • OR gate      → system fails when ANY child fails         (inclusion-exclusion)
 *  • k/N gate     → system fails when at least k of N children fail
 */
function calcProb(node, nm) {
  if (node.type === "basic") return node.probability;
  const cp = node.children.map((id) => calcProb(nm[id], nm));
  if (node.gateType === "AND") return cp.reduce((a, b) => a * b, 1);
  if (node.gateType === "OR") return 1 - cp.reduce((a, b) => a * (1 - b), 1);
  let pOk = 0;
  for (let f = 0; f < node.k; f++) pOk += combP(cp, f);
  return 1 - pOk;
}
/*
 * combP — probability that exactly nf out of N components fail.
 * Used by the k/N gate to sum over all failure combinations.
 */
function combP(probs, nf) {
  const cs = getCombos(probs.map((_, i) => i), nf);
  let t = 0;
  for (const fs of cs) {
    let p = 1;
    for (let i = 0; i < probs.length; i++) p *= fs.includes(i) ? probs[i] : 1 - probs[i];
    t += p;
  }
  return t;
}
/** getCombos — generates all k-element subsets of array a (used by combP). */
function getCombos(a, k) {
  if (k === 0) return [[]];
  if (!a.length) return [];
  const [f, ...r] = a;
  return [...getCombos(r, k - 1).map((c) => [f, ...c]), ...getCombos(r, k)];
}

/**
 * generateAllRuns — Monte Carlo simulation engine.
 * Runs the fault tree numRuns times. In each run every basic event
 * is sampled (random < probability → failed), then gate states are
 * evaluated bottom-up. Returns an array of state maps so the UI
 * can animate each run one at a time.
 */
function generateAllRuns(nodes, rootId, numRuns) {
  const allRuns = [];
  for (let r = 0; r < numRuns; r++) {
    const st = {};
    Object.values(nodes).forEach((n) => {
      if (n.type === "basic") st[n.id] = Math.random() < n.probability;
    });
    const ev = (id) => {
      if (st[id] !== undefined) return st[id];
      const n = nodes[id];
      const cs = n.children.map(ev);
      if (n.gateType === "AND") st[id] = cs.every(Boolean);
      else if (n.gateType === "OR") st[id] = cs.some(Boolean);
      else st[id] = cs.filter(Boolean).length >= n.k;
      return st[id];
    };
    ev(rootId);
    allRuns.push(st);
  }
  return allRuns;
}

/* ═══════════════════════════════════════════════════════════
   TREE DATA — Fault tree model definitions
   ═══════════════════════════════════════════════════════════

   Each tree is a flat node map keyed by node ID.
   Node types:
     • "gate"  — logic gate with gateType (AND / OR / KN) and children[]
     • "basic" — leaf event with a failure probability (0–1)

   The Small Airplane Engine tree models "Cylinder 1 Fails to
   Provide Mechanical Force" as the top-level (root) undesired event.
   The tree decomposes into fuel-system and electrical (magneto) paths.
   ═══════════════════════════════════════════════════════════ */
const SMALL_AIRPLANE_ENGINE = {
  rootId: "root",
  linkedEvents: [],
  nodes: {
    root:     { id: "root",     type: "gate",  gateType: "OR",  label: "Cylinder 1 Fails to Provide Mech. Force",    children: ["fi_gate", "cyl1_int"] },
    cyl1_int: { id: "cyl1_int", type: "basic",                  label: "Cylinder 1 Internal",                         probability: 0.05 },
    fi_gate:  { id: "fi_gate",  type: "gate",  gateType: "OR",  label: "Fuel Injector Fails to Inject fuel",          children: ["fi_int", "fp_gate"] },
    fi_int:   { id: "fi_int",   type: "basic",                  label: "Fuel Injector Internal",                      probability: 0.05 },
    fp_gate:  { id: "fp_gate",  type: "gate",  gateType: "OR",  label: "Fuel Pump Fails to Pump fuel out",            children: ["ft_gate", "mag_and", "fp_int"] },
    fp_int:   { id: "fp_int",   type: "basic",                  label: "Fuel Pump Internal",                          probability: 0.08 },
    ft_gate:  { id: "ft_gate",  type: "gate",  gateType: "OR",  label: "Fuel Tank Fails to Provide fuel",             children: ["ft_int"] },
    ft_int:   { id: "ft_int",   type: "basic",                  label: "Fuel Tank Internal",                          probability: 0.03 },
    mag_and:  { id: "mag_and",  type: "gate",  gateType: "AND", label: "Both Magnetos Fail",                          children: ["mag1", "mag2"] },
    mag1:     { id: "mag1",     type: "gate",  gateType: "OR",  label: "Magneto 1 Fails to Produce electricity",      children: ["mag1_int"] },
    mag1_int: { id: "mag1_int", type: "basic",                  label: "Magneto 1 Internal",                          probability: 0.15 },
    mag2:     { id: "mag2",     type: "gate",  gateType: "OR",  label: "Magneto 2 Fails to Produce electricity",      children: ["mag2_int"] },
    mag2_int: { id: "mag2_int", type: "basic",                  label: "Magneto 2 Internal",                          probability: 0.15 },
  },
};
/**
 * TREES — registry of available fault tree models.
 * Add more entries here to expose additional trees in the toolbar selector.
 */
const TREES = {
  airplane: { name: "Small Airplane Engine", data: SMALL_AIRPLANE_ENGINE },
};

/* ═══════════════════════════════════════════════════════════
   LAYOUT — Tree positioning constants and algorithm
   ═══════════════════════════════════════════════════════════

   The layout algorithm is a two-pass recursive process:
     1. sw(id)    — measures the total subtree width of each node
     2. place(id) — assigns (x, y) coordinates top-down

   All coordinates are in SVG user units. The SVG viewBox is
   auto-fitted to the tree bounds so the whole tree is always visible.
   ═══════════════════════════════════════════════════════════ */

/** Width of a basic event card in SVG units. */
const BASIC_W = 160;
/** Height of a basic event card in Probabilistic mode. */
const BASIC_H_PROB = 84;
/** Height of a basic event card in Monte Carlo mode (taller to fit the dot grid). */
const BASIC_H_MC = 160;
/** Minimum layout width allocated to a gate node. */
const GATE_W = 100;
/** Height of a gate shape. */
const GATE_H = 76;
/** Horizontal gap between sibling subtrees (wide enough to prevent label overlap). */
const H_GAP = 80;
/** Vertical gap between a parent gate and its children. */
const V_GAP = 105;

/**
 * layoutTree — computes {x, y, w, h} for every node.
 * Returns a flat position map keyed by node ID.
 * Re-runs whenever nodes, rootId, or mode changes (via useMemo).
 */
function layoutTree(nodes, rootId, isMC) {
  const bH = isMC ? BASIC_H_MC : BASIC_H_PROB;
  const pos = {};
  function sw(id) {
    const n = nodes[id];
    if (n.type === "basic") return BASIC_W;
    const cw = n.children.map(sw);
    return Math.max(GATE_W, cw.reduce((a, b) => a + b, 0) + (n.children.length - 1) * H_GAP);
  }
  function place(id, x, y) {
    const n = nodes[id];
    const stw = sw(id);
    const w = n.type === "basic" ? BASIC_W : GATE_W;
    const h = n.type === "basic" ? bH : GATE_H;
    pos[id] = { x: x + stw / 2, y, w, h };
    if (n.type === "gate") {
      let cx = x;
      for (const cid of n.children) {
        const cw = sw(cid);
        place(cid, cx, y + h + V_GAP);
        cx += cw + H_GAP;
      }
    }
  }
  place(rootId, 0, 0);
  return pos;
}

/* ═══════════════════════════════════════════════════════════
   DOT GRID — Monte Carlo result visualisation
   ═══════════════════════════════════════════════════════════ */

/**
 * DotGrid — renders a 10-column grid of dots inside a gate or basic event.
 * Each dot represents one Monte Carlo run:
 *   • Grey   — not yet revealed (animation still in progress)
 *   • Red    — this run resulted in failure for this node
 *   • Green  — this run did not fail for this node
 * The dots fill in left-to-right, top-to-bottom as visibleCount increases.
 */
function DotGrid({ x, y, width, height, results, visibleCount, totalRuns }) {
  if (!results) return null;
  const n = totalRuns || results.length;
  const cols = 10;
  const rows = Math.ceil(n / cols);
  const gx = width / (cols);
  const gy = height / (rows);
  const r = Math.min(gx, gy) * 0.36;
  const ox = x + gx / 2;
  const oy = y + gy / 2;

  const dots = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const visible = i < visibleCount;
    const failed = visible ? results[i] : undefined;
    dots.push(
      <circle
        key={i}
        cx={ox + col * gx}
        cy={oy + row * gy}
        r={r}
        fill={!visible ? "#e5e7eb" : failed ? "#dc2626" : "#22c55e"}
        opacity={visible ? 1 : 0.3}
      />
    );
  }
  return <g>{dots}</g>;
}

/* ═══════════════════════════════════════════════════════════
   GATE SHAPE — SVG rendering of logic gates
   ═══════════════════════════════════════════════════════════ */

/**
 * GateVis — draws the gate shape (AND dome / OR arch / k/N variant).
 *
 * Visual encoding:
 *  • Green fill (top portion)  — probability of NOT failing (1 − p)
 *  • Red fill (bottom portion) — failure probability p
 *  • In Monte Carlo mode the fill is replaced by the DotGrid
 *  • R= value shown to the right is the Monte Carlo empirical rate
 *  • P= value shown to the right is the exact calculated probability
 *
 * Gate shapes follow standard fault-tree notation:
 *  AND — flat-bottomed dome (both inputs must fail)
 *  OR  — arch/shield shape  (any input failure propagates up)
 */
function GateVis({ node, cx, cy, prob, mcData, visibleCount, isMC, totalRuns }) {
  const w = 80;
  const h = 60;
  const t = cy - h / 2;
  const b = cy + h / 2;
  const l = cx - w / 2;
  const r = cx + w / 2;

  let pathD;
  if (node.gateType === "AND") {
    pathD = `M${l} ${b} L${l} ${t + h * 0.35} Q${l} ${t}, ${cx} ${t} Q${r} ${t}, ${r} ${t + h * 0.35} L${r} ${b} Z`;
  } else if (node.gateType === "OR") {
    pathD = `M${l} ${b} Q${l} ${t + h * 0.15}, ${l + w * 0.18} ${t} L${r - w * 0.18} ${t} Q${r} ${t + h * 0.15}, ${r} ${b} Q${cx} ${b - h * 0.2}, ${l} ${b} Z`;
  } else {
    pathD = `M${l + 4} ${b - 6} L${l + 6} ${t + h * 0.28} Q${l + 6} ${t}, ${cx} ${t} Q${r - 6} ${t}, ${r - 6} ${t + h * 0.28} L${r - 4} ${b - 6} Q${cx} ${b + 2}, ${l + 4} ${b - 6} Z`;
  }
  const clipId = `g-${node.id}`;
  const greenH = h * (1 - prob);
  const mcR = isMC && mcData && visibleCount > 0 ? mcData.failures / visibleCount : null;

  return (
    <g>
      <defs><clipPath id={clipId}><path d={pathD} /></clipPath></defs>

      {/* Prob fill */}
      <rect x={l} y={t} width={w} height={greenH} fill="#4ade80" clipPath={`url(#${clipId})`} />
      <rect x={l} y={t + greenH} width={w} height={h - greenH} fill="#f87171" clipPath={`url(#${clipId})`} />

      {/* MC dots inside gate */}
      {isMC && mcData && (
        <g clipPath={`url(#${clipId})`}>
          <DotGrid x={l + 3} y={t + 3} width={w - 6} height={h - 6} results={mcData.runs} visibleCount={visibleCount} totalRuns={totalRuns} />
        </g>
      )}

      {/* Outline */}
      <path d={pathD} fill="none" stroke="#374151" strokeWidth="2.5" strokeLinejoin="round" />
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════
   BASIC EVENT — Leaf node card with interactive probability slider
   ═══════════════════════════════════════════════════════════ */

/**
 * BasicEventVis — renders a single basic event (leaf node).
 *
 * In Probabilistic mode:
 *  • Red/green bar shows current failure probability
 *  • Blue slider lets the user drag to change the probability (0–1)
 *  • P= label shows the current value numerically
 *  • Changing the slider immediately recalculates the entire tree and
 *    updates the audio engine (component sound volume + heartbeat tempo)
 *
 * In Monte Carlo mode:
 *  • Slider is hidden; the DotGrid shows simulation outcomes
 *  • R= shows the empirical failure rate across visible runs so far
 *
 * A yellow dot badge appears when the event is part of a linked group
 * (i.e. two events that always share the same probability value).
 */
function BasicEventVis({ node, x, y, w, h, prob, isMC, mcData, visibleCount, totalRuns, onProbChange, linked }) {
  const cX = x - w / 2;
  const cY = y;
  const pad = 8;
  const barX = cX + pad;
  const barW = w - pad * 2;

  const mcR = isMC && mcData && visibleCount > 0 ? mcData.failures / visibleCount : null;

  const [currentProb, setCurrentProb] = useState(prob);
  useEffect(() => {
    setCurrentProb(prob);
  }, [prob]);

  // Slider
  const sliderY = cY + h - 18;

  const startDrag = (e) => {
    e.stopPropagation();
    const svg = e.target.closest("svg");
    const update = (clientX) => {
      const ctm = svg.getScreenCTM();
      const invCtm = ctm.inverse();
      const svgPoint = svg.createSVGPoint();
      svgPoint.x = clientX;
      svgPoint.y = e.clientY;
      const svgCoord = svgPoint.matrixTransform(invCtm);
      const svgX = svgCoord.x;
      let ratio = (svgX - barX) / barW;
      ratio = Math.max(0, Math.min(1, ratio));
      const newProb = Math.round(ratio * 100) / 100;
      setCurrentProb(newProb);
      onProbChange(node.id, newProb, linked);
    };
    update(e.clientX);
    const onMove = (ev) => { ev.preventDefault(); update(ev.clientX); };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <g>
      {/* Label pill */}
      <rect x={cX - 2} y={cY - 20} width={w + 4} height={17} rx="4" fill="rgba(255,255,255,0.93)" stroke="#d1d5db" strokeWidth="0.7" />
      <text x={x} y={cY - 8} textAnchor="middle" fill="#374151" fontSize="10.5" fontWeight="600" fontFamily="system-ui">{node.label}</text>

      {/* Linked */}
      {linked && linked.length > 1 && (
        <circle cx={cX + w + 6} cy={cY - 12} r="5" fill="#f59e0b" stroke="#fff" strokeWidth="1.5" />
      )}

      {isMC ? (
        /* ── MC mode ── */
        <g>
          {/* R= */}
          {mcR !== null && (
            <text x={x} y={cY + 12} textAnchor="middle" fill="#111827" fontSize="14" fontWeight="800" fontFamily="monospace">R={mcR.toFixed(2)}</text>
          )}

          {/* Card */}
          <rect x={cX + 2} y={cY + 20} width={w - 4} height={h - 62} rx="6" fill="#fff" stroke="#d1d5db" strokeWidth="1" />

          {/* Dot grid */}
          <DotGrid x={cX + 6} y={cY + 24} width={w - 12} height={h - 70} results={mcData?.runs} visibleCount={visibleCount} totalRuns={totalRuns} />
        </g>
      ) : (
        /* ── Prob mode ── */
        <g>
          {/* Bar */}
          <rect x={barX} y={cY + 8} width={barW * currentProb} height={34} rx="4" fill="#f87171" />
          <rect x={barX + barW * currentProb} y={cY + 8} width={barW * (1 - currentProb)} height={34} rx="4" fill="#4ade80" />
        </g>
      )}

      {/* Slider */}
      <rect x={barX} y={sliderY} width={barW} height="5" rx="2.5" fill="#e5e7eb" />
      <rect x={barX} y={sliderY} width={barW * currentProb} height="5" rx="2.5" fill="#3b82f6" />
      <circle cx={barX + barW * currentProb} cy={sliderY + 2.5} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2.5"
        style={{ cursor: "pointer", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />

      {/* Drag area */}
      <rect x={barX - 10} y={sliderY - 12} width={barW + 20} height="30" fill="transparent" style={{ cursor: "pointer" }}
        onMouseDown={startDrag} className="no-pan" />
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════
   CONNECTION — Sankey-style curved edge between nodes
   ═══════════════════════════════════════════════════════════ */

/**
 * SankeyLine — draws a cubic Bézier curve connecting a parent gate
 * to one of its children.
 *
 * Visual encoding of failure risk on the edge:
 *  • Stroke thickness  — proportional to child failure probability (4–22 px)
 *  • Stroke opacity    — higher probability = more opaque red
 * This lets viewers immediately see which paths carry the most risk
 * without reading numerical values.
 */
function SankeyLine({ x1, y1, x2, y2, prob }) {
  const thickness = Math.max(4, prob * 22);
  // Interpolate from pale pink (248,180,180) at prob=0 → deep crimson (180,10,10) at prob=1
  const r = Math.round(248 - prob * 68);
  const g = Math.round(180 - prob * 170);
  const b = Math.round(180 - prob * 170);
  const alpha = 0.18 + prob * 0.82;
  const cp1y = y1 + (y2 - y1) * 0.38;
  const cp2y = y1 + (y2 - y1) * 0.62;
  return (
    <path
      d={`M${x1} ${y1} C${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`}
      fill="none"
      stroke={`rgba(${r},${g},${b},${alpha})`}
      strokeWidth={thickness}
      strokeLinecap="round"
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   APP — Main application component
   ═══════════════════════════════════════════════════════════ */

/**
 * App — root component that owns all application state and
 * orchestrates the three main subsystems:
 *  1. Fault tree state  — nodes, probabilities, selected tree
 *  2. Analysis engine   — probabilistic calculation + Monte Carlo simulation
 *  3. Audio engine      — component sounds + heartbeat tempo
 *
 * Canvas interaction:
 *  • Scroll wheel  — zoom in/out (0.15× – 5×)
 *  • Pointer drag  — pan the canvas
 *  • Slider drag   — adjust a basic event's failure probability
 */
export default function App() {
  // ── Which tree is currently loaded ──
  const [treeKey, setTreeKey] = useState("airplane");

  // ── Live node map — mutated when sliders are dragged ──
  const [nodes, setNodes] = useState(() => structuredClone(SMALL_AIRPLANE_ENGINE.nodes));

  // ── Linked event groups — events that share the same probability ──
  const [linked, setLinked] = useState(SMALL_AIRPLANE_ENGINE.linkedEvents);

  // ── ID of the top (root) node ──
  const [rootId, setRootId] = useState(SMALL_AIRPLANE_ENGINE.rootId);

  // ── Analysis mode: "prob" (exact) or "mc" (Monte Carlo simulation) ──
  const [mode, setMode] = useState("prob");

  // ── Monte Carlo: number of simulation runs (50 / 100 / 200 / 500) ──
  const [mcNumRuns, setMcNumRuns] = useState(100);

  // ── UI panel visibility ──
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");

  // ── Audio on/off toggle state ──
  const [audioEnabled, setAudioEnabled] = useState(false);

  // ── Monte Carlo simulation data and animation state ──
  const [allRuns, setAllRuns] = useState(null);       // pre-computed run results
  const [visibleRuns, setVisibleRuns] = useState(0);  // how many runs have been revealed so far
  const [isAnimating, setIsAnimating] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(80);     // ms between revealed runs

  // ── Canvas pan/zoom transform ──
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

  // ── Audio engine refs (mutable, not re-render triggers) ──
  const audioContext = useRef(null);        // Web Audio API context
  const masterGain = useRef(null);          // single gain node controlling all audio
  const beatIntervalRef = useRef(1500);     // current ms between heartbeat pulses
  const beatSchedulerRef = useRef(null);    // setTimeout handle for the beat loop
  const melodySchedulerRef = useRef(null);  // setTimeout handle for the melody arpeggio loop
  const melodyIndexRef = useRef(0);         // current position in the melody pattern
  const melodyGainRef = useRef(null);       // gain node for melody layer (fades out with danger)
  const dangerGainRef = useRef(null);       // gain node for low rumble drone (fades in with danger)
  const tremoloLFORef = useRef(null);       // tremolo LFO node (frequency scales with topProb)
  const shutdownTriggeredRef = useRef(false); // prevents re-triggering engine shutdown sound
  const componentSounds = useRef({});      // { nodeId: { gain, maxGain } } per basic event
  const componentPanners = useRef({});     // { nodeId: StereoPannerNode } — one per basic event

  // ── Canvas interaction refs ──
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const isPanning = useRef(false);
  const animRef = useRef(null); // setTimeout handle for MC animation

  // topProb: the fully-calculated root failure probability (respects AND/OR gate logic)
  const topProb = useMemo(() => calcProb(nodes[rootId], nodes), [nodes, rootId]);

  const isMC = mode === "mc";
  
  
  //AUDIO ENGINE INIT----
  useEffect(() => {
    // webkitAudioContext is the Safari fallback — hint is safe to ignore
    // @ts-ignore
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioContext.current = ctx;

    const master = ctx.createGain();
    master.gain.value = audioEnabled ? 0.5 : 0;
    master.connect(ctx.destination);
    masterGain.current = master;

    // Helper: make an oscillator routed through a gain into master
    function osc(freq, type, gainVal, target) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = gainVal;
      o.connect(g); g.connect(target); o.start();
      return g;
    }

    // ── Spatialization helper ──
    // Each component sound gets a StereoPannerNode between its gain and master.
    // Pan values start at 0 (center) and are updated by the positions useEffect.
    const panners = {};
    function makePanner(id) {
      const p = ctx.createStereoPanner(); p.pan.value = 0; p.connect(master);
      panners[id] = p; return p;
    }

    // ── Component sounds — each gain node starts at 0, driven by node probability ──
    // Routing: oscillators → gainNode → StereoPannerNode → master
    const sounds = {};

    // cyl1_int — engine knock: sawtooth harmonics (45 / 90 / 135 Hz)
    { const g = ctx.createGain(); g.gain.value = 0; g.connect(makePanner('cyl1_int'));
      [[45,0.50],[90,0.30],[135,0.15]].forEach(([f,w]) => osc(f,'sawtooth',w,g));
      sounds.cyl1_int = { gain: g, maxGain: 0.28 }; }

    // fi_int — injector tick: 2800 Hz square wave, AM-clicked at 18 Hz
    { const g = ctx.createGain(); g.gain.value = 0; g.connect(makePanner('fi_int'));
      const carrier = ctx.createOscillator(); carrier.type = 'square'; carrier.frequency.value = 2800;
      const innerG = ctx.createGain(); innerG.gain.value = 0.5;
      const amLfo = ctx.createOscillator(); amLfo.type = 'sine'; amLfo.frequency.value = 18;
      const amAmt = ctx.createGain(); amAmt.gain.value = 0.5;
      amLfo.connect(amAmt); amAmt.connect(innerG.gain);
      carrier.connect(innerG); innerG.connect(g);
      carrier.start(); amLfo.start();
      sounds.fi_int = { gain: g, maxGain: 0.14 }; }

    // fp_int — fuel pump: two detuned sines at ~200 Hz (electric motor whine)
    { const g = ctx.createGain(); g.gain.value = 0; g.connect(makePanner('fp_int'));
      osc(200, 'sine', 0.55, g); osc(203, 'sine', 0.45, g);
      sounds.fp_int = { gain: g, maxGain: 0.22 }; }

    // ft_int — fuel tank: triangle at 105 Hz through low-pass (hollow resonance)
    { const g = ctx.createGain(); g.gain.value = 0; g.connect(makePanner('ft_int'));
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 105;
      const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 320;
      o.connect(lpf); lpf.connect(g); o.start();
      sounds.ft_int = { gain: g, maxGain: 0.20 }; }

    // mag1_int — magneto 1: 60 Hz AC electrical hum + harmonics
    { const g = ctx.createGain(); g.gain.value = 0; g.connect(makePanner('mag1_int'));
      [[60,0.50],[120,0.30],[180,0.15]].forEach(([f,w]) => osc(f,'sawtooth',w,g));
      sounds.mag1_int = { gain: g, maxGain: 0.18 }; }

    // mag2_int — magneto 2: 55 Hz (audibly distinct from mag1)
    { const g = ctx.createGain(); g.gain.value = 0; g.connect(makePanner('mag2_int'));
      [[55,0.50],[110,0.30],[165,0.15]].forEach(([f,w]) => osc(f,'sawtooth',w,g));
      sounds.mag2_int = { gain: g, maxGain: 0.18 }; }

    componentSounds.current = sounds;
    componentPanners.current = panners;

    // ── Ambient pad: A-minor chord through a shared gain with slow tremolo ──
    // Tremolo LFO stored in ref so the danger useEffect can speed it up.
    const padGain = ctx.createGain(); padGain.gain.value = 0.032; padGain.connect(master);
    const tremoloLFO = ctx.createOscillator(); tremoloLFO.type = 'sine'; tremoloLFO.frequency.value = 0.35;
    tremoloLFORef.current = tremoloLFO;
    const tremoloAmt = ctx.createGain(); tremoloAmt.gain.value = 0.035;
    tremoloLFO.connect(tremoloAmt); tremoloAmt.connect(padGain.gain); tremoloLFO.start();
    [110.0, 110.3, 130.8, 131.1, 164.8, 165.1].forEach((freq) => osc(freq, 'triangle', 0.032, padGain));

    // ── Danger rumble drone: low sawtooth harmonics, silent at start ──
    // Fades in as topProb rises above 0.5 — sounds like impending engine failure.
    { const dg = ctx.createGain(); dg.gain.value = 0; dg.connect(master);
      [[38,0.50],[76,0.30],[114,0.15]].forEach(([f,w]) => osc(f,'sawtooth',w,dg));
      dangerGainRef.current = dg; }

    // ── Melodic arpeggio: slow A-minor pentatonic loop, sine tone with envelope ──
    // Routed through melodyGain so the danger effect can fade it out above p=0.5.
    const melodyGain = ctx.createGain(); melodyGain.gain.value = 1; melodyGain.connect(master);
    melodyGainRef.current = melodyGain;
    const melodyNotes = [110, 130.8, 164.8, 196.0, 220.0, 196.0, 164.8, 130.8];
    function fireMelodyNote() {
      if (!audioContext.current || audioContext.current.state === 'closed') return;
      const ac = audioContext.current;
      const t = ac.currentTime;
      const freq = melodyNotes[melodyIndexRef.current % melodyNotes.length];
      melodyIndexRef.current += 1;
      const mo = ac.createOscillator(); mo.type = 'sine'; mo.frequency.value = freq;
      const mg = ac.createGain(); mg.gain.setValueAtTime(0, t);
      mg.gain.linearRampToValueAtTime(0.08, t + 0.04);
      mg.gain.setValueAtTime(0.08, t + 0.28);
      mg.gain.exponentialRampToValueAtTime(0.001, t + 0.68);
      mo.connect(mg); mg.connect(melodyGainRef.current);
      mo.start(t); mo.stop(t + 0.72);
      melodySchedulerRef.current = setTimeout(fireMelodyNote, 700);
    }
    fireMelodyNote();

    // ── Heartbeat pulse: tempo driven by beatIntervalRef ──
    function fireBeat() {
      if (!audioContext.current || audioContext.current.state === 'closed') return;
      const ac = audioContext.current;
      const t = ac.currentTime;
      const ko = ac.createOscillator(); ko.type = 'sine';
      ko.frequency.setValueAtTime(90, t);
      ko.frequency.exponentialRampToValueAtTime(28, t + 0.20);
      const ke = ac.createGain();
      ke.gain.setValueAtTime(0.55, t);
      ke.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      ko.connect(ke); ke.connect(masterGain.current);
      ko.start(t); ko.stop(t + 0.28);
      beatSchedulerRef.current = setTimeout(fireBeat, beatIntervalRef.current);
    }
    fireBeat();

    return () => {
      if (beatSchedulerRef.current) clearTimeout(beatSchedulerRef.current);
      if (melodySchedulerRef.current) clearTimeout(melodySchedulerRef.current);
      ctx.close();
    };
  }, []);

  /**
   * Component sound volume effect — runs whenever any node probability changes.
   * Maps each basic event's probability directly to its sound layer's gain:
   *   volume = probability × maxGain
   * At p=0 the sound is silent; at p=1 it plays at full component volume.
   * Each component has a distinct acoustic signature (see audio init above).
   */
  useEffect(() => {
    const sounds = componentSounds.current;
    Object.values(nodes).forEach((node) => {
      if (node.type !== 'basic') return;
      const s = sounds[node.id];
      if (s) s.gain.gain.value = node.probability * s.maxGain;
    });
  }, [nodes]);

  /**
   * Audio toggle effect — mutes or unmutes the master gain node.
   * Uses a direct .value assignment (not the Web Audio scheduling API)
   * so the change takes effect immediately with no race conditions.
   */
  useEffect(() => {
    if (!masterGain.current || !audioContext.current) return;
    if (!audioEnabled) {
      masterGain.current.gain.value = 0;
    } else {
      if (audioContext.current.state === 'suspended') audioContext.current.resume();
      masterGain.current.gain.value = 0.5;
    }
  }, [audioEnabled]);

  /**
   * Danger audio effect — reacts to topProb changes across four layers:
   *
   *  1. Heartbeat tempo  — 40 BPM at p=0, 160 BPM at p=1
   *
   *  2. Danger buildup (p 0.5 → 1.0):
   *     • Low rumble drone fades in (dangerGain 0 → 0.30)
   *     • Melody fades out (melodyGain 1 → 0) — musical texture dissolves
   *     • Tremolo speeds up (0.35 Hz → 3.5 Hz) — pad becomes frantic vibrato
   *
   *  3. Engine shutdown (p ≥ 0.99):
   *     One-shot: four oscillators sweep from turboprop RPM frequencies down
   *     to near-DC over ~3.5 s; bandpass-filtered noise sweeps 400→55 Hz.
   *     Triggered once per crossing; rearms when topProb drops below 0.99.
   */
  useEffect(() => {
    const safeP = Number.isFinite(topProb) && topProb >= 0 ? topProb : 0;

    // 1. Heartbeat tempo
    beatIntervalRef.current = Math.round(60000 / (40 + safeP * 120));

    const ac = audioContext.current;
    if (!ac) return;

    // 2a. Danger rumble: silent below 0.5, reaches 0.30 at p=1
    if (dangerGainRef.current)
      dangerGainRef.current.gain.value = Math.max(0, (safeP - 0.5) * 2) * 0.30;

    // 2b. Melody fades out above 0.5 (fully silent at p=1)
    if (melodyGainRef.current)
      melodyGainRef.current.gain.value = Math.max(0, 1 - Math.max(0, (safeP - 0.5) * 2));

    // 2c. Tremolo speeds up: 0.35 Hz → 3.5 Hz
    if (tremoloLFORef.current)
      tremoloLFORef.current.frequency.value = 0.35 + safeP * 3.15;

    // 3. Engine shutdown one-shot at p ≥ 0.99
    if (safeP >= 0.99 && !shutdownTriggeredRef.current) {
      shutdownTriggeredRef.current = true;
      const t = ac.currentTime;
      // Four oscillators modelling turboprop harmonics — spool down over 3.5 s
      [[185, 0.18], [120, 0.14], [78, 0.11], [48, 0.09]].forEach(([startFreq, vol]) => {
        const o = ac.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(startFreq, t);
        o.frequency.exponentialRampToValueAtTime(startFreq * 0.07, t + 3.5);
        const g = ac.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.setValueAtTime(vol, t + 1.2);
        g.gain.exponentialRampToValueAtTime(0.001, t + 4.0);
        o.connect(g); g.connect(masterGain.current);
        o.start(t); o.stop(t + 4.1);
      });
      // Bandpass noise burst sweeping 400 Hz → 55 Hz — exhaust/wind decay
      const bufSize = ac.sampleRate * 4;
      const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ac.createBufferSource(); noise.buffer = buf;
      const bpf = ac.createBiquadFilter(); bpf.type = 'bandpass'; bpf.Q.value = 1.8;
      bpf.frequency.setValueAtTime(400, t);
      bpf.frequency.exponentialRampToValueAtTime(55, t + 3.2);
      const ng = ac.createGain();
      ng.gain.setValueAtTime(0.18, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 3.6);
      noise.connect(bpf); bpf.connect(ng); ng.connect(masterGain.current);
      noise.start(t); noise.stop(t + 3.7);
    } else if (safeP < 0.99) {
      shutdownTriggeredRef.current = false;
    }
  }, [topProb]);

  /**
   * handleProbChange — called when a basic event slider is dragged.
   * Resumes the Web Audio context (required after first user gesture on some
   * browsers), then updates the node's probability in state. If the node
   * belongs to a linked group, all group members are updated to the same value.
   */
  const handleProbChange = useCallback((id, val, linkedGroup) => {
    if (audioContext.current && audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }
    setNodes((prev) => {
      const next = { ...prev };
      next[id] = { ...next[id], probability: val };
      if (linkedGroup) linkedGroup.forEach((lid) => { if (lid !== id) next[lid] = { ...next[lid], probability: val }; });
      return next;
    });
  }, []);

  /** switchTree — loads a different fault tree model from the TREES registry. */
  const switchTree = useCallback((key) => {
    const data = TREES[key].data;
    setNodes(structuredClone(data.nodes));
    setLinked(data.linkedEvents);
    setRootId(data.rootId);
  }, []);

  /** getLinked — returns the linked-group array that contains nodeId, or []. */
  const getLinked = useCallback((id) => {
    return linked.find((g) => g.includes(id)) || [];
  }, [linked]);

  /**
   * probs — full probability map for every node in the current tree.
   * Recalculated inline on each render (fast enough for trees of this size).
   * Used to colour gates, draw Sankey lines, and display the HUD value.
   */
  const probs = (() => {
    const p = {};
    Object.values(nodes).forEach((n) => (p[n.id] = calcProb(n, nodes)));
    return p;
  })();

  /** positions — SVG coordinates for every node, recomputed when tree or mode changes. */
  const positions = useMemo(() => layoutTree(nodes, rootId, isMC && !!allRuns), [nodes, rootId, isMC, allRuns]);

  /**
   * Spatialization effect — maps each basic event's visual x position to a
   * stereo pan value so sounds appear to come from where the node sits in
   * the diagram. Runs whenever the layout changes (tree or mode switch).
   *   leftmost node  → pan = -1 (hard left)
   *   rightmost node → pan = +1 (hard right)
   *   center node    → pan ≈  0
   */
  useEffect(() => {
    const panners = componentPanners.current;
    if (!Object.keys(panners).length) return;
    const basicIds = ['cyl1_int', 'fi_int', 'fp_int', 'ft_int', 'mag1_int', 'mag2_int'];
    const xs = basicIds.map(id => positions[id]?.x).filter(x => x != null);
    if (!xs.length) return;
    const minX = Math.min(...xs);
    const range = Math.max(...xs) - minX || 1;
    basicIds.forEach(id => {
      const p = panners[id]; const pos = positions[id];
      if (!p || !pos) return;
      p.pan.value = ((pos.x - minX) / range) * 2 - 1;
    });
  }, [positions]);

  /**
   * viewBox — auto-fit SVG viewBox string derived from node positions.
   * Adds padding so no node is clipped at the edges.
   */
  const viewBox = useMemo(() => {
    const all = Object.values(positions);
    if (!all.length) return "0 0 800 600";
    const pad = 80;
    const minX = Math.min(...all.map((p) => p.x - p.w / 2)) - pad;
    const maxX = Math.max(...all.map((p) => p.x + p.w / 2)) + pad;
    const minY = Math.min(...all.map((p) => p.y - 30)) - pad;
    const maxY = Math.max(...all.map((p) => p.y + p.h + 30)) + pad;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [positions]);

  /**
   * mcPerNode — per-node Monte Carlo summary for the currently visible runs.
   * Returns { [nodeId]: { runs: boolean[], failures: number } } or null.
   * Recomputed whenever visibleRuns advances so DotGrids update incrementally.
   */
  const mcPerNode = useMemo(() => {
    if (!allRuns || visibleRuns === 0) return null;
    const result = {};
    const ids = Object.keys(nodes);
    ids.forEach((id) => (result[id] = { runs: [], failures: 0 }));
    for (let r = 0; r < visibleRuns && r < allRuns.length; r++) {
      const st = allRuns[r];
      ids.forEach((id) => {
        const f = st[id] || false;
        result[id].runs.push(f);
        if (f) result[id].failures++;
      });
    }
    return result;
  }, [allRuns, visibleRuns, nodes]);

  /**
   * startMC — pre-computes all simulation runs upfront, then starts
   * the animation from run 0. Runs are revealed one at a time by the
   * animation effect below, at the interval set by animSpeed.
   */
  const startMC = useCallback(() => {
    const runs = generateAllRuns(nodes, rootId, mcNumRuns);
    setAllRuns(runs);
    setVisibleRuns(0);
    setIsAnimating(true);
  }, [nodes, rootId, mcNumRuns]);

  /** stopAnim — pauses the Monte Carlo animation without discarding results. */
  const stopAnim = useCallback(() => {
    setIsAnimating(false);
    if (animRef.current) { clearTimeout(animRef.current); animRef.current = null; }
  }, []);

  /** resetMC — clears all Monte Carlo results and stops animation. */
  const resetMC = useCallback(() => {
    stopAnim();
    setAllRuns(null);
    setVisibleRuns(0);
  }, [stopAnim]);

  /**
   * MC animation tick — increments visibleRuns by 1 every animSpeed ms.
   * Stops automatically when all runs have been revealed.
   */
  useEffect(() => {
    if (!isAnimating || !allRuns) return;
    if (visibleRuns >= allRuns.length) { setIsAnimating(false); return; }
    animRef.current = setTimeout(() => setVisibleRuns((v) => v + 1), animSpeed);
    return () => { if (animRef.current) clearTimeout(animRef.current); };
  }, [isAnimating, visibleRuns, allRuns, animSpeed]);

  // ── Canvas pan and zoom handlers ──
  /** onWheel — zoom in/out with scroll wheel, clamped to 0.15×–5×. */
  const onWheel = useCallback((e) => {
    e.preventDefault();
    setTransform((t) => ({ ...t, scale: Math.max(0.15, Math.min(5, t.scale * (e.deltaY > 0 ? 0.93 : 1.07))) }));
  }, []);
  const onPointerDown = useCallback((e) => {
    if (e.target.closest(".no-pan")) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform]);
  const onPointerMove = useCallback((e) => {
    if (!isPanning.current) return;
    setTransform((t) => ({ ...t, x: panStart.current.tx + (e.clientX - panStart.current.x), y: panStart.current.ty + (e.clientY - panStart.current.y) }));
  }, []);
  const onPointerUp = useCallback(() => { isPanning.current = false; }, []);

  const resetProbs = useCallback(() => {
    const treeData = TREES[treeKey]?.data || SMALL_AIRPLANE_ENGINE;
    const freshNodes = structuredClone(treeData.nodes);
    Object.keys(freshNodes).forEach((id) => {
      if (freshNodes[id].type === "basic") freshNodes[id].probability = 0.5;
    });
    setNodes(freshNodes);
    setLinked(treeData.linkedEvents || []);
    setRootId(treeData.rootId);
    setAllRuns(null);
    setVisibleRuns(0);
    setIsAnimating(false);
  }, [treeKey]);

  /**
   * handleImport — parses a custom fault tree from JSON pasted into the
   * import modal. Expected format:
   *   { "rootId": "top", "nodes": { ... }, "linkedEvents": [] }
   * On success the current tree is replaced and the view resets to origin.
   */
  const handleImport = useCallback(() => {
    try {
      const parsed = JSON.parse(importJson);
      if (!parsed.nodes || !parsed.rootId) { alert("JSON needs 'nodes' and 'rootId'."); return; }
      setNodes(structuredClone(parsed.nodes));
      setLinked(parsed.linkedEvents || []);
      setRootId(parsed.rootId);
      resetMC();
      setTreeKey("custom");
      setShowImport(false);
      setImportJson("");
      setTransform({ x: 0, y: 0, scale: 1 });
    } catch (err) { alert("Invalid JSON: " + err.message); }
  }, [importJson, resetMC]);

  // ── Derived render values ──
  /** topP — exact calculated probability of the top (root) failure event. */
  const topP = probs[rootId] || 0;
  /** topMCR — empirical Monte Carlo failure rate for the root (failures / visible runs). */
  const topMCR = mcPerNode && visibleRuns > 0 ? mcPerNode[rootId].failures / visibleRuns : null;
  /** showMC — true only when MC mode is active AND at least one run has been computed. */
  const showMC = isMC && !!allRuns;

  /** S — inline style objects for all layout regions (avoids separate CSS files). */
  const S = {
    root: { width: "100%", height: "100vh", display: "flex", flexDirection: "column", background: "#f9fafb", fontFamily: "system-ui, sans-serif", color: "#111827", overflow: "hidden" },
    header: { background: "#fff", borderBottom: "1px solid #e5e7eb", zIndex: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" },
    headerInner: { maxWidth: 1400, margin: "0 auto", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" },
    iconBtn: { width: 28, height: 28, borderRadius: "50%", border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
    toolbar: { display: "flex", alignItems: "center", gap: 8, padding: "5px 16px", background: "#fff", borderBottom: "1px solid #e5e7eb", flexWrap: "wrap", zIndex: 18 },
    tg: { display: "flex", alignItems: "center", gap: 4 },
    tl: { fontSize: 9, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 2 },
    sep: { width: 1, height: 20, background: "#e5e7eb" },
    btn: { padding: "3px 10px", borderRadius: 5, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
    btnOn: { background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" },
    sel: { padding: "3px 6px", borderRadius: 5, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 11 },
    canvas: { flex: 1, position: "relative", overflow: "hidden" },
    dotsBg: { position: "absolute", inset: 0, opacity: 0.3, pointerEvents: "none", backgroundImage: "radial-gradient(#d1d5db 1px, transparent 1px)", backgroundSize: "20px 20px" },
    hud: { position: "absolute", top: 12, right: 12, padding: "12px 16px", background: "rgba(255,255,255,0.96)", borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", minWidth: 180, backdropFilter: "blur(6px)" },
    hudBar: { marginTop: 4, height: 4, borderRadius: 2, background: "#e5e7eb", overflow: "hidden" },
    zoom: { position: "absolute", bottom: 12, right: 12, display: "flex", flexDirection: "column", gap: 3 },
    zBtn: { width: 30, height: 30, borderRadius: 6, border: "1px solid #d1d5db", background: "rgba(255,255,255,0.96)", color: "#374151", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
    modal: { width: "90%", maxWidth: 520, background: "#fff", borderRadius: 10, padding: 20, border: "1px solid #e5e7eb", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" },
    ta: { width: "100%", height: 150, background: "#f9fafb", border: "1px solid #d1d5db", borderRadius: 6, color: "#111827", fontFamily: "monospace", fontSize: 11, padding: 10, resize: "vertical", boxSizing: "border-box" },
  };

  return (
    <div style={S.root}>
      {/* HEADER */}
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/acoustiTreeLogo.png" alt="AcoustiTree Logo" style={{ width: 48, height: 48, objectFit: "contain" }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", letterSpacing: -0.4 }}>Fault Tree Visualization</div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>Goku Fault Tree AudioVisual Project</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ display: "flex", border: "1px solid #d1d5db", borderRadius: 7, overflow: "hidden" }}>
              <button
                onClick={() => setAudioEnabled(false)}
                style={{ padding: "4px 12px", border: "none", borderRight: "1px solid #d1d5db", background: !audioEnabled ? "#f1f5f9" : "#fff", color: !audioEnabled ? "#1e40af" : "#6b7280", fontSize: 12, fontWeight: !audioEnabled ? 700 : 600, cursor: "pointer" }}
              >
                👁 Visual Only
              </button>
              <button
                onClick={() => setAudioEnabled(true)}
                style={{ padding: "4px 12px", border: "none", background: audioEnabled ? "#eff6ff" : "#fff", color: audioEnabled ? "#1d4ed8" : "#6b7280", fontSize: 12, fontWeight: audioEnabled ? 700 : 600, cursor: "pointer" }}
              >
                🔊 AudioVisual
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* TOOLBAR */}
      <div style={S.toolbar}>
        <div style={S.tg}>
          <span style={S.tl}>Tree</span>
          {Object.entries(TREES).map(([k, v]) => (
            <button key={k} style={treeKey === k ? { ...S.btn, ...S.btnOn } : S.btn} onClick={() => switchTree(k)}>{v.name}</button>
          ))}
        </div>
        <div style={S.sep} />
        <div style={S.tg}>
          <span style={S.tl}>Mode</span>
          <button style={mode === "prob" ? { ...S.btn, ...S.btnOn } : S.btn} onClick={() => { setMode("prob"); resetMC(); }}>Probabilistic</button>
        </div>
        <div style={{ flex: 1 }} />
        <button style={S.btn} onClick={resetProbs}>Reset P=0.5</button>
      </div>

      {/* CANVAS */}
      <div style={S.canvas} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <div style={S.dotsBg} />
        <svg width="100%" height="100%" viewBox={viewBox} style={{ transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`, transformOrigin: "center", cursor: isPanning.current ? "grabbing" : "grab" }} preserveAspectRatio="xMidYMid meet">

          {/* Connections */}
          {Object.values(nodes).filter((n) => n.type === "gate").map((gate) =>
            gate.children.map((cid) => {
              const gp = positions[gate.id];
              const cp = positions[cid];
              if (!gp || !cp) return null;
              return <SankeyLine key={`${gate.id}-${cid}`} x1={gp.x} y1={gp.y + gp.h / 2 + 6} x2={cp.x} y2={cp.y - 24} prob={probs[cid] || 0} />;
            })
          )}

          {/* Linked dashes */}
          {linked.map((group, gi) =>
            group.slice(0, -1).map((id, i) => {
              const p1 = positions[id]; const p2 = positions[group[i + 1]];
              if (!p1 || !p2) return null;
              return <line key={`lnk-${gi}-${i}`} x1={p1.x} y1={p1.y + 10} x2={p2.x} y2={p2.y + 10} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" />;
            })
          )}

          {/* Gate labels + shapes */}
          {Object.values(nodes).filter((n) => n.type === "gate").map((node) => {
            const p = positions[node.id];
            if (!p) return null;
            return (
              <g key={node.id}>
                <rect x={p.x - 72} y={p.y - 24} width={144} height={17} rx="4" fill="rgba(255,255,255,0.92)" stroke="#d1d5db" strokeWidth="0.6" />
                <text x={p.x} y={p.y - 11} textAnchor="middle" fill="#374151" fontSize="10.5" fontWeight="600" fontFamily="system-ui">{node.label}</text>
                <GateVis node={node} cx={p.x} cy={p.y + p.h / 2} prob={probs[node.id] || 0} mcData={mcPerNode?.[node.id]} visibleCount={visibleRuns} isMC={showMC} totalRuns={mcNumRuns} />
              </g>
            );
          })}

          {/* Basic events */}
          {Object.values(nodes).filter((n) => n.type === "basic").map((node) => {
            const p = positions[node.id];
            if (!p) return null;
            return (
              <g key={node.id} className="no-pan">
                <BasicEventVis node={node} x={p.x} y={p.y} w={p.w} h={p.h} prob={node.probability} isMC={showMC} mcData={mcPerNode?.[node.id]} visibleCount={visibleRuns} totalRuns={mcNumRuns} onProbChange={handleProbChange} linked={getLinked(node.id)} />
              </g>
            );
          })}
        </svg>

        <div style={S.zoom}>
          <button style={S.zBtn} onClick={() => setTransform((t) => ({ ...t, scale: Math.min(5, t.scale * 1.25) }))}>+</button>
          <button style={S.zBtn} onClick={() => setTransform((t) => ({ ...t, scale: Math.max(0.15, t.scale / 1.25) }))}>−</button>
          <button style={S.zBtn} onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}>⌂</button>
        </div>

      </div>

      {/* IMPORT */}
      {showImport && (
        <div style={S.overlay} onClick={() => setShowImport(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>Import Custom Fault Tree</h3>
            <textarea style={S.ta} value={importJson} onChange={(e) => setImportJson(e.target.value)}
              placeholder={`{\n  "rootId": "top",\n  "nodes": {\n    "top": {"id":"top","type":"gate","gateType":"OR","label":"System","children":["a","b"]},\n    "a": {"id":"a","type":"basic","label":"A","probability":0.3},\n    "b": {"id":"b","type":"basic","label":"B","probability":0.2}\n  }\n}`} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
              <button style={S.btn} onClick={() => setShowImport(false)}>Cancel</button>
              <button style={{ ...S.btn, background: "#2563eb", color: "#fff" }} onClick={handleImport}>Import</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
