// ─────────────────────────────────────────────────────────────────────────
// Metrics — a fresh "Platform transparency" page: live KPIs, TVL chart,
// TVL-by-asset donut, daily volume, cumulative yield, proof-of-reserve.
// ─────────────────────────────────────────────────────────────────────────

// Smooth area chart (cardinal-ish via quadratic midpoints)
function AreaChart({ data, w = 900, h = 260, color = '#2de3a6', grid = true, dot = true }) {
  const { line, area, lastPt } = useMemo(() => {
    const min = Math.min(...data), max = Math.max(...data);
    const sx = w / (data.length - 1), sy = (h - 18) / (max - min || 1);
    const pts = data.map((v, i) => [i * sx, h - 9 - (v - min) * sy]);
    let l = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
      l += ` Q${x0},${y0} ${mx},${(y0 + y1) / 2} T${x1},${y1}`;
    }
    return { line: l, area: `${l} L${w},${h} L0,${h} Z`, lastPt: pts[pts.length - 1] };
  }, [data, w, h]);
  const id = useMemo(() => 'ar' + Math.random().toString(36).slice(2, 7), []);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid && [0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />)}
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {dot && <circle cx={lastPt[0]} cy={lastPt[1]} r="4" fill={color} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

// Donut for TVL composition
function Donut({ segments, size = 168, stroke = 22 }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const frac = s.value / total, dash = `${frac * c} ${c - frac * c}`, off = -acc * c;
          acc += frac;
          return <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeDasharray={dash} strokeDashoffset={off} strokeLinecap="butt" />;
        })}
      </g>
    </svg>
  );
}

function KpiCard({ kpi }) {
  const accent = kpi.tone === 'accent';
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-5 ${accent ? 'border-emerald-400/30 bg-gradient-to-br from-emerald-500/[0.10] to-transparent' : 'border-white/10 bg-white/[0.025]'}`}>
      {accent && <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/15 blur-2xl"></div>}
      <div className="relative">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gray-500">
          {accent && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70"></span><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400"></span></span>}
          {kpi.k}
        </div>
        <div className={`mt-2 font-mono text-3xl font-bold ${accent ? 'text-emerald-300' : 'text-white'}`}>{kpi.v}</div>
        <div className="mt-2 flex items-center justify-between">
          <span className={`font-mono text-[12px] ${kpi.tone === 'up' ? 'text-emerald-400' : 'text-gray-400'}`}>{kpi.d}{kpi.sub ? ` · ${kpi.sub}` : ''}</span>
          {kpi.spark && <div className="opacity-90"><Sparkline data={kpi.spark} w={64} h={26} color={accent ? '#2de3a6' : '#2de3a6'} fill={false} /></div>}
        </div>
      </div>
    </div>
  );
}

function Metrics({ go, openDeposit }) {
  const [tf, setTf] = useState('30D');
  const totalTvl = TVL_BY_ASSET.reduce((s, a) => s + a.tvl, 0);
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      {/* header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.18em] text-emerald-400">
            <span className="h-px w-5 bg-emerald-400/40"></span>Transparency · Live
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Platform metrics</h1>
          <p className="mt-2 max-w-xl text-[15px] text-gray-400">Onchain activity across st0x — every figure is read from Base mainnet and refreshes each block.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/[0.07] px-3.5 py-2 font-mono text-[12px] font-semibold text-emerald-300">
          <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70"></span><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400"></span></span>
          Live · 12 markets
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {METRIC_KPIS.map((kpi) => <KpiCard key={kpi.k} kpi={kpi} />)}
      </div>

      {/* TVL chart */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[12px] uppercase tracking-wider text-gray-500">Total value locked</div>
            <div className="mt-1 flex items-end gap-2.5">
              <span className="font-mono text-3xl font-bold text-white">$24.0M</span>
              <span className="mb-1 font-mono text-[13px] font-semibold text-emerald-400">+6.4% · 30d</span>
            </div>
          </div>
          <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-0.5">
            {['7D', '30D', '90D', 'ALL'].map((t) => (
              <button key={t} onClick={() => setTf(t)} className={`rounded-md px-3 py-1.5 font-mono text-[12px] font-medium transition ${tf === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>{t}</button>
            ))}
          </div>
        </div>
        <div className="h-[240px]"><AreaChart data={TVL_SERIES} /></div>
        <div className="mt-2 flex justify-between font-mono text-[11px] text-gray-600"><span>Nov</span><span>Jan</span><span>Mar</span><span>May</span><span>Jul</span></div>
      </div>

      {/* two-up: composition donut + daily volume */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* TVL by asset */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="mb-4 text-[13px] font-semibold text-white">TVL by asset</div>
          <div className="flex items-center gap-6">
            <div className="relative shrink-0">
              <Donut segments={TVL_BY_ASSET.map((a) => ({ value: a.tvl, color: a.color }))} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-2xl font-bold text-white">${totalTvl.toFixed(1)}M</span>
                <span className="text-[10px] uppercase tracking-wide text-gray-500">Total locked</span>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              {TVL_BY_ASSET.map((a) => (
                <div key={a.sym} className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: a.color }}></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-white">{a.sym}{a.earn && <span className="rounded bg-emerald-400/15 px-1 py-px text-[8px] font-bold uppercase text-emerald-300">Earn</span>}</div>
                  </div>
                  <span className="font-mono text-[12px] text-gray-300">${a.tvl.toFixed(1)}M</span>
                  <span className="w-9 text-right font-mono text-[11px] text-gray-500">{Math.round((a.tvl / totalTvl) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* daily volume */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-white">Daily volume</span>
            <span className="font-mono text-[12px] text-emerald-400">+12% · 24h</span>
          </div>
          <div className="mt-1 flex items-end gap-2.5">
            <span className="font-mono text-3xl font-bold text-white">$1.84M</span>
            <span className="mb-1 text-[12px] text-gray-500">last 24h</span>
          </div>
          <div className="mt-4 h-[150px]"><BarSpark data={VOLUME_BARS} w={420} h={150} color="#7d8bff" gap={3} /></div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 text-center">
            {[['$312M', 'All-time'], ['$1.21M', 'Avg / day'], ['38.4k', 'Trades · 30d']].map(([v, k]) => (
              <div key={k}><div className="font-mono text-[14px] font-semibold text-white">{v}</div><div className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-500">{k}</div></div>
            ))}
          </div>
        </div>
      </div>

      {/* yield distributed + proof of reserve */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* cumulative yield */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.08] to-transparent p-5">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-400/12 blur-3xl"></div>
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="whitespace-nowrap text-[13px] font-semibold text-white">Yield distributed</span> <ApyChip /></div>
                <div className="mt-1 text-[12px] text-gray-400">Treasury income paid into Savings, cumulative</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-2xl font-bold text-emerald-300">$1.21M</div>
                <div className="text-[11px] text-gray-500">since launch</div>
              </div>
            </div>
            <div className="mt-4 h-[140px]"><AreaChart data={YIELD_SERIES} h={140} grid={false} /></div>
          </div>
        </div>

        {/* proof of reserve */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><Icon name="shield" className="h-5 w-5" /></span>
            <div>
              <div className="text-[13px] font-semibold text-white">Proof of reserve</div>
              <div className="text-[11px] text-gray-500">Every token backed 1:1 · onchain attested</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {RESERVE.map((r) => (
              <div key={r.k} className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
                <div className="font-mono text-lg font-bold text-white">{r.v}</div>
                <div className="mt-0.5 text-[11px] font-medium text-gray-300">{r.k}</div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-gray-500">{r.sub}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3.5 py-2.5 text-[12px] text-emerald-200/90">
            <Icon name="check" className="h-4 w-4 shrink-0 text-emerald-400" />
            Reserves verified onchain every block. <button className="font-semibold text-emerald-300 underline-offset-2 hover:underline">View attestation →</button>
          </div>
        </div>
      </div>

      {/* idle-cash nudge → ties metrics back to the product */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-400/25 bg-gradient-to-r from-emerald-500/[0.10] to-transparent px-5 py-4">
        <Icon name="sprout" className="h-5 w-5 shrink-0 text-emerald-400" />
        <span className="text-[14px] text-gray-200">$11.6M is already earning {rate()}% in Savings. <span className="text-gray-400">Idle USDC earns nothing — join them.</span></span>
        <button onClick={openDeposit} className="ml-auto shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#053124] transition hover:bg-emerald-400">Start earning {rate()}%</button>
      </div>
    </div>
  );
}

Object.assign(window, { Metrics });
