// ─────────────────────────────────────────────────────────────────────────
// EarnParts — Calculator · Choose-your-yield (tSGOV/wtSGOV) · Permissionless
//             comparison · Trust strip · FAQ accordion
// ─────────────────────────────────────────────────────────────────────────

function EarnCalculator({ openDeposit }) {
  const [amt, setAmt] = useState(10000);
  const presets = [1000, 10000, 50000, 250000];
  const yr = amt * (APY / 100);
  const mo = yr / 12;
  const day = yr / 365;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-lg font-semibold text-white">See what your dollars could earn</h3>
          <p className="mt-1 text-sm text-gray-400">Move the slider or type an amount.</p>

          <div className="mt-6 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <div className="flex items-center justify-between text-xs text-gray-400"><span>Amount to save</span><span>USDC</span></div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-500">$</span>
              <input
                type="text" inputMode="numeric" value={amt.toLocaleString('en-US')}
                onChange={(e) => { const n = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0; setAmt(Math.min(1000000, n)); }}
                className="w-full bg-transparent text-2xl font-bold text-white outline-none"
              />
            </div>
          </div>

          <input type="range" min="0" max="250000" step="1000" value={Math.min(amt, 250000)}
            onChange={(e) => setAmt(parseInt(e.target.value))}
            className="mt-4 w-full accent-emerald-400" />
          <div className="mt-3 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p} onClick={() => setAmt(p)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${amt === p ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200' : 'border-white/10 text-gray-300 hover:bg-white/5'}`}>
                ${p >= 1000 ? `${p / 1000}k` : p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-xl border border-emerald-400/20 bg-gradient-to-b from-emerald-500/[0.08] to-transparent p-6">
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-400/80">Projected earnings · Year 1</div>
          <div className="mt-1 flex items-end gap-2">
            <CountUp value={yr} className="text-4xl font-bold text-emerald-300" />
            <span className="mb-1 text-sm text-gray-400">/ year</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            {[['Per month', mo], ['Per day', day], ['SEC yield', null]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white/[0.04] py-2.5">
                <div className="font-mono text-sm font-semibold text-white">{v === null ? `${rate()}%` : `$${fmt(v)}`}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-500">{k}</div>
              </div>
            ))}
          </div>
          <button onClick={openDeposit} className="mt-5 flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-[#05241a] hover:bg-emerald-400">
            Start earning <Icon name="arrowRight" className="h-4 w-4" />
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-500">Illustrative at {rate()}% SEC yield. Compounds monthly in wtSGOV.</p>
        </div>
      </div>
    </div>
  );
}

// Two tokens, one underlying — the "choose your yield" selector
function ChooseYield({ openDeposit }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">Two tokens, one underlying</h3>
        <span className="text-xs text-gray-500">Switch freely · unwrap anytime</span>
      </div>
      <p className="mb-5 max-w-xl text-sm text-gray-400">Same SGOV backing, your choice of how the yield reaches you.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {TWO_TOKEN.map((t) => (
          <div key={t.sym} className={`relative flex flex-col rounded-xl border p-5 ${t.recommended ? 'border-emerald-400/30 bg-emerald-400/[0.05]' : 'border-white/10 bg-white/[0.02]'}`}>
            {t.recommended && <span className="absolute right-4 top-4 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">For saving</span>}
            <div className="flex items-center gap-2.5">
              <TokenDisc token={t.token} size={36} ring={t.recommended} />
              <div>
                <div className="font-semibold text-white">{t.sym}</div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-400/70">{t.tag}</div>
              </div>
            </div>
            <p className="mt-3 flex-1 text-[13px] leading-relaxed text-gray-300">{t.desc}</p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500"><Icon name="check" className="h-3.5 w-3.5 text-emerald-400/70" />Best for: {t.best}</div>
            <button onClick={openDeposit} className={`mt-4 rounded-lg py-2 text-sm font-semibold ${t.recommended ? 'bg-emerald-500 text-[#05241a] hover:bg-emerald-400' : 'border border-white/15 text-gray-200 hover:bg-white/5'}`}>
              {t.mode === 'compound' ? 'Save & compound' : 'Get monthly dividends'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// THE moat — every meaningful tokenised Treasury requires KYC. Except SGOV.
function TreasuryComparison() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
      <div className="border-b border-white/[0.06] px-6 py-5">
        <h3 className="text-lg font-semibold text-white">Every tokenised Treasury needs permission. <span className="text-emerald-300">Except one.</span></h3>
        <p className="mt-1 text-sm text-gray-400">Same Treasury yield everyone else offers — without the KYC gate, the minimums, or the whitelist.</p>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 px-6 py-2.5 text-[10px] font-medium uppercase tracking-wider text-gray-500 sm:grid-cols-[0.8fr_1fr_auto]">
        <span>Product</span><span className="hidden sm:block">Who can hold it</span><span className="text-right">Permissionless</span>
      </div>
      <div className="divide-y divide-white/[0.05]">
        {TREASURY_COMPARE.map((r) => (
          <div key={r.name} className={`grid grid-cols-[1fr_auto] items-center gap-2 px-6 py-3.5 sm:grid-cols-[0.8fr_1fr_auto] ${r.highlight ? 'bg-emerald-400/[0.06]' : ''}`}>
            <div className="flex items-center gap-3">
              {r.highlight ? <TokenDisc token="wtsgov" size={32} ring /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-[11px] font-bold text-gray-500">{r.name[0]}</span>}
              <div>
                <div className={`text-sm font-semibold ${r.highlight ? 'text-emerald-200' : 'text-white'}`}>{r.name}</div>
                <div className="text-[11px] text-gray-500">{r.issuer}</div>
              </div>
            </div>
            <div className={`hidden text-[13px] sm:block ${r.highlight ? 'font-medium text-emerald-300/90' : 'text-gray-400'}`}>{r.access}</div>
            <div className="flex justify-end">
              {r.ok
                ? <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"><Icon name="check" className="h-4 w-4" stroke={2.4} /></span>
                : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/10 text-red-400/80"><Icon name="close" className="h-3.5 w-3.5" stroke={2.4} /></span>}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.06] bg-white/[0.015] px-6 py-3.5 text-[13px] text-gray-400">
        <span className="font-medium text-emerald-300">Why it matters:</span> permissionless means your SGOV works in any wallet and any DeFi protocol — as collateral, in pools, anywhere — the moment you hold it.
      </div>
    </div>
  );
}

function TrustStrip() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      {TRUST.map((t) => (
        <span key={t} className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[12px] text-gray-300">
          <Icon name="check" className="h-3.5 w-3.5 text-emerald-400/80" />{t}
        </span>
      ))}
    </div>
  );
}

function FaqAccordion() {
  const [open, setOpen] = useState(0);
  return (
    <div className="mx-auto max-w-2xl divide-y divide-white/[0.07] rounded-2xl border border-white/10 bg-white/[0.02]">
      {EARN_FAQ.map((f, i) => (
        <div key={i}>
          <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
            <span className="text-sm font-medium text-white">{f.q}</span>
            <Icon name={open === i ? 'minus' : 'plus'} className="h-4 w-4 shrink-0 text-gray-400" />
          </button>
          {open === i && <p className="px-5 pb-4 text-sm leading-relaxed text-gray-400">{f.a}</p>}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { EarnCalculator, ChooseYield, TreasuryComparison, TrustStrip, FaqAccordion });
