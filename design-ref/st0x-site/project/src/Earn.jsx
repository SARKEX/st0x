// ─────────────────────────────────────────────────────────────────────────
// Earn — the destination hub for Save & Earn (SGOV → tSGOV / wtSGOV)
// ─────────────────────────────────────────────────────────────────────────

function EarnHero({ openDeposit }) {
  const heroStats = [['$85B', 'BlackRock AUM'], ['<10s', 'Redeem · 24/7'], ['No KYC', 'Permissionless']];
  return (
    <section className="mx-auto max-w-5xl px-6 pt-12 pb-4">
      <div className="grid items-center gap-10 md:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">New</span>
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400/70">Save &amp; Earn</span>
          </div>
          <h1 className="text-[32px] font-bold leading-[1.06] tracking-tight text-white sm:text-[40px]">
            Earn <span className="text-emerald-300">{rate()}%</span> on your idle dollars.
          </h1>
          <p className="mt-2.5 text-base font-semibold text-emerald-300 sm:text-lg">Treasury-backed. No KYC. Redeem anytime.</p>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-gray-300">
            Turn idle USDC into <span className="font-semibold text-white">SGOV</span> — BlackRock’s US Treasury bill ETF, tokenised and live on Base. The only one you can hold in <span className="font-semibold text-emerald-300">any wallet</span>, then redeem to real shares in under 10 seconds.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={openDeposit} className="group flex items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-500 px-6 py-3 text-sm font-semibold text-[#05241a] transition hover:bg-emerald-400">
              Start earning {rate()}% <Icon name="arrowRight" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <a href="#earn-compare" className="rounded-lg border border-white/15 px-5 py-3 text-sm font-medium text-gray-200 hover:bg-white/5">Why SGOV</a>
          </div>
        </div>

        {/* APY display panel */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.10] to-[#070b12] p-7">
          <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5"><TokenDisc token="wtsgov" size={42} ring /><div><div className="font-semibold text-white">wtSGOV</div><div className="text-xs text-gray-400">Auto-compounding</div></div></div>
              <ApyChip size="lg" />
            </div>
            <div className="my-5"><Sparkline data={SGOV_SERIES} w={300} h={64} /></div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {heroStats.map(([v, k]) => (
                <div key={k} className="rounded-lg bg-black/30 py-2.5">
                  <div className="text-[13px] font-semibold text-white">{v}</div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">{k}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-8"><TrustStrip /></div>
    </section>
  );
}

function Pillars() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map((p) => (
          <div key={p.title} className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><Icon name={p.icon} className="h-5 w-5" /></div>
            <div className="text-sm font-semibold text-white">{p.title}</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-400">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-8">
      <h2 className="mb-6 text-center text-xl font-semibold text-white">How Save &amp; Earn works</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HOW_IT_WORKS.map((s, i) => (
          <div key={s.n} className="relative rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/30 text-sm font-bold text-emerald-300">{s.n}</div>
            <div className="text-sm font-semibold text-white">{s.t}</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-400">{s.d}</p>
            {i < HOW_IT_WORKS.length - 1 && <Icon name="arrowRight" className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-white/15 lg:block" />}
          </div>
        ))}
      </div>
    </section>
  );
}

function EarnCTA({ openDeposit }) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-10">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-r from-emerald-500/[0.12] to-[#070b12] p-8 text-center">
        <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-[480px] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl"></div>
        <div className="relative">
          <h2 className="text-2xl font-bold text-white">Your USDC is on a coffee break.</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-gray-300">Put it to work in 30 seconds. Earn {rate()}%, no KYC, redeem whenever.</p>
          <button onClick={openDeposit} className="mt-6 inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-500 px-7 py-3 text-sm font-semibold text-[#05241a] hover:bg-emerald-400">
            Start earning {rate()}% <Icon name="arrowRight" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

function Earn({ openDeposit }) {
  return (
    <div className="pb-12">
      <EarnHero openDeposit={openDeposit} />
      <Pillars />
      <section id="earn-compare" className="mx-auto max-w-5xl px-6 py-6"><TreasuryComparison /></section>
      <section className="mx-auto max-w-5xl px-6 py-6"><EarnCalculator openDeposit={openDeposit} /></section>
      <HowItWorks />
      <section className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="mb-6 text-center text-xl font-semibold text-white">Questions, answered</h2>
        <FaqAccordion />
      </section>
      <EarnCTA openDeposit={openDeposit} />
    </div>
  );
}

Object.assign(window, { Earn });
