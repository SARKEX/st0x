// ─────────────────────────────────────────────────────────────────────────
// Portfolio — dashboard with the new "Savings" summary card + standout row
// ─────────────────────────────────────────────────────────────────────────

function Metric({ label, value, sub, tone }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === 'earn' ? 'border-emerald-400/25 bg-emerald-400/[0.05]' : 'border-white/10 bg-white/[0.025]'}`}>
      <div className="text-[11px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-bold sm:text-2xl ${tone === 'earn' ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

// ★ The portfolio surface: a dedicated Savings card that makes SGOV feel
// like an account that's actively working, not just another holding.
function SavingsCard({ openDeposit }) {
  const balance = 12480.55;
  const earnedToDate = 218.40;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.10] via-[#0a1410] to-[#070b12] p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl"></div>
      <div className="relative grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <TokenDisc token="wtsgov" size={40} ring />
            <div>
              <div className="flex items-center gap-2"><span className="font-semibold text-white">Savings</span><ApyChip /></div>
              <div className="text-xs text-gray-400">wtSGOV · auto-compounding</div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-gray-500">Balance</div>
              <div className="font-mono text-3xl font-bold text-white">${fmt(balance)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-gray-500">Earned to date</div>
              <CountUp value={earnedToDate} live className="block font-mono text-3xl font-bold text-emerald-300" />
            </div>
          </div>
          <div className="mt-5 flex gap-2.5">
            <button onClick={openDeposit} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#05241a] hover:bg-emerald-400"><Icon name="plus" className="h-4 w-4" />Add</button>
            <button className="flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-white/5"><Icon name="minus" className="h-4 w-4" />Withdraw</button>
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-black/25 p-4">
          <div className="flex items-center justify-between text-xs text-gray-400"><span>NAV · last 12 months</span><span className="font-mono text-emerald-300">+3.53%</span></div>
          <Sparkline data={SGOV_SERIES} w={260} h={60} />
          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
            <span className="flex items-center gap-1"><Icon name="clock" className="h-3 w-3" />Yield compounds monthly</span>
            <span>≈ ${fmt(balance * (APY / 100) / 12)}/mo</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const FUNDS = [{ sym: 'USDC', name: 'USD Coin', bal: 3920.10 }, { sym: 'ETH', name: 'Ethereum', bal: 0.42 }];
const HOLDINGS = [
  { sym: 'wtSGOV', name: 'Auto-compounding · US Treasuries', earn: true, bal: 124.06, price: 100.42, value: 12480.55, pnl: 218.40 },
  { sym: 'tNVDA', name: 'NVIDIA', bal: 18.4, price: 141.20, value: 2598.08, pnl: 142.10 },
  { sym: 'tTSLA', name: 'Tesla', bal: 4.1, price: 342.05, value: 1402.40, pnl: -38.20 },
];

function Dashboard({ openDeposit, go }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">My Dashboard</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-400 font-mono">0x9c…7f3a <Icon name="arrowUpRight" className="h-3.5 w-3.5" /></div>
        </div>
        <button onClick={openDeposit} className="flex items-center gap-1.5 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-400"><Icon name="plus" className="h-4 w-4" />Deposit</button>
      </div>

      {/* overview stats — note the new "Savings · earning" metric */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Total Value" value="$20,401" />
        <Metric label="Savings · earning" value="$12,481" sub={`at ${rate()}% yield`} tone="earn" />
        <Metric label="Unrealized P&L" value="+$321.90" />
        <Metric label="Active Orders" value="2" />
      </div>

      {/* ★ Savings card */}
      <div className="mt-6"><SavingsCard openDeposit={openDeposit} /></div>

      {/* Funds */}
      <div className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-white">Funds</h2>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wider text-gray-500"><th className="px-5 py-3 font-medium">Token</th><th className="px-5 py-3 font-medium">Balance</th><th className="px-5 py-3 text-right"></th></tr></thead>
            <tbody>
              {FUNDS.map((f) => (
                <tr key={f.sym} className="border-t border-white/[0.06]">
                  <td className="px-5 py-3.5"><div className="flex items-center gap-3"><TokenDisc token={f.sym === 'USDC' ? 'usdc' : 'usdc'} size={30} /><div><div className="font-semibold text-white">{f.sym}</div><div className="text-xs text-gray-400">{f.name}</div></div></div></td>
                  <td className="px-5 py-3.5 font-mono text-gray-200">{fmt(f.bal, f.sym === 'ETH' ? 4 : 2)}</td>
                  <td className="px-5 py-3.5 text-right">
                    {f.sym === 'USDC'
                      ? <button onClick={openDeposit} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/20"><Icon name="sprout" className="h-3.5 w-3.5" />Earn {rate()}%</button>
                      : <span className="text-gray-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* idle-USDC nudge */}
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] px-4 py-2.5 text-[13px] text-emerald-200/90">
          <Icon name="info" className="h-4 w-4 shrink-0 text-emerald-400" />
          Your <span className="font-semibold">$3,920 USDC</span> is idle. It could be earning ~${fmt(3920 * APY / 100)}/yr as Savings.
          <button onClick={openDeposit} className="ml-auto shrink-0 font-semibold text-emerald-300 underline-offset-2 hover:underline">Move to Savings →</button>
        </div>
      </div>

      {/* Holdings */}
      <div className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-white">Holdings</h2>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wider text-gray-500"><th className="px-5 py-3 font-medium">Token</th><th className="hidden px-5 py-3 font-medium sm:table-cell">Balance</th><th className="px-5 py-3 font-medium">Value</th><th className="px-5 py-3 font-medium">P&L</th></tr></thead>
            <tbody>
              {HOLDINGS.map((h) => (
                <tr key={h.sym} className={`border-t border-white/[0.06] ${h.earn ? 'bg-emerald-400/[0.04]' : ''}`}>
                  <td className="px-5 py-3.5"><div className="flex items-center gap-3"><TokenDisc token={h.earn ? 'wtsgov' : 'usdc'} size={30} /><div><div className="flex items-center gap-2 font-semibold text-white">{h.sym}{h.earn && <ApyChip />}</div><div className="text-xs text-gray-400">{h.name}</div></div></div></td>
                  <td className="hidden px-5 py-3.5 font-mono text-gray-300 sm:table-cell">{fmt(h.bal)}</td>
                  <td className="px-5 py-3.5 font-mono text-white">${fmt(h.value)}</td>
                  <td className={`px-5 py-3.5 font-mono ${h.pnl >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>{h.pnl >= 0 ? '+' : ''}${fmt(Math.abs(h.pnl))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, SavingsCard });
