/* ============================================================
   st0x · app router — screen switching, nav, wiring
   Depends on: ambient.js (theme + countups), data/screens/wires
   ============================================================ */
(function () {
  const S = window.ST0X;
  const screenEl = document.getElementById('screen');
  const navEl = document.getElementById('mainnav');
  const mobnav = document.getElementById('mobnav');
  const SCREENS = ['home', 'trade', 'dashboard', 'metrics'];

  function setActiveNav(name) {
    document.querySelectorAll('[data-go]').forEach(el => {
      if (el.classList.contains('navlink')) el.classList.toggle('active', el.getAttribute('data-go') === name);
      if (el.classList.contains('earnpill')) el.classList.toggle('active', name === 'dashboard');
    });
  }

  function runCountUps(root) {
    if (!window.st0xCountUp) return;
    root.querySelectorAll('[data-countup]').forEach(el => window.st0xCountUp(el));
  }

  function go(name) {
    if (!S.screens[name]) name = 'home';
    S.current = name;
    try { localStorage.setItem('st0x-screen', name); } catch (e) {}
    screenEl.innerHTML = S.screens[name]();
    setActiveNav(name);
    if (S.wires[name]) S.wires[name](screenEl, go);
    runCountUps(screenEl);
    if (mobnav && !mobnav.hidden) mobnav.hidden = true;
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  S.go = go;

  // delegated nav — any element with data-go navigates
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-go]');
    if (t) { e.preventDefault(); go(t.getAttribute('data-go')); }
  });

  // mobile menu
  const menuBtn = document.getElementById('menuBtn');
  if (menuBtn) menuBtn.addEventListener('click', () => { mobnav.hidden = !mobnav.hidden; });

  // re-run countups when theme flips (numbers stay, just a nicety) — not required

  // boot
  let start = 'home';
  try { start = localStorage.getItem('st0x-screen') || 'home'; } catch (e) {}
  if (!SCREENS.includes(start)) start = 'home';
  go(start);
})();
