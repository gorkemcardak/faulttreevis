import { useState, useCallback, useMemo, useRef, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════
   MATH
   ═══════════════════════════════════════════════════════════ */
function calcProb(node, nm) {
  if (node.type === "basic") return node.probability;
  const cp = node.children.map((id) => calcProb(nm[id], nm));
  if (node.gateType === "AND") return cp.reduce((a, b) => a * b, 1);
  if (node.gateType === "OR") return 1 - cp.reduce((a, b) => a * (1 - b), 1);
  let pOk = 0;
  for (let f = 0; f < node.k; f++) pOk += combP(cp, f);
  return 1 - pOk;
}
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
function getCombos(a, k) {
  if (k === 0) return [[]];
  if (!a.length) return [];
  const [f, ...r] = a;
  return [...getCombos(r, k - 1).map((c) => [f, ...c]), ...getCombos(r, k)];
}

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
   TREES
   ═══════════════════════════════════════════════════════════ */
const SMALL_AIRPLANE_ENGINE = {
  rootId: "root",
  linkedEvents: [],
  nodes: {
    root: { id: "root", type: "gate", gateType: "OR", label: "Cylinder 1 Fails to Provide Mech. Force", children: ["fi_gate"] },
    fi_gate: { id: "fi_gate", type: "gate", gateType: "OR", label: "Fuel Injector Fails to Inject fuel", children: ["fi_int", "fp_gate"] },
    fi_int: { id: "fi_int", type: "basic", label: "Fuel Injector Internal", probability: 0.05 },
    fp_gate: { id: "fp_gate", type: "gate", gateType: "OR", label: "Fuel Pump Fails to Pump fuel out", children: ["ft_gate", "mag_and", "fp_int"] },
    fp_int: { id: "fp_int", type: "basic", label: "Fuel Pump Internal", probability: 0.08 },
    ft_gate: { id: "ft_gate", type: "gate", gateType: "OR", label: "Fuel Tank Fails to Provide fuel", children: ["ft_int"] },
    ft_int: { id: "ft_int", type: "basic", label: "Fuel Tank Internal", probability: 0.03 },
    mag_and: { id: "mag_and", type: "gate", gateType: "AND", label: "Both Magnetos Fail", children: ["mag1", "mag2"] },
    mag1: { id: "mag1", type: "gate", gateType: "OR", label: "Magneto 1 Fails to Produce electricity", children: ["mag1_int"] },
    mag1_int: { id: "mag1_int", type: "basic", label: "Magneto 1 Internal", probability: 0.15 },
    mag2: { id: "mag2", type: "gate", gateType: "OR", label: "Magneto 2 Fails to Produce electricity", children: ["mag2_int"] },
    mag2_int: { id: "mag2_int", type: "basic", label: "Magneto 2 Internal", probability: 0.15 },
  },
};
const TREES = {
  airplane: { name: "Small Airplane Engine", data: SMALL_AIRPLANE_ENGINE },
};

/* ═══════════════════════════════════════════════════════════
   LAYOUT
   ═══════════════════════════════════════════════════════════ */
const BASIC_W = 160;
const BASIC_H_PROB = 84;
const BASIC_H_MC = 160;
const GATE_W = 100;
const GATE_H = 76;
const H_GAP = 28;
const V_GAP = 105;

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
   DOT GRID
   ═══════════════════════════════════════════════════════════ */
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
   GATE SHAPE
   ═══════════════════════════════════════════════════════════ */
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

      {/* Type + val */}
      {!isMC && (
        <>
          <text x={cx} y={cy - 2} textAnchor="middle" fill="#1f2937" fontSize="15" fontWeight="900" fontFamily="monospace" opacity="0.85">
            {node.gateType === "KN" ? `k/N` : node.gateType}
          </text>
          <text x={cx} y={cy + 15} textAnchor="middle" fill="#1f2937" fontSize="12" fontWeight="700" fontFamily="monospace" opacity="0.7">
            {prob.toFixed(2)}
          </text>
        </>
      )}

      {/* R= P= */}
      {isMC && mcR !== null && (
        <g>
          <text x={r + 8} y={cy - 4} textAnchor="start" fill="#111827" fontSize="15" fontWeight="800" fontFamily="monospace">R={mcR.toFixed(2)}</text>
          <text x={r + 8} y={cy + 14} textAnchor="start" fill="#9ca3af" fontSize="12" fontWeight="600" fontFamily="monospace">P={prob.toFixed(2)}</text>
        </g>
      )}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════
   BASIC EVENT
   ═══════════════════════════════════════════════════════════ */
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
      svgPoint.y = e.clientY; // though not used
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
        </g>
      ) : (
        /* ── Prob mode ── */
        <g>
          {/* Bar */}
          <rect x={barX} y={cY + 8} width={barW * currentProb} height={34} rx="4" fill="#f87171" />
          <rect x={barX + barW * currentProb} y={cY + 8} width={barW * (1 - currentProb)} height={34} rx="4" fill="#4ade80" />
          <text x={x} y={cY + 30} textAnchor="middle" fill="#111827" fontSize="16" fontWeight="800" fontFamily="monospace">{currentProb.toFixed(2)}</text>
        </g>
      )}

      {/* Slider */}
      <rect x={barX} y={sliderY} width={barW} height="5" rx="2.5" fill="#e5e7eb" />
      <rect x={barX} y={sliderY} width={barW * currentProb} height="5" rx="2.5" fill="#3b82f6" />
      <circle cx={barX + barW * currentProb} cy={sliderY + 2.5} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2.5"
        style={{ cursor: "pointer", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />

      <text x={x} y={sliderY + 22} textAnchor="middle" fill="#6b7280" fontSize="12" fontWeight="700" fontFamily="monospace">P={currentProb.toFixed(2)}</text>

      {/* Drag area */}
      <rect x={barX - 10} y={sliderY - 12} width={barW + 20} height="30" fill="transparent" style={{ cursor: "pointer" }}
        onMouseDown={startDrag} className="no-pan" />
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════
   CONNECTION
   ═══════════════════════════════════════════════════════════ */
function SankeyLine({ x1, y1, x2, y2, prob }) {
  const thickness = Math.max(4, prob * 22);
  const alpha = 0.15 + prob * 0.45;
  const cp1y = y1 + (y2 - y1) * 0.38;
  const cp2y = y1 + (y2 - y1) * 0.62;
  return (
    <path
      d={`M${x1} ${y1} C${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`}
      fill="none"
      stroke={`rgba(248,113,113,${alpha})`}
      strokeWidth={thickness}
      strokeLinecap="round"
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════ */
export default function App() {
  const [treeKey, setTreeKey] = useState("airplane");
  const [nodes, setNodes] = useState(() => structuredClone(SMALL_AIRPLANE_ENGINE.nodes));
  const [linked, setLinked] = useState(SMALL_AIRPLANE_ENGINE.linkedEvents);
  const [rootId, setRootId] = useState(SMALL_AIRPLANE_ENGINE.rootId);
  const [mode, setMode] = useState("prob");
  const [mcNumRuns, setMcNumRuns] = useState(100);
  const [showInfo, setShowInfo] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [allRuns, setAllRuns] = useState(null);
  const [visibleRuns, setVisibleRuns] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(80);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const audioContext = useRef(null);
  const oscillator = useRef(null);
  const gainNode = useRef(null);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const isPanning = useRef(false);
  const animRef = useRef(null);

  const maxProb = useMemo(() => Math.max(...Object.values(nodes).filter(n => n.type === 'basic').map(n => n.probability)), [nodes]);

  const isMC = mode === "mc";

  useEffect(() => {
    audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
    gainNode.current = audioContext.current.createGain();
    gainNode.current.connect(audioContext.current.destination);
    oscillator.current = audioContext.current.createOscillator();
    oscillator.current.type = 'sawtooth';
    oscillator.current.frequency.setValueAtTime(220, audioContext.current.currentTime);
    oscillator.current.connect(gainNode.current);
    gainNode.current.gain.setValueAtTime(audioEnabled ? 0.02 : 0, audioContext.current.currentTime);
    oscillator.current.start();
    return () => {
      if (oscillator.current) oscillator.current.stop();
    };
  }, []);

  useEffect(() => {
    if (!audioEnabled) {
      if (gainNode.current) gainNode.current.gain.setValueAtTime(0, audioContext.current.currentTime);
      return;
    }
    if (audioContext.current && audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }
    const safeMax = Number.isFinite(maxProb) && maxProb > 0 ? maxProb : 0.01;
    const targetRate = safeMax < 0.25 ? 1 : 1 + (safeMax - 0.25) * 4;
    const targetGain = Math.max(0.001, safeMax < 0.25 ? 0.02 : 0.05 + (safeMax - 0.25) * 0.1);
    if (oscillator.current) {
      oscillator.current.frequency.exponentialRampToValueAtTime(Math.max(1, 220 * targetRate), audioContext.current.currentTime + 0.1);
    }
    if (gainNode.current) {
      gainNode.current.gain.exponentialRampToValueAtTime(targetGain, audioContext.current.currentTime + 0.1);
    }
  }, [maxProb, audioEnabled]);

  const handleProbChange = useCallback((id, val, linkedGroup) => {
    if (audioEnabled && audioContext.current && audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }
    setNodes((prev) => {
      const next = { ...prev };
      next[id] = { ...next[id], probability: val };
      if (linkedGroup) linkedGroup.forEach((lid) => { if (lid !== id) next[lid] = { ...next[lid], probability: val }; });
      return next;
    });
  }, [audioEnabled]);

  const switchTree = useCallback((key) => {
    const data = TREES[key].data;
    setNodes(structuredClone(data.nodes));
    setLinked(data.linkedEvents);
    setRootId(data.rootId);
  }, []);

  const getLinked = useCallback((id) => {
    return linked.find((g) => g.includes(id)) || [];
  }, [linked]);

  const probs = (() => {
    const p = {};
    Object.values(nodes).forEach((n) => (p[n.id] = calcProb(n, nodes)));
    return p;
  })();

  const positions = useMemo(() => layoutTree(nodes, rootId, isMC && !!allRuns), [nodes, rootId, isMC, allRuns]);

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

  const startMC = useCallback(() => {
    const runs = generateAllRuns(nodes, rootId, mcNumRuns);
    setAllRuns(runs);
    setVisibleRuns(0);
    setIsAnimating(true);
  }, [nodes, rootId, mcNumRuns]);

  const stopAnim = useCallback(() => {
    setIsAnimating(false);
    if (animRef.current) { clearTimeout(animRef.current); animRef.current = null; }
  }, []);

  const resetMC = useCallback(() => {
    stopAnim();
    setAllRuns(null);
    setVisibleRuns(0);
  }, [stopAnim]);

  useEffect(() => {
    if (!isAnimating || !allRuns) return;
    if (visibleRuns >= allRuns.length) { setIsAnimating(false); return; }
    animRef.current = setTimeout(() => setVisibleRuns((v) => v + 1), animSpeed);
    return () => { if (animRef.current) clearTimeout(animRef.current); };
  }, [isAnimating, visibleRuns, allRuns, animSpeed]);

  // Pan/zoom
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

  const topP = probs[rootId] || 0;
  const topMCR = mcPerNode && visibleRuns > 0 ? mcPerNode[rootId].failures / visibleRuns : null;
  const showMC = isMC && !!allRuns;

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
            {/* AcoustiTree Logo */}
            <img src="/acoustiTreeLogo.png" alt="acoustiTreeLogo" style={{ width: 120, height: 80, objectFit: "contain", marginRight: 8 }} />
            <svg width="26" height="26" viewBox="0 0 26 26"><rect x="1" y="1" width="24" height="24" rx="5" fill="#dc2626" /><path d="M6.5 18 L6.5 11 Q6.5 7 13 7 Q19.5 7 19.5 11 L19.5 18" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /><line x1="13" y1="7" x2="13" y2="3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", letterSpacing: -0.4 }}>Fault Tree Visualization</div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>Goku Fault Tree AudioVisual Project</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button onClick={() => setAudioEnabled((v) => !v)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: audioEnabled ? "#eff6ff" : "#f9fafb", color: audioEnabled ? "#1d4ed8" : "#6b7280", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <img src="/acoustiTreeLogo.png" alt="Logo" style={{ width: 24, height: 24, objectFit: "contain", marginRight: 4 }} />
              {audioEnabled ? "🔊 Audio On" : "🔇 Visual Only"}
            </button>
            <button onClick={() => setShowInfo(!showInfo)} style={S.iconBtn}>{showInfo ? "✕" : "?"}</button>
          </div>
        </div>
      </header>

      {showInfo && (
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 16px", zIndex: 19 }}>
          <div style={{ maxWidth: 900, margin: "0 auto", fontSize: 12, color: "#4b5563", lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#111827", fontSize: 13 }}>How Fault Trees Work</p>
            <p style={{ margin: "0 0 6px" }}>A Fault Tree models how component failures propagate to system failure through logic gates.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "6px 0" }}>
              {[["AND", "#dc2626", "Fails if ALL children fail"], ["OR", "#ea580c", "Fails if ANY child fails"], ["k/N", "#7c3aed", "Fails if k out of N fail"]].map(([t, c, d]) => (
                <span key={t} style={{ background: "#f9fafb", padding: "3px 8px", borderRadius: 4, border: "1px solid #e5e7eb", fontSize: 11 }}>
                  <span style={{ background: c, color: "#fff", padding: "1px 6px", borderRadius: 3, fontWeight: 800, fontSize: 10, fontFamily: "monospace", marginRight: 4 }}>{t}</span>{d}
                </span>
              ))}
            </div>
            <p style={{ margin: 0 }}><b>Monte Carlo</b> animates each simulation run one by one — watch the dots fill up. <b>Probabilistic</b> shows exact calculated values.</p>
          </div>
        </div>
      )}

      {/* TOOLBAR */}
      <div style={S.toolbar}>
        <div style={S.tg}>
          <span style={S.tl}>Tree</span>
          {Object.entries(TREES).map(([k, v]) => (
            <button key={k} style={treeKey === k ? { ...S.btn, ...S.btnOn } : S.btn} onClick={() => switchTree(k)}>{v.name}</button>
          ))}
          <button style={S.btn} onClick={() => setShowImport(true)}>+ Import</button>
        </div>
        <div style={S.sep} />
        <div style={S.tg}>
          <span style={S.tl}>Mode</span>
          <button style={mode === "prob" ? { ...S.btn, ...S.btnOn } : S.btn} onClick={() => { setMode("prob"); resetMC(); }}>Probabilistic</button>
          <button style={mode === "mc" ? { ...S.btn, ...S.btnOn } : S.btn} onClick={() => { setMode("mc"); resetMC(); }}>Monte Carlo</button>
        </div>
        {isMC && (
          <>
            <div style={S.sep} />
            <div style={S.tg}>
              <span style={S.tl}>Runs</span>
              <select style={S.sel} value={mcNumRuns} onChange={(e) => { setMcNumRuns(+e.target.value); resetMC(); }}>
                {[50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span style={S.tl}>Speed</span>
              <select style={S.sel} value={animSpeed} onChange={(e) => setAnimSpeed(+e.target.value)}>
                {[[200, "Slow"], [80, "Normal"], [30, "Fast"], [5, "Instant"]].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              {!isAnimating ? (
                <button style={{ ...S.btn, background: "#16a34a", color: "#fff", borderColor: "#15803d" }} onClick={startMC}>▶ {allRuns ? "Restart" : "Run"}</button>
              ) : (
                <button style={{ ...S.btn, background: "#dc2626", color: "#fff", borderColor: "#b91c1c" }} onClick={stopAnim}>⏸ Pause</button>
              )}
              {allRuns && !isAnimating && visibleRuns < allRuns.length && (
                <button style={{ ...S.btn, background: "#2563eb", color: "#fff", borderColor: "#1d4ed8" }} onClick={() => setIsAnimating(true)}>▶ Resume</button>
              )}
              {allRuns && <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "#374151", marginLeft: 4 }}>{visibleRuns}/{allRuns.length}</span>}
            </div>
          </>
        )}
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

        {/* HUD */}
        <div style={S.hud}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>System Failure</div>
          <div style={{ fontSize: 26, fontWeight: 900, fontFamily: "monospace", color: "#111827", letterSpacing: -1 }}>P={topP.toFixed(4)}</div>
          <div style={S.hudBar}><div style={{ height: "100%", borderRadius: 2, background: "#dc2626", transition: "width 0.15s", width: `${topP * 100}%` }} /></div>
          {showMC && topMCR !== null && visibleRuns > 0 && (
            <>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "monospace", color: "#ea580c", marginTop: 4 }}>R={topMCR.toFixed(4)}</div>
              <div style={S.hudBar}><div style={{ height: "100%", borderRadius: 2, background: "#ea580c", transition: "width 0.15s", width: `${topMCR * 100}%` }} /></div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2, fontFamily: "monospace" }}>{mcPerNode[rootId].failures}/{visibleRuns} failed</div>
            </>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 11, color: "#6b7280" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#22c55e", marginRight: 3, verticalAlign: "middle" }} />OK</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#dc2626", marginRight: 3, verticalAlign: "middle" }} />Fail</span>
          </div>
        </div>

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