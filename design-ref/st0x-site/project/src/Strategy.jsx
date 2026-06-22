// ─────────────────────────────────────────────────────────────────────────
// Strategy — the UX writeup: insight, journey, selling points, taglines
// ─────────────────────────────────────────────────────────────────────────

function Cover() {
  return (
    <header className="relative overflow-hidden border-b border-white/[0.06] px-6 py-20 text-center">
      <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[680px] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl"></div>
      <div className="relative mx-auto max-w-3xl">
        <div className="mb-5 flex items-center justify-center gap-2">
          <Logo /><span className="text-gray-600">·</span><span className="text-sm font-medium uppercase tracking-[0.25em] text-emerald-400/80">Save &amp; Earn</span>
        </div>
        <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl">
          Make idle dollars<br /><span className="text-emerald-300">earn their keep.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-gray-300">
          A UX &amp; product design exploration for launching <span className="font-semibold text-white">SGOV</span> — a yield-bearing, Treasury-backed stablecoin — as st0x’s first “Save &amp; Earn” product.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
          <span className="whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 font-semibold text-emerald-300">{rate()}% yield · no KYC</span>
          <span className="whitespace-nowrap rounded-full border border-white/10 px-4 py-1.5 text-gray-300">4 surfaces, 1 hub</span>
          <span className="whitespace-nowrap rounded-full border border-white/10 px-4 py-1.5 text-gray-300">Redeem to underlying</span>
        </div>
        <div className="mt-10 flex items-center justify-center gap-2 text-xs text-gray-500"><Icon name="arrowRight" className="h-4 w-4 rotate-90" />Scroll: strategy, then the live prototype</div>
      </div>
    </header>
  );
}

function Insight() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <SectionLabel n="01" label="The insight" />
      <div className="mt-6 grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <div>
          <h2 className="text-2xl font-bold leading-snug text-white sm:text-3xl">
            On st0x, dollars wait around as USDC between trades — earning <span className="text-gray-500 line-through">nothing</span>. That’s the opportunity.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-300">
            SGOV already trades on st0x like any other ETF. The product job isn’t new infrastructure — it’s <span className="font-semibold text-white">reframing</span> SGOV from “an ETF you could trade” into “the obvious place to keep your dollars.” That reframing is almost entirely UI: a few well-placed, consistent touches that turn idle balances into a one-tap savings habit.
        </p>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-300">
            We lead with the <span className="font-semibold text-emerald-300">no-brainer hook</span> (idle USDC = $0) and win trust with the real moat: SGOV is the <span className="font-semibold text-white">only permissionless tokenised Treasury</span> — every rival needs KYC — and it’s redeemable to the actual BlackRock shares.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="text-xs uppercase tracking-wider text-gray-500">The pitch in one line</div>
          <div className="mt-3 space-y-3">
            <div className="rounded-lg bg-black/30 p-3"><div className="text-xs text-gray-500">Idle USDC</div><div className="font-mono text-xl font-bold text-gray-400">$0 / yr</div></div>
            <div className="flex justify-center text-gray-600"><Icon name="arrowRight" className="h-4 w-4 rotate-90" /></div>
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] p-3"><div className="text-xs text-emerald-400/80">Same $10k as SGOV</div><div className="font-mono text-xl font-bold text-emerald-300">+$353 / yr</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionLabel({ n, label }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-sm text-emerald-400/70">{n}</span>
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">{label}</span>
      <span className="h-px flex-1 bg-white/[0.08]"></span>
    </div>
  );
}

function JourneyMap() {
  const stageIcon = ['info', 'chart', 'bolt', 'trendUp'];
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <SectionLabel n="02" label="The user journey" />
      <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-gray-300">Four moments, four surfaces. Each touch does one job and hands off to the next — from planting the idea to growing the balance.</p>
      <div className="mt-8 grid gap-4 lg:grid-cols-4">
        {JOURNEY.map((s, i) => (
          <div key={s.stage} className="relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><Icon name={stageIcon[i]} className="h-5 w-5" /></span>
              <span className="font-mono text-2xl font-bold text-white/10">{i + 1}</span>
            </div>
            <div className="text-base font-bold text-white">{s.stage}</div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-400/70">{s.where}</div>
            <div className="mt-3 rounded-lg bg-black/30 px-3 py-2 text-[13px] italic text-gray-300">{s.user}</div>
            <p className="mt-3 text-[13px] leading-relaxed text-gray-400">{s.move}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SellingPoints() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <SectionLabel n="03" label="Selling points & taglines" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">Why it’s a no-brainer</h3>
          <div className="space-y-3">
            {PILLARS.map((p) => (
              <div key={p.title} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><Icon name={p.icon} className="h-5 w-5" /></span>
                <div><div className="text-sm font-semibold text-white">{p.title}</div><p className="mt-0.5 text-[13px] leading-relaxed text-gray-400">{p.body}</p></div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">Taglines on the table</h3>
          <div className="space-y-2.5">
            {TAGLINES.map((t, i) => (
              <div key={i} className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${i === 0 ? 'border-emerald-400/30 bg-emerald-400/[0.06]' : 'border-white/10 bg-white/[0.02]'}`}>
                <span className={`text-base font-semibold ${i === 0 ? 'text-emerald-200' : 'text-white'}`}>“{t.line}”</span>
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-gray-500">{t.use}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 text-[13px] leading-relaxed text-gray-400">
            <span className="font-semibold text-gray-300">Naming note:</span> we use <span className="text-emerald-300">“Save &amp; Earn”</span> / “Savings” in UI for instant comprehension, but never imply a bank deposit — the modal and FAQ are explicit that SGOV is a Treasury ETF, not FDIC-insured.
          </div>
        </div>
      </div>
    </section>
  );
}

function SurfaceMap({ go }) {
  const items = [
    { k: 'home', t: 'Home callout band', d: 'Introduces it as a new product category', icon: 'sprout' },
    { k: 'trade', t: 'Header “Earn” pill', d: 'Live APY, visible from every page incl. trading', icon: 'bolt' },
    { k: 'earn', t: 'Earn hub', d: 'The destination: compare, calculate, convert', icon: 'chart' },
    { k: 'portfolio', t: 'Portfolio “Savings” card', d: 'Shows it working + idle-cash nudges', icon: 'wallet' },
  ];
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <SectionLabel n="04" label="Where it lives — jump in" />
      <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-gray-300">Light-touch and additive: no page is rebuilt. Four new components, one consistent green “earning” signature. Click any surface to open it in the live prototype below.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <button key={it.k} onClick={() => go(it.k)} className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-left transition hover:border-emerald-400/30 hover:bg-emerald-400/[0.05]">
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><Icon name={it.icon} className="h-5 w-5" /></span>
            <div className="text-sm font-semibold text-white">{it.t}</div>
            <p className="mt-1 flex-1 text-[13px] leading-relaxed text-gray-400">{it.d}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-emerald-300">Open <Icon name="arrowRight" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Strategy({ go }) {
  return (
    <div>
      <Cover />
      <Insight />
      <JourneyMap />
      <SellingPoints />
      <SurfaceMap go={go} />
    </div>
  );
}

Object.assign(window, { Strategy });
