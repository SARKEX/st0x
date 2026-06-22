// ─────────────────────────────────────────────────────────────────────────
// App — strategy dossier above, the live navigable prototype below
// ─────────────────────────────────────────────────────────────────────────

function ScreenTabs({ screen, go }) {
  const tabs = [['home', 'Home'], ['trade', 'Trade'], ['earn', 'Earn'], ['portfolio', 'Portfolio']];
  return (
    <div className="mb-4 flex flex-wrap items-center justify-center gap-1.5">
      {tabs.map(([k, label]) => {
        const active = screen === k, earn = k === 'earn';
        return (
          <button key={k} onClick={() => go(k)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              active ? (earn ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40' : 'bg-white/10 text-white ring-1 ring-white/15')
                     : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}>
            {label}{earn && <span className="ml-1.5 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">New</span>}
          </button>
        );
      })}
    </div>
  );
}

function App() {
  const [screen, setScreen] = useState('home');
  const [modal, setModal] = useState(false);
  const protoRef = useRef(null);
  const scrollRef = useRef(null);

  const setScreenTop = (s) => {
    setScreen(s);
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; });
  };

  // From the strategy section: switch screen AND bring the prototype into view
  const goAndScroll = (s) => {
    setScreenTop(s);
    requestAnimationFrame(() => {
      if (protoRef.current) {
        const y = protoRef.current.getBoundingClientRect().top + window.scrollY - 16;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    });
  };

  const openDeposit = () => setModal(true);

  return (
    <div>
      <Strategy go={goAndScroll} />

      {/* Prototype */}
      <section ref={protoRef} className="border-t border-white/[0.06] bg-white/[0.015] px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/70">Live prototype</div>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Click through the real thing</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-gray-400">Fully interactive. Switch screens, run the calculator, and take the “Start earning” flow end-to-end.</p>
          </div>
          <ScreenTabs screen={screen} go={setScreenTop} />
          <ProductFrameWithRef screen={screen} go={setScreenTop} openDeposit={openDeposit} scrollRef={scrollRef} />
        </div>
      </section>

      <footer className="border-t border-white/[0.06] px-6 py-10 text-center">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2">
          <Logo />
          <p className="text-sm text-gray-500">Save &amp; Earn (SGOV) — UX &amp; design exploration. Yield figures illustrative; not investment advice.</p>
        </div>
      </footer>

      <DepositModal open={modal} onClose={() => { setModal(false); }} />
    </div>
  );
}

// ProductFrame variant that exposes the inner scroll container ref + routes screens
function ProductFrameWithRef({ screen, go, openDeposit, scrollRef }) {
  const label = { home: '', trade: 'trade/tNVDA', earn: 'earn', portfolio: 'dashboard' }[screen];
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17] shadow-2xl shadow-black/60">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#0d1320] px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]"></span>
          <span className="h-3 w-3 rounded-full bg-[#febc2e]"></span>
          <span className="h-3 w-3 rounded-full bg-[#28c840]"></span>
        </div>
        <div className="ml-3 flex flex-1 items-center gap-2 rounded-md bg-white/[0.04] px-3 py-1 text-xs text-gray-400">
          <Icon name="lock" className="h-3 w-3 text-gray-500" />app.st0x.fi{label ? `/${label}` : ''}
        </div>
      </div>
      <div ref={scrollRef} className="relative h-[768px] overflow-y-auto" data-screen-label={screen}>
        <Canvas screen={screen}>
          <Header screen={screen} go={go} />
          {screen === 'home' && <Home go={go} openDeposit={openDeposit} />}
          {screen === 'trade' && <Trade go={go} />}
          {screen === 'earn' && <Earn openDeposit={openDeposit} />}
          {screen === 'portfolio' && <Portfolio openDeposit={openDeposit} />}
        </Canvas>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
