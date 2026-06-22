// ─────────────────────────────────────────────────────────────────────────
// Trade — light trade terminal; demonstrates Earn is reachable from here
// (via the header pill) without living inside the trade flow.
// ─────────────────────────────────────────────────────────────────────────

function CandleChart() {
  const candles = useMemo(() => {
    const out = []; let p = 138;
    for (let i = 0; i < 46; i++) {
      const o = p, c = p + (Math.random() - 0.48) * 3.2;
      const hi = Math.max(o, c) + Math.random() * 1.4, lo = Math.min(o, c) - Math.random() * 1.4;
      out.push({ o, c, hi, lo }); p = c;
    }
    return out;
  }, []);
  const all = candles.flatMap((c) => [c.hi, c.lo]);
  const min = Math.min(...all), max = Math.max(...all), H = 280, W = 620;
  const y = (v) => H - ((v - min) / (max - min)) * H;
  const cw = W / candles.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {candles.map((c, i) => {
        const up = c.c >= c.o, col = up ? '#34d399' : '#f04438', x = i * cw + cw / 2;
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.hi)} y2={y(c.lo)} stroke={col} strokeWidth="1" />
            <rect x={i * cw + cw * 0.2} width={cw * 0.6} y={y(Math.max(c.o, c.c))} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} fill={col} />
          </g>
        );
      })}
    </svg>
  );
}

function Trade({ go }) {
  const [side, setSide] = useState('buy');
  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      {/* ticker tape */}
      <div className="mb-4 flex items-center gap-6 overflow-hidden rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs">
        {[['tNVDA', '141.20', '+1.4%', true], ['tTSLA', '342.05', '-0.6%', false], ['wtSGOV', '100.42', '+0.01%', true], ['tCOIN', '248.66', '+2.1%', true], ['tMSTR', '388.10', '-1.2%', false]].map(([s, p, ch, up]) => (
          <div key={s} className="flex shrink-0 items-center gap-2"><span className="font-medium text-gray-300">{s}</span><span className="font-mono text-gray-400">${p}</span><span className={`font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>{ch}</span></div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* chart */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3"><TokenDisc token="usdc" size={34} /><div><div className="flex items-center gap-2 font-semibold text-white">tNVDA <span className="text-xs font-normal text-gray-400">NVIDIA</span></div><div className="font-mono text-2xl font-bold text-white">$141.20 <span className="text-sm font-medium text-emerald-400">+1.4%</span></div></div></div>
            <div className="flex gap-1">{['1H', '1D', '1W', '1M'].map((t, i) => <button key={t} className={`rounded px-2.5 py-1 text-xs font-medium ${i === 1 ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'}`}>{t}</button>)}</div>
          </div>
          <div className="h-[280px]"><CandleChart /></div>
        </div>

        {/* order panel */}
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
            <button onClick={() => setSide('buy')} className={`rounded-md py-2 text-sm font-semibold ${side === 'buy' ? 'bg-emerald-500 text-[#05241a]' : 'text-gray-400'}`}>Buy</button>
            <button onClick={() => setSide('sell')} className={`rounded-md py-2 text-sm font-semibold ${side === 'sell' ? 'bg-red-500 text-white' : 'text-gray-400'}`}>Sell</button>
          </div>
          <div className="space-y-2.5">
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5"><div className="flex justify-between text-xs text-gray-400"><span>Pay</span><span>Balance 3,920 USDC</span></div><div className="mt-1 flex items-center gap-2"><span className="text-lg font-bold text-gray-500">$</span><input defaultValue="500" className="w-full bg-transparent text-lg font-bold text-white outline-none" /><TokenDisc token="usdc" size={22} /></div></div>
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5"><div className="flex justify-between text-xs text-gray-400"><span>Receive (est.)</span></div><div className="mt-1 flex items-center gap-2"><span className="w-full text-lg font-bold text-white">3.541</span><span className="text-sm text-gray-300">tNVDA</span></div></div>
          </div>
          <button className={`mt-3 w-full rounded-lg py-2.5 text-sm font-semibold ${side === 'buy' ? 'bg-emerald-500 text-[#05241a] hover:bg-emerald-400' : 'bg-red-500 text-white'}`}>{side === 'buy' ? 'Buy tNVDA' : 'Sell tNVDA'}</button>

          {/* ── subdued idle-cash nudge: present, not pushy ── */}
          <button onClick={() => go('earn')} className="group mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/[0.07] py-2 text-[12px] text-gray-500 transition hover:border-emerald-400/30 hover:text-emerald-300">
            <Icon name="sprout" className="h-3.5 w-3.5 text-emerald-400/70" />
            Idle USDC? Earn {rate()}% in Savings
            <Icon name="arrowRight" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-gray-600">The header <span className="text-emerald-400">Earn</span> pill stays visible here — Save &amp; Earn is one click away without cluttering the trade flow.</p>
    </div>
  );
}

Object.assign(window, { Trade });
