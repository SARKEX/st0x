// ─────────────────────────────────────────────────────────────────────────
// TradeCharts — the three live visualisations on the real st0x trade page:
// the intraday reference line, the trade-history price+volume combo, and the
// orderbook depth (cumulative bids vs asks). Pure SVG, no chart lib.
// ─────────────────────────────────────────────────────────────────────────

// 1 ── Intraday reference line (red sell-off w/ faint after-hours tail)
function IntradayChart({ data, color = '#fb6a5d' }) {
  const W = 560, H = 300, padR = 46, padB = 26;
  const mn = Math.min(...data), mx = Math.max(...data);
  const cutoff = Math.floor(data.length * 0.82); // after-hours = greyed tail
  const xy = data.map((v, i) => [
    (i / (data.length - 1)) * (W - padR),
    8 + (1 - (v - mn) / (mx - mn || 1)) * (H - padB - 16),
  ]);
  const seg = (from, to) => xy.slice(from, to + 1).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const live = seg(0, cutoff);
  const tail = seg(cutoff, data.length - 1);
  const area = `${live} L${xy[cutoff][0].toFixed(1)},${H - padB} L0,${H - padB} Z`;
  const id = 'intra' + useMemo(() => Math.random().toString(36).slice(2, 6), []);
  const ticks = ['115.00', '116.00', '117.00', '118.00', '119.00', '120.00'];
  const times = ['15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:01'];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 300 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" /><stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => {
        const y = 8 + (i / (ticks.length - 1)) * (H - padB - 16);
        return (<g key={t}><line x1="0" y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.05)" /><text x={W - padR + 5} y={y + 3} fontSize="9" fill="#5b6673">{ticks[ticks.length - 1 - i]}</text></g>);
      })}
      {times.map((t, i) => (<text key={t} x={(i / (times.length - 1)) * (W - padR)} y={H - 8} fontSize="9" fill="#5b6673" textAnchor={i === 0 ? 'start' : 'middle'}>{t}</text>))}
      <path d={area} fill={`url(#${id})`} />
      <path d={live} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d={tail} fill="none" stroke="#6b7280" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// 2 ── Trade history: price line + volume bars under it
function HistoryChart({ price, vol, hi, lo }) {
  const W = 620, H = 320, padR = 0, padL = 52, padB = 28;
  const top = 6, priceH = (H - padB) * 0.66, volTop = priceH + 18, volH = (H - padB) - volTop;
  const pmn = Math.min(...price), pmx = Math.max(...price);
  const px = (i) => padL + (i / (price.length - 1)) * (W - padL - padR);
  const py = (v) => top + (1 - (v - pmn) / (pmx - pmn || 1)) * (priceH - top);
  const line = price.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const vmax = Math.max(...vol);
  const bw = (W - padL - padR) / vol.length;
  const yTicks = [hi.toFixed(2), '140.00', '130.00', '120.00', '110.00', '100.00', lo.toFixed(2)];
  const xLabels = ['Jun 03', 'Jun 05', 'Jun 07', 'Jun 09'];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 320 }}>
      {yTicks.map((t, i) => {
        const y = top + (i / (yTicks.length - 1)) * (priceH - top);
        return (<g key={i}><line x1={padL} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.05)" /><text x={padL - 6} y={y + 3} fontSize="9.5" fill="#5b6673" textAnchor="end">${t}</text></g>);
      })}
      <path d={line} fill="none" stroke="#cfd6df" strokeWidth="1.4" strokeLinejoin="round" />
      {/* sparse up/down ticks to feel like trade prints */}
      {price.map((v, i) => i % 4 === 0 && (
        <circle key={i} cx={px(i)} cy={py(v)} r="1.3" fill={i % 8 === 0 ? '#2de3a6' : '#fb6a5d'} opacity="0.8" />
      ))}
      {vol.map((v, i) => {
        const bh = Math.max(1, (v / vmax) * volH);
        return <rect key={i} x={px(i) - bw * 0.32} y={H - padB - bh} width={bw * 0.64} height={bh} fill="#3aa0d8" opacity="0.75" />;
      })}
      <line x1={padL} y1={H - padB} x2={W} y2={H - padB} stroke="rgba(255,255,255,0.08)" />
      {xLabels.map((t, i) => (<text key={t} x={padL + (i / (xLabels.length - 1)) * (W - padL)} y={H - 8} fontSize="9.5" fill="#5b6673" textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}>{t}</text>))}
    </svg>
  );
}

// 3 ── Orderbook depth: stepped cumulative bid (green) / ask (red) areas
function DepthChart({ mid, bids, asks, min, max, top }) {
  const W = 560, H = 300, padL = 8, padR = 8, padB = 30;
  const x = (p) => padL + ((p - min) / (max - min)) * (W - padL - padR);
  const y = (q) => 8 + (1 - q / top) * (H - padB - 16);
  const stepPath = (pts) => {
    let d = '';
    pts.forEach((pt, i) => {
      const [p, q] = pt;
      if (i === 0) d += `M${x(p).toFixed(1)},${y(q).toFixed(1)}`;
      else { const [, pq] = pts[i - 1]; d += ` L${x(p).toFixed(1)},${y(pq).toFixed(1)} L${x(p).toFixed(1)},${y(q).toFixed(1)}`; }
    });
    return d;
  };
  const bidLine = stepPath(bids), askLine = stepPath(asks);
  const bidArea = `${bidLine} L${x(bids[bids.length - 1][0]).toFixed(1)},${H - padB} L${x(bids[0][0]).toFixed(1)},${H - padB} Z`;
  const askArea = `${askLine} L${x(asks[asks.length - 1][0]).toFixed(1)},${H - padB} L${x(asks[0][0]).toFixed(1)},${H - padB} Z`;
  const yTicks = [0, 100, 200, 300, 400, 500];
  const xTicks = [116.56, 116.80, 117.00, 117.20, 117.40, 117.60, 117.80, 118.00, 118.33];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 300 }}>
      {yTicks.map((t) => { const yy = y(t); return (<g key={t}><line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(255,255,255,0.05)" /><text x={W - padR} y={yy - 2} fontSize="9" fill="#5b6673" textAnchor="end">{t.toFixed(2)}</text></g>); })}
      <path d={bidArea} fill="#2de3a6" fillOpacity="0.16" />
      <path d={bidLine} fill="none" stroke="#2de3a6" strokeWidth="1.6" />
      <path d={askArea} fill="#fb6a5d" fillOpacity="0.16" />
      <path d={askLine} fill="none" stroke="#fb6a5d" strokeWidth="1.6" />
      {xTicks.map((t, i) => (<text key={i} x={x(t)} y={H - 14} fontSize="8.5" fill="#5b6673" textAnchor="middle">${t.toFixed(2)}</text>))}
    </svg>
  );
}

Object.assign(window, { IntradayChart, HistoryChart, DepthChart });
