// ─────────────────────────────────────────────────────────────────────────
// Home — condensed st0x landing with the new "Save & Earn" callout band
// ─────────────────────────────────────────────────────────────────────────

function HomeHeadline() {
  const words = ['Global', 'Collateralised', 'DeFi-Ready', 'Redeemable'];
  const [wi, setWi] = useState(0);
  const [txt, setTxt] = useState('');
  const [del, setDel] = useState(false);
  useEffect(() => {
    const word = words[wi];
    let to;
    if (!del && txt.length < word.length) to = setTimeout(() => setTxt(word.slice(0, txt.length + 1)), 80);
    else if (!del && txt.length === word.length) to = setTimeout(() => setDel(true), 1700);
    else if (del && txt.length > 0) to = setTimeout(() => setTxt(word.slice(0, txt.length - 1)), 45);
    else { setDel(false); setWi((wi + 1) % words.length); }
    return () => clearTimeout(to);
  }, [txt, del, wi]);
  return (
    <div className="mx-auto max-w-3xl px-6 pt-12 pb-1 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Tokenised Equities. <span className="text-yellow-400">{txt}</span>
        <span className="animate-pulse text-yellow-400">|</span>
      </h1>
    </div>
  );
}

// Ambient, seamlessly-scrolling live price chart for the swap card
function LivePriceChart() {
  const W = 320, H = 220, N = 36;
  const norm = useMemo(() => {
    const a = []; let v = 0;
    for (let i = 0; i <= N; i++) { v += Math.sin(i / 2.4) * 5 + (Math.random() - 0.5) * 5; a.push(v); }
    a[N] = a[0]; // close the loop so the tile is seamless
    const mn = Math.min(...a), mx = Math.max(...a);
    return a.map((x) => (x - mn) / (mx - mn || 1));
  }, []);
  const { line, area } = useMemo(() => {
    const combined = [...norm, ...norm.slice(1)];
    const top = H * 0.26, band = H * 0.5;
    const xy = combined.map((p, i) => [(i / N) * W, top + (1 - p) * band]);
    const l = xy.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
    return { line: l, area: `${l} L${2 * W},${H} L0,${H} Z` };
  }, [norm]);

  const [price, setPrice] = useState(141.20);
  const [chg, setChg] = useState(1.84);
  useEffect(() => {
    const id = setInterval(() => {
      const d = (Math.random() - 0.42) * 0.9;
      setPrice((p) => Math.max(120, +(p + d).toFixed(2)));
      setChg((c) => +Math.max(-9, Math.min(9, c + d * 0.25)).toFixed(2));
    }, 1600);
    return () => clearInterval(id);
  }, []);

  const up = chg >= 0;
  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg className="chart-scroll absolute inset-y-0 left-0 h-full" style={{ width: '200%', animation: 'chartscroll 16s linear infinite' }} viewBox={`0 0 ${2 * W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="swapchart" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2de3a6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2de3a6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#swapchart)" />
        <path d={line} fill="none" stroke="#2de3a6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* mini-panel overlays */}
      <div className="absolute left-5 top-5 flex items-center gap-2.5">
        <TokenDisc token="tsgov" size={30} />
        <div>
          <div className="text-sm font-semibold leading-none text-white">tNVDA</div>
          <div className="mt-1 text-[11px] text-gray-400">NVIDIA · tokenised</div>
        </div>
      </div>
      <div className="absolute right-5 top-5 text-right">
        <div className="font-mono text-lg font-semibold leading-none text-white">${fmt(price)}</div>
        <div className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${up ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
          {up ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%
        </div>
      </div>
      <div className="absolute bottom-4 left-5 flex items-center gap-1.5 text-[11px] text-gray-500">
        <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70"></span><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400"></span></span>
        Live market · 50+ equities
      </div>
    </div>
  );
}

// ── The swap product — quick trade inline OR launch the full terminal ──
function SwapCard() {
  return (
    <div className="grid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur md:grid-cols-2">
      {/* left: the swap module */}
      <div className="flex flex-col p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between text-xs text-gray-400">
          <span>Quick trade</span><span>Base · USDC</span>
        </div>

        {/* pay row */}
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3.5 py-3.5">
          <div className="flex items-center gap-2 rounded-full bg-white/5 px-2 py-1.5">
            <TokenDisc token="usdc" size={26} /><span className="text-sm font-semibold text-white">USDC</span>
          </div>
          <span className="ml-auto font-mono text-xl text-gray-200">100.00</span>
        </div>

        {/* swap pivot */}
        <div className="z-10 -my-3 flex justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0c1118] text-gray-300">
            <Icon name="arrowDown" className="h-4 w-4" />
          </div>
        </div>

        {/* receive row */}
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3.5 py-3.5">
          <button className="flex items-center gap-2 rounded-full bg-white/5 px-2 py-1.5 transition hover:bg-white/10">
            <TokenDisc token="tsgov" size={26} /><span className="text-sm font-semibold text-white">tNVDA</span>
            <Icon name="chevronDown" className="h-3.5 w-3.5 text-gray-400" />
          </button>
          <span className="ml-auto font-mono text-xl text-gray-200">0.71</span>
        </div>

        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400">
          Trading on <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: '#7d8bff' }}></span> Base Mainnet
        </div>

        {/* primary: swap right here */}
        <button className="mt-3 w-full rounded-xl bg-gradient-to-b from-emerald-300 to-emerald-400 py-3 text-sm font-semibold text-[#053124] transition hover:brightness-105">
          Connect wallet
        </button>

        {/* secondary: go to the full terminal */}
        <div className="my-3 flex items-center gap-3 text-[11px] uppercase tracking-wider text-gray-600">
          <span className="h-px flex-1 bg-white/10"></span>or<span className="h-px flex-1 bg-white/10"></span>
        </div>
        <button className="w-full rounded-xl border border-white/15 bg-white/[0.04] py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
          Launch Trading Terminal
        </button>
      </div>

      {/* right: ambient live market */}
      <div className="relative min-h-[260px] border-t border-white/10 bg-[#0a0e15] md:border-l md:border-t-0">
        <LivePriceChart />
      </div>
    </div>
  );
}

// ★ The Save & Earn product — a peer to the swap card, equal weight, stacked below
function SaveEarnCard({ go, openDeposit }) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.10] via-[#0b1712] to-[#0b0f17] p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl"></div>
      <div className="relative flex flex-col">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">New</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400/70">Save &amp; Earn · SGOV</span>
        </div>
        <div className="grid items-center gap-6 sm:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h2 className="text-2xl font-bold leading-tight text-white">
              Don’t let your dollars sit still.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-gray-300">
              Idle USDC earns you <span className="font-semibold text-white">nothing</span>. Hold it as <span className="font-semibold text-emerald-300">SGOV</span> instead and earn <span className="font-semibold text-emerald-300">~{rate()}% a year</span>, backed 1:1 by BlackRock’s Treasury ETF. No KYC — redeem anytime.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button onClick={openDeposit} className="group flex items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-[#05241a] transition hover:bg-emerald-400">
                Start earning {rate()}%
                <Icon name="arrowRight" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button onClick={() => go('earn')} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-gray-200 hover:bg-white/5">How it works</button>
            </div>
          </div>

          {/* compact "idle vs SGOV" proof */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">$10,000 · 1 year</span>
              <Sparkline data={SGOV_SERIES} w={72} h={24} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-gray-400"><TokenDisc token="usdc" size={22} /> Idle USDC</div>
              <span className="font-mono text-gray-300">+$0</span>
            </div>
            <div className="my-2.5 h-px bg-white/10"></div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-white"><TokenDisc token="wtsgov" size={22} ring /> SGOV</div>
              <CountUp value={353} prefix="+$" decimals={0} className="font-mono text-sm font-bold text-emerald-300" />
            </div>
            <p className="mt-3 text-center text-[11px] text-gray-500">Same dollars. One earns, one doesn’t.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// The two products, stacked — equal width, equal weight
function ProductPair({ go, openDeposit }) {
  return (
    <section className="mx-auto max-w-5xl space-y-5 px-6 pt-6 pb-8">
      <SwapCard />
      <SaveEarnCard go={go} openDeposit={openDeposit} />
    </section>
  );
}

const HOME_ASSETS = [
  { sym: 'wtSGOV', name: 'Auto-compounding · US Treasuries', price: 100.42, tag: 'earn', tvl: '$4.2M', holders: 0 },
  { sym: 'tNVDA', name: 'NVIDIA', price: 141.20, tvl: '$8.1M', holders: 1240 },
  { sym: 'tTSLA', name: 'Tesla', price: 342.05, tvl: '$5.6M', holders: 980 },
  { sym: 'tMSTR', name: 'MicroStrategy', price: 388.10, tvl: '$3.2M', holders: 410 },
  { sym: 'tCOIN', name: 'Coinbase', price: 248.66, tvl: '$2.9M', holders: 372 },
];

function HomeTable({ go }) {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-16">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500">
              <th className="px-5 py-3 font-medium">Token</th>
              <th className="px-5 py-3 font-medium">Price</th>
              <th className="hidden px-5 py-3 font-medium sm:table-cell">TVL</th>
              <th className="hidden px-5 py-3 font-medium sm:table-cell">Holders</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {HOME_ASSETS.map((a) => (
              <tr key={a.sym} onClick={() => a.tag === 'earn' ? go('earn') : null}
                className={`border-t border-white/[0.06] transition-colors ${a.tag === 'earn' ? 'cursor-pointer bg-emerald-400/[0.04] hover:bg-emerald-400/[0.08]' : 'cursor-pointer hover:bg-white/[0.03]'}`}>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <TokenDisc token={a.tag === 'earn' ? 'wtsgov' : 'usdc'} size={32} />
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">{a.sym}
                        {a.tag === 'earn' && <ApyChip />}
                      </div>
                      <div className="text-xs text-gray-400">{a.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 font-mono text-sm text-white">${fmt(a.price)}</td>
                <td className="hidden px-5 py-3.5 text-sm text-gray-300 sm:table-cell">{a.tvl}</td>
                <td className="hidden px-5 py-3.5 text-sm text-gray-300 sm:table-cell">{a.holders.toLocaleString()}</td>
                <td className="px-5 py-3.5 text-right">
                  {a.tag === 'earn'
                    ? <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-300">Earn <Icon name="arrowRight" className="h-4 w-4" /></span>
                    : <Icon name="arrowRight" className="ml-auto h-4 w-4 text-gray-600" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-5 text-center text-sm text-gray-500">More equities coming soon</p>
    </section>
  );
}

function Home({ go, openDeposit }) {
  return (
    <div className="pb-10">
      <HomeHeadline />
      <ProductPair go={go} openDeposit={openDeposit} />
      <WhySection />
      <HomeTable go={go} />
      <PioneersFooter />
    </div>
  );
}

Object.assign(window, { Home, SaveEarnCard, SwapCard, ProductPair });
