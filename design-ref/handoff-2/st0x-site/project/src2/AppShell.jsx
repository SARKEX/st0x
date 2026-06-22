// ─────────────────────────────────────────────────────────────────────────
// AppShell — faithful st0x chrome: header, Earn nav pill, dark canvas, ticker
// ─────────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <div className="flex items-center gap-[2px] select-none font-display">
      <span className="text-[22px] font-bold tracking-tight text-white">st</span>
      <span className="relative mx-[1px] flex h-[21px] w-[21px] items-center justify-center">
        <span className="absolute inset-0 rounded-full border-[3px] border-emerald-400" style={{ boxShadow: '0 0 14px rgba(45,227,166,0.45)' }}></span>
        <span className="h-[4px] w-[4px] rounded-full bg-emerald-400"></span>
      </span>
      <span className="text-[22px] font-bold tracking-tight text-white">x</span>
    </div>
  );
}

function NavLink({ label, active, onClick, badge, accent }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? accent
            ? 'bg-emerald-400/15 text-emerald-300'
            : 'bg-white/10 text-white'
          : 'text-gray-300 hover:bg-white/5 hover:text-white'
      }`}
    >
      {label}
      {badge && (
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${badge === 'New' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-iris-500/20 text-iris-300'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// The signature Save & Earn entry point: a live-APY pill that sits in the header,
// visible from every page (including Trade) without being part of it.
function EarnPill({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex items-center gap-2 overflow-hidden rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all ${
        active
          ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200'
          : 'border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-400/15'
      }`}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-emerald-300/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"></span>
      <Icon name="sprout" className="h-4 w-4" />
      <span>Earn</span>
      <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[11px] font-bold text-emerald-200">
        <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70"></span><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400"></span></span>
        {APY.toFixed(2)}%
      </span>
    </button>
  );
}

function Header({ screen, go }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070b11]/80 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-5">
          <button onClick={() => go('home')} aria-label="Home"><Logo /></button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink label="Home" active={screen === 'home'} onClick={() => go('home')} />
            <NavLink label="Trade" active={screen === 'trade'} onClick={() => go('trade')} />
            <EarnPill active={screen === 'earn'} onClick={() => go('earn')} />
            <NavLink label="Metrics" active={screen === 'metrics'} onClick={() => go('metrics')} />
          </nav>

          {/* Network selector */}
          <div className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm text-gray-200 sm:flex">
            <span className="h-2 w-2 rounded-full" style={{ background: '#7d8bff' }}></span>
            Base
          </div>

          <button onClick={() => go('dashboard')} className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-400 px-3.5 py-2 text-sm font-semibold text-[#053124] transition hover:brightness-105" style={{ boxShadow: '0 10px 30px -10px rgba(45,227,166,0.45)' }}>
            My Dashboard
            <span className="font-mono text-[11px] font-medium text-emerald-900/70">·7f3a</span>
          </button>
        </div>
      </div>
    </header>
  );
}

// Decorative dark canvas with slow-drifting glows; Earn/Dashboard warm a green glow in.
function Canvas({ screen, children }) {
  const warm = screen === 'earn' || screen === 'dashboard';
  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[#070b11]"></div>
        <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '64px 64px' }}></div>
        <div className="absolute left-1/4 top-0 h-[520px] w-[520px] rounded-full blur-3xl transition-colors duration-700" style={{ background: warm ? 'rgba(45,227,166,0.12)' : 'rgba(45,227,166,0.05)', animation: 'glowFloat1 48s ease-in-out infinite' }}></div>
        <div className="absolute bottom-1/4 right-1/4 h-[460px] w-[460px] rounded-full blur-3xl" style={{ background: 'rgba(125,139,255,0.07)', animation: 'glowFloat2 60s ease-in-out infinite' }}></div>
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// A faux browser frame so reviewers read it as "the live product"
function ProductFrame({ screen, go, children, label }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17] shadow-2xl shadow-black/60">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#0c121b] px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]"></span>
          <span className="h-3 w-3 rounded-full bg-[#febc2e]"></span>
          <span className="h-3 w-3 rounded-full bg-[#28c840]"></span>
        </div>
        <div className="ml-3 flex flex-1 items-center gap-2 rounded-md bg-white/[0.04] px-3 py-1 text-xs text-gray-400">
          <Icon name="lock" className="h-3 w-3 text-gray-500" />
          app.st0x.fi{label ? `/${label}` : ''}
        </div>
      </div>
      <div className="relative h-[760px] overflow-y-auto" data-screen-label={screen}>
        <Canvas screen={screen}>
          <Header screen={screen} go={go} />
          {children}
        </Canvas>
      </div>
    </div>
  );
}

Object.assign(window, { Logo, NavLink, EarnPill, Header, Canvas, ProductFrame });
