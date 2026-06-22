// ─────────────────────────────────────────────────────────────────────────
// DepositModal — "Start earning": enter amount → confirm → done (wtSGOV only)
// Re-uses the existing USDC→token buy path under the hood.
// ─────────────────────────────────────────────────────────────────────────

function DepositModal({ open, onClose }) {
  const IDLE = 3920.10;
  const NAV = 100.42;
  const [step, setStep] = useState(0);
  const [amt, setAmt] = useState(IDLE);
  useEffect(() => { if (open) { setStep(0); setAmt(IDLE); } }, [open]);
  if (!open) return null;
  const yr = amt * (APY / 100);
  const recvSym = 'wtSGOV';
  const recvToken = 'wtsgov';
  const recvAmt = amt / NAV;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" data-screen-label="deposit-modal">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-emerald-400/25 bg-[#0a0f17] shadow-2xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl"></div>
        {/* header */}
        <div className="relative flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2.5"><TokenDisc token="wtsgov" size={32} ring /><div><div className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-white">Start earning <ApyChip /></div><div className="text-[11px] text-gray-400">Move USDC into Savings · SGOV</div></div></div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"><Icon name="close" className="h-4 w-4" /></button>
        </div>

        {/* steps */}
        <div className="relative p-5">
          {step === 0 && (
            <div>
              <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                <div className="flex items-center justify-between text-xs text-gray-400"><span className="whitespace-nowrap">You save</span><button onClick={() => setAmt(IDLE)} className="whitespace-nowrap text-emerald-300 hover:underline">Max {fmt(IDLE)} USDC</button></div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-2xl font-bold text-gray-500">$</span>
                  <input type="text" inputMode="numeric" value={Math.round(amt).toLocaleString('en-US')}
                    onChange={(e) => setAmt(Math.min(IDLE, parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0))}
                    className="w-full bg-transparent text-2xl font-bold text-white outline-none" />
                  <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2 py-1"><TokenDisc token="usdc" size={20} /><span className="text-sm text-gray-200">USDC</span></div>
                </div>
              </div>

              <div className="my-3 flex justify-center"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/30 text-emerald-300"><Icon name="arrowRight" className="h-4 w-4 rotate-90" /></span></div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-3">
                <div className="text-xs text-gray-400">You receive</div>
                <div className="mt-1 flex items-center gap-2"><span className="w-full text-2xl font-bold text-white">{fmt(recvAmt, 3)}</span><div className="flex items-center gap-1.5 rounded-lg bg-emerald-400/15 px-2 py-1"><TokenDisc token={recvToken} size={20} /><span className="text-sm text-emerald-200">{recvSym}</span></div></div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300/70"><Icon name="sprout" className="h-3.5 w-3.5" />Auto-compounding — your balance grows on its own.</div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-white/[0.03] px-4 py-3">
                <span className="text-sm text-gray-400">Projected growth</span>
                <span className="whitespace-nowrap font-mono text-sm font-bold text-emerald-300">+${fmt(yr)} / yr</span>
              </div>
              <button onClick={() => setStep(1)} disabled={amt <= 0} className="mt-4 w-full rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-[#05241a] hover:bg-emerald-400 disabled:opacity-40">Review</button>
              <p className="mt-2 text-center text-[11px] text-gray-500">No KYC · no lockup · swap back to USDC anytime</p>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
                {[
                  ['Saving', `${fmt(amt)} USDC`],
                  ['Receiving', `${fmt(recvAmt, 3)} ${recvSym}`],
                  ['Yield', 'Auto-compounds monthly'],
                  ['Rate', `${rate()}% SEC yield`],
                  ['Est. earnings', `+$${fmt(yr)} / yr`],
                  ['Cash out', 'Swap to USDC · <10s · 24/7'],
                  ['Lockup', 'None'],
                ].map(([k, v], i) => (
                  <div key={k} className={`flex items-center justify-between gap-3 ${i === 4 ? 'border-t border-white/10 pt-2.5' : ''}`}><span className="whitespace-nowrap text-gray-400">{k}</span><span className={`whitespace-nowrap font-mono ${k === 'Est. earnings' ? 'font-bold text-emerald-300' : 'text-white'}`}>{v}</span></div>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-[11px] leading-relaxed text-gray-500">
                <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {recvSym} is tokenised SGOV — BlackRock’s short-dated US Treasury bill ETF — a real 1:1 claim on the underlying Treasuries.
              </div>
              <div className="mt-4 flex gap-2.5">
                <button onClick={() => setStep(0)} className="rounded-lg border border-white/15 px-4 py-3 text-sm font-medium text-gray-200 hover:bg-white/5">Back</button>
                <button onClick={() => { setStep(2); }} className="flex-1 rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-[#05241a] hover:bg-emerald-400">Confirm &amp; start earning</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="py-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"><Icon name="check" className="h-8 w-8" stroke={2.2} /></div>
              <h3 className="mt-4 text-lg font-bold text-white">You’re earning {rate()}%</h3>
              <p className="mx-auto mt-1.5 max-w-xs text-sm text-gray-400">{fmt(amt)} USDC is now {fmt(recvAmt, 3)} {recvSym} and compounding monthly. Track it in your portfolio.</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/[0.04] px-4 py-2 text-sm"><span className="text-gray-400">Earning</span><span className="font-mono font-bold text-emerald-300">+${fmt(yr)}/yr</span></div>
              <button onClick={onClose} className="mt-5 w-full rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-[#05241a] hover:bg-emerald-400">View in portfolio</button>
            </div>
          )}
        </div>

        {/* progress dots */}
        <div className="flex justify-center gap-1.5 pb-4">
          {[0, 1, 2].map((i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-emerald-400' : 'w-1.5 bg-white/15'}`}></span>)}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DepositModal });
