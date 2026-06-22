// ─────────────────────────────────────────────────────────────────────────
// Trade — faithful rebuild of the real app.st0x.fi trade terminal:
//   · top ticker tape of wrapped equities
//   · left ASSETS watchlist rail
//   · OFF-CHAIN REFERENCE card (oracle · confidence · bid · offer) + Buy/Sell
//   · live reference chart with timeframe tabs
//   · On-chain Market (Market Data / Orders / Holdings) → Trade History + Depth
//   · About → Token Details / Equity Details
// Kept in the v2 mint design language; Buy green / Sell red as in production.
// ─────────────────────────────────────────────────────────────────────────

const pos = (n) => n >= 0;
const sign = (n, d = 2) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
const Dsup = () => <sup className="ml-0.5 text-[0.6em] font-semibold text-amber-400">D</sup>;

// Shared card vocabulary — matches the Home page exactly.
const CARD = 'rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur';
const SUBCARD = 'rounded-xl border border-white/10 bg-black/30';
// Emerald glow blob, the Save & Earn signature used on Home's hero card.
const Glow = ({ className = '-right-12 -top-16 h-56 w-56' }) => (
  <div className={`pointer-events-none absolute rounded-full bg-emerald-400/15 blur-3xl ${className}`}></div>
);

// ── top ticker tape ────────────────────────────────────────────────────────
function TickerTape() {
  const row = [...TRADE_TICKER, ...TRADE_TICKER];
  return (
    <div className="relative overflow-hidden border-b border-white/[0.06] bg-black/30">
      <div className="flex w-max gap-8 whitespace-nowrap py-2 pl-4" style={{ animation: 'tickertape 38s linear infinite' }}>
        {row.map((t, i) => {
          const up = pos(t.chg);
          return (
            <span key={i} className="flex items-center gap-2 text-[12.5px]">
              <span className="font-medium text-gray-200">{t.name}</span>
              <span className="text-gray-500">·</span>
              <span className="font-mono text-gray-300">{fmt(t.price)}<Dsup /></span>
              <span className={`font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>{sign(t.chg)} ({sign(t.pct)}%)</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── left ASSETS watchlist rail ───────────────────────────────────────────────
function Watchlist({ active, onPick }) {
  return (
    <aside className="hidden w-[208px] shrink-0 flex-col border-r border-white/[0.06] bg-black/20 lg:flex">
      <div className="px-4 pb-2 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-gray-500">Assets</div>
      <div className="flex-1 overflow-y-auto no-bar pb-4">
        {TRADE_WATCHLIST.map((m) => {
          const on = m.sym === active;
          return (
            <button key={m.sym} onClick={() => onPick(m.sym)}
              className={`relative flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition ${on ? 'bg-emerald-400/[0.07]' : 'hover:bg-white/[0.03]'}`}>
              {on && <span className="absolute inset-y-0 left-0 w-[3px] bg-emerald-400"></span>}
              <AssetDisc sym={m.sym} size={28} ring={m.earn} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[13px] font-semibold ${on ? 'text-emerald-200' : 'text-white'}`}>{m.sym}</span>
                  {m.earn && <span className="rounded bg-emerald-400/15 px-1 py-px text-[7.5px] font-bold uppercase text-emerald-300">Earn</span>}
                </div>
                <div className="truncate text-[10.5px] text-gray-500">{m.name}</div>
              </div>
              <span className="font-mono text-[12px] text-gray-300">${fmt(m.price)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ── OFF-CHAIN REFERENCE + Buy/Sell ───────────────────────────────────────────
function ReferenceCard({ m }) {
  const up = pos(m.chg), pUp = pos(m.postChg);
  return (
    <div className="flex flex-col gap-3">
      <div className={`relative overflow-hidden ${CARD} p-5`}>
        <Glow />
        <div className="relative">
        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-gray-500">
          <span>Off-chain reference</span><span>{m.ref}</span>
        </div>
        <div className="mt-1 text-[15px] font-semibold text-white">{m.fullName}</div>

        <div className="mt-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <AssetDisc sym={m.sym} size={46} />
            <div>
              <div className="font-display text-[34px] font-bold leading-none tracking-tight text-white">{m.ticker}</div>
              <div className="mt-1.5 flex items-center gap-2 text-[12px] text-gray-400">
                <span>{m.company}</span>
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#2de3a6]/15 text-[8px] text-emerald-300">◆</span>
                <span>{m.exchange}</span>
              </div>
            </div>
          </div>
          <span className="rounded bg-white/5 px-1.5 py-1 text-[10px] font-bold text-sky-300">TV</span>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="flex items-end gap-2">
              <span className="font-mono text-[30px] font-semibold leading-none text-white">{fmt(m.price)}<Dsup /></span>
              <span className="pb-1 text-[12px] text-gray-500">USD</span>
              <span className={`pb-1 font-mono text-[15px] ${up ? 'text-emerald-400' : 'text-red-400'}`}>{sign(m.chg)} ({sign(m.pct)}%)</span>
            </div>
            <div className="mt-1.5 text-[10.5px] uppercase tracking-wider text-gray-500">{m.atClose}</div>
            <div className="mt-3 flex items-center gap-2 text-[13px]">
              <span className="font-mono text-white">{fmt(m.postPrice)}</span>
              <span className="font-mono text-emerald-400">{sign(m.postChg)} ({sign(m.postPct)}%)</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-sky-400/80"><span className="h-1.5 w-1.5 rounded-full bg-sky-400"></span>{m.postAsOf}</div>
          </div>
          <div className="flex gap-8">
            <div><div className="text-[18px] font-semibold text-white">{m.earnings}</div><div className="mt-1 text-[10.5px] uppercase tracking-wider text-gray-500">Upcoming earnings</div></div>
            <div><div className="font-mono text-[18px] font-semibold text-white">{m.eps}</div><div className="mt-1 text-[10.5px] uppercase tracking-wider text-gray-500">EPS</div></div>
          </div>
        </div>

        {/* oracle / confidence / bid / offer — inner panel, Home vocabulary */}
        <div className={`mt-5 grid grid-cols-2 gap-x-8 gap-y-4 ${SUBCARD} p-4`}>
          {[['Oracle price', `$${fmt(m.oracle)}`], ['Confidence', `± $${m.confidence}`], ['Bid price', `$${fmt(m.bid)}`], ['Offer price', `$${fmt(m.offer)}`]].map(([k, v]) => (
            <div key={k}><div className="text-[10.5px] uppercase tracking-wider text-gray-500">{k}</div><div className="mt-1 font-mono text-[17px] text-white">{v}</div></div>
          ))}
        </div>

        {/* buy / sell */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="rounded-xl bg-emerald-500 py-3.5 text-[15px] font-bold text-[#05231a] transition hover:bg-emerald-400">Buy</button>
          <button className="rounded-xl bg-red-500 py-3.5 text-[15px] font-bold text-[#2a0808] transition hover:bg-red-400">Sell</button>
        </div>
        </div>
      </div>

      {/* idle-cash nudge — Save & Earn one tap away */}
      <button onClick={() => window.__goEarn && window.__goEarn()} className="group flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] py-2.5 text-[12px] text-emerald-300/80 transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.08] hover:text-emerald-300">
        <Icon name="sprout" className="h-3.5 w-3.5 text-emerald-400/80" />
        Holding cash between trades? Earn {rate()}% in Savings
        <Icon name="arrowRight" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}

// ── reference chart card ─────────────────────────────────────────────────────
function ChartCard({ m }) {
  const [tf, setTf] = useState('1D');
  const up = pos(m.chg);
  return (
    <div className={`flex flex-col ${CARD} p-5`}>
      <div className="flex items-center gap-3">
        <AssetDisc sym={m.sym} size={40} />
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-white">{m.company.replace('STRATEGY INC', 'Strategy Inc')} <span className="text-gray-500">☾</span></div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-[20px] font-semibold text-white">{fmt(m.price)}<Dsup /></span>
            <span className="text-[11px] text-gray-500">USD</span>
            <span className={`font-mono text-[13px] ${up ? 'text-emerald-400' : 'text-red-400'}`}>{sign(m.chg)} {sign(m.pct)}%</span>
            <span className="text-[12px] text-gray-500">1 day</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1">
        {['1D', '1M', '3M', '1Y', '5Y', 'All'].map((t) => (
          <button key={t} onClick={() => setTf(t)} className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${tf === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>{t}</button>
        ))}
        <button className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/[0.06] px-3 py-1.5 text-[12px] font-semibold text-amber-300 transition hover:bg-amber-400/15">
          <Icon name="arrowUpRight" className="h-3.5 w-3.5" />Advanced Chart
        </button>
      </div>

      <div className="relative mt-3 flex-1">
        <IntradayChart data={MSTR_INTRADAY} />
        <span className="absolute bottom-2 left-1 rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">TV</span>
      </div>
    </div>
  );
}

// ── On-chain Market panel ────────────────────────────────────────────────────
function OnChainMarket({ m }) {
  const [tab, setTab] = useState('market');
  const [hist, setHist] = useState('7D');
  return (
    <div className="mt-6 border-t border-white/[0.06] pt-6">
      <h3 className="text-[20px] font-bold tracking-tight text-white">On-chain Market</h3>
      <p className="mt-0.5 text-[13px] text-gray-500">View on-chain trades, liquidity, orders, and vaults</p>

      <div className="mt-4 flex gap-6 border-b border-white/[0.07]">
        {[['market', 'Market Data'], ['orders', 'Orders'], ['holdings', 'Holdings']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`relative pb-3 text-[14px] font-medium transition ${tab === k ? 'text-emerald-300' : 'text-gray-500 hover:text-gray-300'}`}>
            {label}{tab === k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-400"></span>}
          </button>
        ))}
      </div>

      {tab === 'market' && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* trade history */}
          <div className={`${CARD} p-5`}>
            <div className="flex items-start justify-between">
              <div><div className="text-[15px] font-semibold text-white">Trade History</div><div className="mt-0.5 text-[12px] text-gray-500">On-chain trade executions over time</div></div>
              <div className="flex gap-1 rounded-lg bg-white/[0.04] p-0.5">
                {['1D', '7D', '30D'].map((t) => (<button key={t} onClick={() => setHist(t)} className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${hist === t ? 'bg-sky-500/80 text-white' : 'text-gray-400'}`}>{t}</button>))}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-center gap-5 text-[11px] text-gray-400">
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-gray-300"></span>Price</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-sky-500"></span>Volume</span>
            </div>
            <HistoryChart {...TRADE_HISTORY} />
            <div className="mt-1 text-[11px] text-gray-600">All times are displayed in your local timezone</div>
          </div>
          {/* orderbook depth */}
          <div className={`${CARD} p-5`}>
            <div><div className="text-[15px] font-semibold text-white">Orderbook Depth</div><div className="mt-0.5 text-[12px] text-gray-500">Current on-chain liquidity</div></div>
            <DepthChart {...DEPTH} />
            <div className="mt-2 flex items-center justify-center gap-5 text-[11px] text-gray-400">
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm border border-emerald-400 bg-emerald-400/30"></span>Bids</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm border border-red-400 bg-red-400/30"></span>Asks</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className={`mt-5 overflow-hidden ${CARD}`}>
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] bg-white/[0.03] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500"><span>Side</span><span>Type</span><span>Qty</span><span>Price</span><span>Status</span></div>
          {OPEN_ORDERS.map((o, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] border-t border-white/[0.05] px-4 py-3 text-[13px]">
              <span className={o.side === 'buy' ? 'font-semibold text-emerald-400' : 'font-semibold text-red-400'}>{o.side === 'buy' ? 'Buy' : 'Sell'} {o.sym}</span>
              <span className="text-gray-300">{o.type}</span><span className="font-mono text-gray-300">{o.qty}</span><span className="font-mono text-gray-300">${o.price}</span>
              <span className="text-amber-300">Open · {o.filled}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'holdings' && (
        <div className={`relative mt-5 overflow-hidden ${CARD} p-6`}>
          <Glow className="-right-10 -top-12 h-44 w-44" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div><div className="text-[11px] uppercase tracking-wider text-gray-500">Your {m.wsym} position</div><div className="mt-1 font-mono text-[24px] font-semibold text-white">{POSITION.qty} <span className="text-[14px] text-gray-500">{m.sym}</span></div></div>
            <div className="text-right"><div className="text-[11px] uppercase tracking-wider text-gray-500">Value · unrealised P&amp;L</div><div className="mt-1 font-mono text-[24px] font-semibold text-white">${fmt(POSITION.value)} <span className="text-[14px] text-emerald-400">+{POSITION.pnlPct}%</span></div></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── About: token details + equity details ────────────────────────────────────
function TokenDetails({ m }) {
  const [tab, setTab] = useState('contract');
  const rows = [['Wrapped Token', m.wrapped, true], ['Underlying Token', m.underlying, true], ['Network', m.network], ['Symbol', m.wsym], ['Decimals', String(m.decimals)]];
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Token details</div>
      <div className="mt-3 flex gap-5 border-b border-white/[0.07]">
        {[['contract', 'Contract'], ['supply', 'Supply'], ['mints', 'Mints'], ['burns', 'Burns']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`relative pb-2.5 text-[13px] font-medium transition ${tab === k ? 'text-emerald-300' : 'text-gray-500 hover:text-gray-300'}`}>{label}{tab === k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-400"></span>}</button>
        ))}
      </div>
      <div className="mt-4 text-[15px] font-semibold text-white">Contract Information</div>
      <div className="mt-2 divide-y divide-white/[0.05]">
        {rows.map(([k, v, mono]) => (
          <div key={k} className="flex items-center justify-between py-2.5 text-[13.5px]"><span className="text-gray-400">{k}</span><span className={`${mono ? 'font-mono text-sky-400' : 'text-white'} flex items-center gap-1.5`}>{v}{mono && <Icon name="arrowUpRight" className="h-3 w-3 text-gray-500" />}</span></div>
        ))}
        <div className="flex items-center justify-between py-2.5 text-[13.5px]"><span className="text-gray-400">Proofs</span><a className="text-sky-400 hover:underline">View proofs</a></div>
      </div>
    </div>
  );
}

function EquityDetails({ m }) {
  const [tab, setTab] = useState('info');
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Equity details</div>
      <div className="mt-3 flex gap-5 border-b border-white/[0.07]">
        {[['info', 'Company Info'], ['fund', 'Fundamentals'], ['tech', 'Technical'], ['news', 'Top Stories']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`relative pb-2.5 text-[13px] font-medium transition ${tab === k ? 'text-emerald-300' : 'text-gray-500 hover:text-gray-300'}`}>{label}{tab === k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-400"></span>}</button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 text-[22px] font-bold"><span className="text-sky-400">{m.ticker}</span><span className="text-white">Profile</span></div>
      <div className="mt-3 space-y-1.5 text-[13.5px]">
        <div className="text-gray-400">Sector: <span className="font-semibold text-white">{m.sector}</span></div>
        <div className="text-gray-400">Industry: <span className="font-semibold text-white">{m.industry}</span></div>
        <div className="text-gray-400">Employees (FY): <span className="font-semibold text-white">{m.employees}</span></div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-gray-400">{m.profile}</p>
    </div>
  );
}

function About({ m }) {
  return (
    <div className="mt-8 border-t border-white/[0.06] pt-6">
      <h3 className="text-[20px] font-bold tracking-tight text-white">About</h3>
      <p className="mt-0.5 text-[13px] text-gray-500">Learn more about the token or the equity</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className={`${CARD} p-5`}><TokenDetails m={m} /></div>
        <div className={`${CARD} p-5`}><EquityDetails m={m} /></div>
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
function Trade({ go }) {
  const [activeSym, setActiveSym] = useState('tMSTR');
  useEffect(() => { window.__goEarn = () => go('earn'); }, [go]);
  // The terminal is wired around the screenshot-faithful MSTR detail; selecting
  // another asset swaps the header label while the dossier stays illustrative.
  const m = { ...TRADE_ACTIVE };

  return (
    <div className="flex">
      <Watchlist active={activeSym} onPick={setActiveSym} />
      <div className="min-w-0 flex-1">
        <TickerTape />
        <div className="px-5 py-5">
          <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
            <ReferenceCard m={m} />
            <ChartCard m={m} />
          </div>
          <OnChainMarket m={m} />
          <About m={m} />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Trade });
