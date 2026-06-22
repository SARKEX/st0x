// ─────────────────────────────────────────────────────────────────────────
// HomeMarketing — the marketing story for the landing page, built from the
// real tSGOV/wtSGOV one-pager assets: headline stats, the permissionless
// moat comparison, why-it-wins pillars, and a closing trust CTA.
// ─────────────────────────────────────────────────────────────────────────

// 1 ── Headline stats strip
function StatStrip() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-10">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.k} className="bg-[#070b11] px-5 py-6 text-center">
            <div className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">{s.v}</div>
            <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">{s.k}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// 2 ── The moat — slimmed to a single permissionless callout (no big table)
function MoatSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-r from-emerald-500/[0.08] via-[#0b1712] to-[#0b0f17] px-6 py-7 sm:px-8">
        <div className="pointer-events-none absolute -left-10 -top-12 h-44 w-44 rounded-full bg-emerald-400/12 blur-3xl"></div>
        <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/12 text-emerald-300"><Icon name="unlock" className="h-5 w-5" /></span>
            <div>
              <h2 className="text-[19px] font-bold tracking-tight text-white sm:text-[21px]">The only permissionless tokenised Treasury.</h2>
              <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-gray-400">Every other meaningful tokenised T-bill gates access behind KYC. SGOV holds in any wallet and works in any DeFi protocol — no allowlist, no minimum.</p>
            </div>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[12px] font-semibold text-emerald-300">No KYC</span>
        </div>
      </div>
    </section>
  );
}

// 3 ── Why st0x — the three original points, adjusted for the yield product
function WhySection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <div className="mx-auto max-w-2xl text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/70">Why st0x</div>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-[32px]">Tokenised equities &amp; yield, done properly.</h2>
      </div>
      <div className="mt-10 grid gap-8 sm:grid-cols-3">
        {HOME_PILLARS.map((p) => (
          <div key={p.title} className="flex flex-col items-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/[0.08] text-emerald-300"><Icon name={p.icon} className="h-7 w-7" /></span>
            <div className="mt-4 text-[18px] font-bold tracking-tight text-white">{p.title}</div>
            <p className="mt-2 max-w-[17rem] text-[13.5px] leading-relaxed text-gray-400">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// 4 ── Closing CTA + trust row
function ClosingCTA({ openDeposit, go }) {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-20">
      <div className="relative overflow-hidden rounded-3xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.12] via-[#0b1712] to-[#0b0f17] px-6 py-12 text-center sm:py-16">
        <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[680px] -translate-x-1/2 rounded-full bg-emerald-400/12 blur-3xl"></div>
        <div className="relative mx-auto max-w-2xl">
          <ApyChip size="lg" />
          <h2 className="mt-5 text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-[40px]">
            Make idle dollars<br /><span className="text-emerald-300">earn their keep.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-gray-300">
            Move USDC into SGOV in one tap and start earning ~{rate()}% a year — backed 1:1 by BlackRock’s Treasury ETF, redeemable anytime.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button onClick={openDeposit} className="group flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-[#05241a] transition hover:bg-emerald-400">
              Start earning {rate()}%
              <Icon name="arrowRight" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button onClick={() => go('earn')} className="rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-gray-200 transition hover:bg-white/5">How it works</button>
          </div>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/[0.08] pt-6 text-[12px] text-gray-500">
            {TRUST.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5"><Icon name="check" className="h-3.5 w-3.5 text-emerald-400/70" />{t}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// 5 ── "Built by pioneers from" — credibility logos, at the very bottom of Home
function PioneersFooter() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-16 pt-2">
      <div className="text-center">
        <div className="text-[13px] font-medium text-gray-500">Built by pioneers from</div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
          {PIONEERS.map((name) => (
            <span key={name} className="text-[19px] font-semibold tracking-wide text-gray-500 grayscale transition hover:text-gray-300" style={{ fontFamily: name === 'HOLO' ? 'var(--font-mono)' : 'var(--font-display)', letterSpacing: name === 'HOLO' ? '0.35em' : '-0.01em' }}>
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { StatStrip, MoatSection, WhySection, ClosingCTA, PioneersFooter });
