// ─────────────────────────────────────────────────────────────────────────
// Shared atoms: icons, token badges, sparkline, APY chip
// ─────────────────────────────────────────────────────────────────────────
const { useState, useMemo, useEffect, useRef } = React;

// Line icons in the st0x stroke style (1.5–2 stroke, currentColor)
function Icon({ name, className = 'h-5 w-5', stroke = 1.6 }) {
  const p = {
    fill: 'none', stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  const paths = {
    shield: <path {...p} d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
    unlock: <><rect {...p} x="4.5" y="11" width="15" height="9" rx="1.5" /><path {...p} d="M8 11V8a4 4 0 017.4-2" /></>,
    bolt: <path {...p} d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" />,
    blocks: <><rect {...p} x="3.5" y="3.5" width="7" height="7" rx="1" /><rect {...p} x="13.5" y="3.5" width="7" height="7" rx="1" /><rect {...p} x="3.5" y="13.5" width="7" height="7" rx="1" /><rect {...p} x="13.5" y="13.5" width="7" height="7" rx="1" /></>,
    arrowRight: <path {...p} d="M5 12h14M13 6l6 6-6 6" />,
    arrowUpRight: <path {...p} d="M7 17L17 7M9 7h8v8" />,
    trendUp: <path {...p} d="M3 17l6-6 4 4 8-8M21 7h-5m5 0v5" />,
    sprout: <><path {...p} d="M12 20v-8" /><path {...p} d="M12 12c0-3 2.5-5 6-5 0 3-2.5 5-6 5z" /><path {...p} d="M12 13c0-2.5-2-4.5-5-4.5 0 2.5 2 4.5 5 4.5z" /></>,
    check: <path {...p} d="M5 13l4 4L19 7" />,
    plus: <path {...p} d="M12 5v14M5 12h14" />,
    minus: <path {...p} d="M5 12h14" />,
    close: <path {...p} d="M6 6l12 12M6 18L18 6" />,
    info: <><circle {...p} cx="12" cy="12" r="9" /><path {...p} d="M12 11v5M12 8h.01" /></>,
    coins: <><ellipse {...p} cx="9" cy="7" rx="5.5" ry="2.5" /><path {...p} d="M3.5 7v5c0 1.4 2.5 2.5 5.5 2.5" /><path {...p} d="M3.5 12v3c0 1.4 2.5 2.5 5.5 2.5" /><ellipse {...p} cx="15" cy="14" rx="5.5" ry="2.5" /><path {...p} d="M9.5 14.5v5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-5" /></>,
    chart: <><path {...p} d="M4 4v16h16" /><path {...p} d="M7 14l3-3 3 2 5-6" /></>,
    bank: <><path {...p} d="M3 9l9-5 9 5" /><path {...p} d="M5 9v8M19 9v8M9 9v8M15 9v8" /><path {...p} d="M3 20h18" /></>,
    lock: <><rect {...p} x="4.5" y="11" width="15" height="9" rx="1.5" /><path {...p} d="M8 11V8a4 4 0 018 0v3" /></>,
    clock: <><circle {...p} cx="12" cy="12" r="9" /><path {...p} d="M12 7v5l3 2" /></>,
    wallet: <><rect {...p} x="3" y="6" width="18" height="13" rx="2" /><path {...p} d="M3 10h18M16 14h2" /></>,
    swap: <path {...p} d="M7 8h11l-3-3M17 16H6l3 3" />,
    arrowDown: <path {...p} d="M12 5v14M6 13l6 6 6-6" />,
    chevronDown: <path {...p} d="M6 9l6 6 6-6" />,
  };
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true">{paths[name] || null}</svg>;
}

// Token disc — uses brand color initials (no external asset dependency)
function TokenDisc({ token, size = 36, ring = false }) {
  const t = TOKENS[token] || { sym: token, color: '#666' };
  const isUsdc = t.sym === 'USDC';
  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: size, height: size, fontSize: size * 0.34,
        background: isUsdc
          ? 'radial-gradient(circle at 30% 25%, #3b8ff0, #2775CA)'
          : 'radial-gradient(circle at 30% 25%, #34d399, #059669)',
        color: '#fff',
        boxShadow: ring ? `0 0 0 3px rgba(16,185,129,.18)` : 'inset 0 1px 0 rgba(255,255,255,.25)',
      }}
    >
      {isUsdc ? '$' : <Icon name="bank" className="h-1/2 w-1/2" stroke={1.8} />}
    </div>
  );
}

// Monotonic sparkline for SGOV accretion
function Sparkline({ data, w = 120, h = 36, color = '#34d399', fill = true }) {
  const { d, area } = useMemo(() => {
    const min = Math.min(...data), max = Math.max(...data);
    const sx = w / (data.length - 1), sy = (h - 4) / (max - min || 1);
    const pts = data.map((v, i) => [i * sx, h - 2 - (v - min) * sy]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    return { d: line, area: `${line} L${w},${h} L0,${h} Z` };
  }, [data, w, h]);
  const id = useMemo(() => 'sg' + Math.random().toString(36).slice(2, 7), []);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="overflow-visible" style={{ width: w, height: h }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Live APY chip — the recurring "Save & Earn" signature
function ApyChip({ value = APY, size = 'sm', live = true }) {
  const big = size === 'lg';
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-400/10 font-semibold text-emerald-300 ${
        big ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'
      }`}
    >
      {live && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70"></span><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400"></span></span>}
      {value.toFixed(2)}% APY
    </span>
  );
}

// Counting number that animates up (for "earned to date")
function CountUp({ value, prefix = '$', decimals = 2, className = '', live = false }) {
  const [v, setV] = useState(0);
  const ref = useRef();
  useEffect(() => {
    const start = performance.now(), dur = 900, from = ref.current ?? 0;
    let raf;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setV(from + (value - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else ref.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  // optional slow live drip
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setV((x) => x + value * 0.0000004), 80);
    return () => clearInterval(id);
  }, [live, value]);
  return <span className={className}>{prefix}{v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
}

function fmt(n, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// Asset disc for equities — initials on a deterministic brand-ish gradient.
// Special-cases the Savings token (mint, bank glyph) and USDC ($).
const ASSET_COLORS = {
  tNVDA: ['#9aa6ff', '#4d3bd8'], tTSLA: ['#ff8d8d', '#d83b3b'], tCOIN: ['#6fa8ff', '#1a56db'],
  tMSTR: ['#ffb877', '#f08a1d'], tAAPL: ['#cfd6df', '#8a94a3'], tMETA: ['#6fb3ff', '#2b6fe0'],
  tSPYM: ['#ff9d6f', '#e0512b'], tQQQM: ['#7fd1ff', '#1d8fe0'], tSIVR: ['#cdd6e0', '#8a98a8'],
  tCRCL: ['#7fffd6', '#10b981'], tAMZN: ['#ffcf6f', '#e0a020'], tIAU: ['#ffe08a', '#e0b820'],
  tARKK: ['#b89dff', '#6d3bd8'], tPPLT: ['#cdd6e0', '#7a8898'], tVWO: ['#7fc1ff', '#2b7fe0'],
  tBMNR: ['#ff9d8a', '#e0512b'],
  USDC: ['#4aa0f5', '#2775CA'],
};
function AssetDisc({ sym, size = 32, ring = false }) {
  const earn = sym === 'wtSGOV' || sym === 'tSGOV' || sym === 'SGOV';
  const usdc = sym === 'USDC';
  const [c1, c2] = earn ? ['#4af0bb', '#15c78c'] : (ASSET_COLORS[sym] || ['#9aa9bb', '#5c6a7c']);
  const letters = usdc ? '$' : sym.replace(/^t|^w/g, '').slice(0, 2).toUpperCase();
  return (
    <div className="relative flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size, height: size, fontSize: size * 0.36,
        background: `radial-gradient(circle at 30% 25%, ${c1}, ${c2})`,
        boxShadow: ring ? '0 0 0 3px rgba(45,227,166,.18)' : 'inset 0 1px 0 rgba(255,255,255,.25)',
      }}>
      {earn ? <Icon name="bank" className="h-1/2 w-1/2" stroke={1.9} /> : letters}
    </div>
  );
}

// Tiny bar sparkline (for volume widgets)
function BarSpark({ data, w = 120, h = 36, color = '#2de3a6', gap = 1.6 }) {
  const max = Math.max(...data) || 1;
  const bw = (w - gap * (data.length - 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }} className="overflow-visible">
      {data.map((v, i) => {
        const bh = Math.max(1.5, (v / max) * h);
        return <rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={Math.min(2, bw / 2)} fill={color} opacity={0.35 + 0.65 * (v / max)} />;
      })}
    </svg>
  );
}

Object.assign(window, { Icon, TokenDisc, Sparkline, ApyChip, CountUp, fmt, AssetDisc, BarSpark });
