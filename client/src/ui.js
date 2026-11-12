// Main menu and end screen. Only builds the screens; the game logic stays in main.js.
// Same API as before: createMenu({...}) and createEndScreen({...}), so main.js needs no changes.

const CSS = `
.ui-layer{position:fixed;inset:0;z-index:20;display:none;pointer-events:none;font-family:system-ui,'Segoe UI',sans-serif;color:#fff}
.ui-layer.show{display:flex}

/* ---------- MAIN MENU ---------- */
.menu-panel{pointer-events:auto;position:relative;display:flex;flex-direction:column;width:430px;max-width:100vw;height:100%;box-sizing:border-box;color:#f2eee2;background:#1e2024;animation:menuIn .3s ease-out}
.menu-panel::after{content:'';position:absolute;top:0;right:0;bottom:0;width:5px;background:repeating-linear-gradient(180deg,#c82026 0 16px,#f2eee2 16px 32px)}
@keyframes menuIn{from{transform:translateX(-28px);opacity:0}to{transform:none;opacity:1}}
.menu-head{padding:24px 28px 10px 26px}
.menu-title{margin:0;font:400 56px/1 Impact,Haettenschweiler,'Arial Narrow Bold',sans-serif;letter-spacing:2px;color:#f2eee2;text-shadow:3px 3px 0 #c82026}
.menu-tag{margin:12px 0 0;font-size:14px;color:#b9b5aa}
.menu-load{height:3px;overflow:hidden}
.menu-load i{display:none;width:35%;height:100%;background:#ffb000}
.ui-layer.busy .menu-load i{display:block;animation:menuLoad .9s linear infinite}
@keyframes menuLoad{from{transform:translateX(-100%)}to{transform:translateX(300%)}}
.menu-scroll{flex:1;overflow-y:auto;padding:4px 28px 14px 26px;scrollbar-width:thin;scrollbar-color:#55585f transparent}
.ui-layer.busy .menu-scroll{opacity:.55;pointer-events:none}
.menu-h{margin:18px 0 8px;font-size:15px;font-weight:700}

.menu-routes{display:flex;flex-direction:column;gap:6px}
.route{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;padding:8px 12px 8px 10px;text-align:left;color:inherit;font:inherit;background:rgba(242,238,226,.05);border:0;border-left:4px solid transparent;border-radius:4px;cursor:pointer}
.route:hover{background:rgba(242,238,226,.1)}
.route.on{background:rgba(242,238,226,.13);border-left-color:#c82026}
.route-land{position:relative;flex:none;width:46px;height:46px;border-radius:4px;overflow:hidden;background:linear-gradient(var(--sky) 0 52%,var(--ground) 52% 100%)}
.route-land::after{content:'';position:absolute;left:0;right:0;bottom:0;height:48%;background:var(--road);clip-path:polygon(38% 0,62% 0,100% 100%,0 100%)}
.route-land b{position:absolute;left:4px;top:2px;z-index:1;font:400 14px Impact,'Arial Narrow Bold',sans-serif;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.7)}
.route-text{flex:1;min-width:0}
.route-name{display:block;font-size:15px;font-weight:700}
.route-meta{display:block;margin-top:2px;font-size:12px;color:#b9b5aa}
.route-best{flex:none;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;color:#ffb000}
.route-best.none{font-size:12px;font-weight:400;color:#8d8a82}

.menu-buses{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.bus{padding:14px 10px 10px;text-align:left;color:inherit;font:inherit;background:rgba(242,238,226,.05);border:2px solid transparent;border-radius:8px;cursor:pointer}
.bus:hover{background:rgba(242,238,226,.1)}
.bus.on{border-color:#f2eee2;background:rgba(242,238,226,.13)}
.livery{position:relative;height:30px;margin:0 6px 16px;border-radius:5px 5px 2px 2px;background:linear-gradient(var(--roof) 0 16%,var(--body) 16% 60%,var(--stripe) 60% 68%,var(--lower) 68% 100%)}
.livery i{position:absolute;left:10%;right:6%;top:22%;height:30%;background:repeating-linear-gradient(90deg,#1c2a3a 0 11px,transparent 11px 15px)}
.livery b{position:absolute;bottom:-6px;width:12px;height:12px;box-sizing:border-box;border-radius:50%;background:#111;border:2px solid #8a8d94}
.livery b:first-of-type{left:14%}
.livery b:last-of-type{right:16%}
.bus-name{display:block;font-size:14px;font-weight:700}
.bus-len{display:block;margin-top:1px;font-size:12px;color:#b9b5aa}

.menu-foot{padding:14px 28px 18px 26px;border-top:1px solid rgba(242,238,226,.12)}
.menu-note{min-height:17px;margin:0 0 6px;font-size:13px;color:#ffb000}
.menu-start{display:block;width:100%;padding:13px 16px;text-align:center;font:700 20px/1.1 system-ui,'Segoe UI',sans-serif;color:#f2eee2;background:#c82026;border:0;border-radius:4px;cursor:pointer}
.menu-start small{display:block;margin-top:4px;font-size:12px;font-weight:400;opacity:.85}
.menu-start:hover{background:#dc2a31}
.menu-start:active{background:#a8181e}
.menu-multi{display:flex;justify-content:space-between;align-items:center;width:100%;box-sizing:border-box;margin-top:8px;padding:10px 16px;font:600 15px system-ui,'Segoe UI',sans-serif;color:#f2eee2;background:transparent;border:2px solid rgba(242,238,226,.3);border-radius:4px;cursor:pointer}
.menu-multi:hover{border-color:rgba(242,238,226,.6)}
.menu-multi small{font-size:12px;font-weight:400;color:#b9b5aa}
.menu-keys{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:8px 10px;align-items:center;margin:16px 0 0;font-size:12px;color:#b9b5aa}
.menu-keys kbd{padding:2px 6px;font:600 11px system-ui,'Segoe UI',sans-serif;white-space:nowrap;color:#f2eee2;background:#2d3036;border:1px solid #4a4d55;border-radius:3px}
.menu-hint{position:fixed;right:20px;bottom:16px;font-size:13px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8);pointer-events:none}
.menu-panel button:focus-visible{outline:2px solid #ffb000;outline-offset:2px}

@media (max-width:720px){
  .menu-panel{width:100%}
  .menu-title{font-size:44px}
  .menu-hint{display:none}
}
@media (max-height:640px){
  .menu-title{font-size:42px}
  .menu-keys{display:none}
}
@media (prefers-reduced-motion:reduce){
  .menu-panel{animation:none}
  .ui-layer.busy .menu-load i{animation:none;width:100%}
}

/* ---------- COMPACT MENU (fits the screen without scrolling) ---------- */
.menu-head{padding:14px 24px 4px 22px}
.menu-title{font-size:42px}
.menu-tag{margin:6px 0 0;font-size:13px}
.menu-scroll{padding:2px 24px 8px 22px}
.menu-h{margin:10px 0 6px;font-size:13px}

.menu-routes{gap:4px}
.route{gap:10px;padding:4px 10px 4px 8px}
.route-land{width:34px;height:34px}
.route-land b{font-size:12px}
.route-name{font-size:14px}
.route-meta{margin-top:0;font-size:11px}
.route-best{font-size:12px}
.route-best.none{font-size:11px}

.menu-buses{grid-template-columns:repeat(3,1fr);gap:6px}
.bus{padding:8px 6px 6px}
.livery{height:20px;margin:0 4px 12px}
.livery b{width:9px;height:9px}
.bus-name{font-size:12px}
.bus-len{font-size:11px}

.menu-foot{padding:10px 24px 12px 22px}
.menu-start{padding:9px 14px;font-size:18px}
.menu-start small{margin-top:2px;font-size:11px}
.menu-multi{margin-top:6px;padding:7px 14px;font-size:14px}
.menu-keys{margin:10px 0 0;gap:5px 8px}

@media (max-height:860px){
  .menu-keys{display:none}        /* hide the key hints on shorter screens */
}

/* ---------- END SCREEN ---------- */
.ui-title{margin:0;font-size:34px;letter-spacing:2px}
.ui-sub{margin:6px 0 18px;opacity:.75;font-size:14px}
.ui-go{width:100%;margin-top:12px;padding:14px;font-size:18px;font-weight:700;letter-spacing:1px;color:#fff;border:0;border-radius:10px;cursor:pointer}
.ui-go.green{background:#2e9e4f}.ui-go.green:hover{background:#38b85d}
.ui-go.grey{background:#555}.ui-go.grey:hover{background:#6a6a6a}
.ui-center{align-items:center;justify-content:center;background:rgba(0,0,0,.45)}
.ui-card{pointer-events:auto;width:440px;max-width:92vw;max-height:94vh;overflow-y:auto;box-sizing:border-box;padding:28px;border-radius:16px;background:rgba(12,20,34,.96);text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.ui-big{display:flex;justify-content:space-around;margin:16px 0}
.ui-big div{display:flex;flex-direction:column;gap:2px}
.ui-big span{font-size:12px;letter-spacing:1.5px;opacity:.65}
.ui-big b{font-size:30px}
.ui-rows{margin:6px 0 18px;text-align:left}
.ui-row{display:flex;justify-content:space-between;padding:6px 2px;border-bottom:1px solid rgba(255,255,255,.1);font-size:15px}
.ui-badge{display:inline-block;margin:2px 0 6px;padding:4px 12px;border-radius:20px;background:#ffd60a;color:#222;font-weight:700;font-size:13px}
.ui-btns{display:flex;gap:10px}
.ui-btns .ui-go{margin-top:0}
`;

const GRADE_COLORS = { S: '#ffd60a', A: '#4ade80', B: '#60a5fa', C: '#fb923c', D: '#f87171' };

let styled = false;
function addStyle() {
  if (styled) return;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
  styled = true;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// A button that drops keyboard focus after a click (so Space can't press it again)
function press(btn, fn) {
  btn.onclick = () => { btn.blur(); fn(); };
}

function fmt(t) {
  return Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0');
}

function cssColor(hex) {
  return '#' + (hex ?? 0x888888).toString(16).padStart(6, '0');
}

// ---------- facts shown on the route rows ----------
function routeKm(map) {
  let len = 0;
  for (let i = 1; i < map.points.length; i++) {
    len += Math.hypot(map.points[i][0] - map.points[i - 1][0], map.points[i][1] - map.points[i - 1][1]);
  }
  return (len * 1.06) / 1000;    // the smooth road is a little longer than the straight lines between points
}

function climbMetres(map) {
  if (!map.elevation) return 0;
  const heights = map.elevation.map((p) => p[1]);
  return Math.round(Math.max(...heights) - Math.min(...heights));
}

function routeFacts(map) {
  const parts = [routeKm(map).toFixed(1) + ' km'];
  const climb = climbMetres(map);
  parts.push(climb > 0 ? 'climbs ' + climb + ' m' : 'flat road');
  const towns = map.towns?.length ?? 0;
  if (towns > 0) parts.push(towns + (towns === 1 ? ' town' : ' towns'));
  const stops = map.busStops?.length ?? 0;
  if (stops > 0) parts.push(stops + (stops === 1 ? ' stop' : ' stops'));
  return parts.join(', ');
}

// Same key main.js uses when it saves a result
function savedBest(map) {
  try {
    const t = parseFloat(localStorage.getItem('bestTime_' + map.name));
    return t > 0 ? t : null;
  } catch {
    return null;
  }
}

// A little side-on picture of the bus in its real colours
function livery(style) {
  const d = el('div', 'livery');
  d.style.setProperty('--roof', cssColor(style.roof));
  d.style.setProperty('--body', cssColor(style.body));
  d.style.setProperty('--stripe', cssColor(style.stripe));
  d.style.setProperty('--lower', cssColor(style.lower));
  d.append(el('i'), el('b'), el('b'));
  return d;
}

// ---------- MAIN MENU ----------
export function createMenu({ title, maps, busStyles, onPickMap, onPickBus, onSingle, onMulti }) {
  addStyle();
  const layer = el('div', 'ui-layer');
  const panel = el('div', 'menu-panel');
  layer.appendChild(panel);

  const sel = { map: -1, bus: -1 };
  let busy = false;

  // --- header ---
  const head = el('div', 'menu-head');
  head.append(el('h1', 'menu-title', title), el('p', 'menu-tag', 'Drive from the first bus stand to the last.'));
  const load = el('div', 'menu-load');
  load.appendChild(el('i'));
  const scroll = el('div', 'menu-scroll');
  panel.append(head, load, scroll);

  // --- routes ---
  scroll.appendChild(el('h2', 'menu-h', 'Choose a route'));
  const routeList = el('div', 'menu-routes');
  const routes = maps.map((m, i) => {
    const b = el('button', 'route');
    b.type = 'button';
    const land = el('span', 'route-land');
    land.style.setProperty('--sky', cssColor(m.skyColor));
    land.style.setProperty('--ground', cssColor(m.groundColor));
    land.style.setProperty('--road', cssColor(m.roadColor));
    land.appendChild(el('b', '', String(i + 1).padStart(2, '0')));
    const text = el('span', 'route-text');
    text.append(el('span', 'route-name', m.name), el('span', 'route-meta', routeFacts(m)));
    const best = el('span', 'route-best');
    b.append(land, text, best);
    press(b, () => choose('map', i, onPickMap));
    routeList.appendChild(b);
    return { b, best, map: m };
  });
  scroll.appendChild(routeList);

  // --- buses ---
  scroll.appendChild(el('h2', 'menu-h', 'Choose a bus'));
  const busGrid = el('div', 'menu-buses');
  const buses = busStyles.map((s, i) => {
    const b = el('button', 'bus');
    b.type = 'button';
    b.append(livery(s), el('span', 'bus-name', s.name), el('span', 'bus-len', s.length + ' m long'));
    press(b, () => choose('bus', i, onPickBus));
    busGrid.appendChild(b);
    return b;
  });
  scroll.appendChild(busGrid);

  // --- footer: start button, multiplayer, controls ---
  const foot = el('div', 'menu-foot');
  const note = el('p', 'menu-note', '');

  const start = el('button', 'menu-start', 'Start race');
  start.type = 'button';
  start.appendChild(el('small', '', 'Single player'));
  press(start, () => {
    if (busy) return;
    note.textContent = '';
    onSingle();
  });

  const multi = el('button', 'menu-multi', 'Multiplayer');
  multi.type = 'button';
  if (!onMulti) multi.appendChild(el('small', '', 'Coming soon'));
  press(multi, () => {
    if (busy) return;
    if (onMulti) onMulti();
    else note.textContent = 'Multiplayer is coming soon.';
  });

  const keys = el('div', 'menu-keys');
  for (const [k, what] of [
    ['W A S D / arrows', 'Drive'], ['Space', 'Handbrake'],
    ['R', 'Back to start'], ['V', 'Camera'],
    ['H', 'Horn'], ['M', 'Mute'],
    ['Esc', 'Menu'],
  ]) {
    keys.append(el('kbd', '', k), el('span', '', what));
  }

  foot.append(note, start, multi, keys);
  panel.appendChild(foot);

  layer.appendChild(el('div', 'menu-hint', 'Drag to rotate the bus, scroll to zoom.'));
  document.body.appendChild(layer);

  // --- behaviour ---
  function paint() {
    routes.forEach(({ b }, i) => {
      b.classList.toggle('on', i === sel.map);
      b.setAttribute('aria-pressed', String(i === sel.map));
    });
    buses.forEach((b, i) => {
      b.classList.toggle('on', i === sel.bus);
      b.setAttribute('aria-pressed', String(i === sel.bus));
    });
  }

  function refreshBest() {
    routes.forEach(({ best, map }) => {
      const t = savedBest(map);
      best.textContent = t ? 'Best ' + fmt(t) : 'No time yet';
      best.classList.toggle('none', !t);
    });
  }

  // Picking a map rebuilds the whole world, which can freeze the page for a moment.
  // Mark the choice and show the loading strip first, then do the heavy work.
  function choose(kind, i, callback) {
    if (busy || sel[kind] === i) return;
    busy = true;
    sel[kind] = i;
    paint();
    layer.classList.add('busy');
    note.textContent = kind === 'map' ? 'Loading route…' : '';
    setTimeout(() => {
      try {
        callback(i);
      } finally {
        busy = false;
        layer.classList.remove('busy');
        note.textContent = '';
      }
    }, 50);
  }

  // Enter starts the race (unless a button already has focus, since Enter would press it)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' || e.repeat || busy) return;
    if (!layer.classList.contains('show')) return;
    if (e.target instanceof HTMLElement && e.target.closest('button')) return;
    note.textContent = '';
    onSingle();
  });

  return {
    show() { refreshBest(); layer.classList.add('show'); },
    hide() { layer.classList.remove('show'); },
    select(mapIndex, busIndex) {
      sel.map = mapIndex;
      sel.bus = busIndex;
      paint();
    },
    setNote(text) { note.textContent = text; },
  };
}
// ---------- PAUSE MENU ----------
export function createPauseMenu({ onResume, onRestart, onMenu, audio }) {
  addStyle();
  const layer = el('div', 'ui-layer ui-center');
  const card = el('div', 'ui-card');
  layer.appendChild(card);
  document.body.appendChild(layer);

  const stack = () => {
    const d = el('div');
    d.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:18px';
    return d;
  };
  const button = (text, cls, fn) => {
    const b = el('button', 'ui-go ' + cls, text);
    b.style.marginTop = '0';
    b.type = 'button';
    press(b, fn);
    return b;
  };

  function mainView() {
    card.replaceChildren();
    card.append(el('h1', 'ui-title', 'PAUSED'), el('p', 'ui-sub', 'Press Esc to resume'));
    const list = stack();
    list.append(
      button('RESUME', 'green', onResume),
      button('RESTART', 'grey', onRestart),
      button('OPTIONS', 'grey', optionsView),
      button('MAIN MENU', 'grey', onMenu)
    );
    card.append(list);
  }

  function optionsView() {
    card.replaceChildren();
    card.append(el('h1', 'ui-title', 'OPTIONS'), el('p', 'ui-sub', 'Sound settings'));
    const list = stack();

    const sound = button('', 'grey', () => { audio.toggleMute(); sound.textContent = soundText(); });
    const soundText = () => 'Sound: ' + (audio.isMuted() ? 'OFF' : 'ON');
    sound.textContent = soundText();

    const row = el('div');
    row.style.cssText = 'text-align:left;font-size:15px';
    const label = el('span', '', 'Volume: ' + Math.round(audio.getVolume() * 100) + '%');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(audio.getVolume() * 100));
    slider.style.cssText = 'width:100%;margin-top:8px;accent-color:#c82026';
    slider.oninput = () => {
      audio.setVolume(slider.value / 100);
      label.textContent = 'Volume: ' + slider.value + '%';
    };
    row.append(label, slider);

    list.append(sound, row, button('BACK', 'green', mainView));
    card.append(list);
  }

  return {
    show() { mainView(); layer.classList.add('show'); },
    hide() {
      layer.classList.remove('show');
      if (document.activeElement) document.activeElement.blur();
    },
  };
}

// ---------- END SCREEN ----------
export function createEndScreen({ onRestart, onMenu }) {
  addStyle();
  const layer = el('div', 'ui-layer ui-center');
  const card = el('div', 'ui-card');
  layer.appendChild(card);
  document.body.appendChild(layer);

  function stat(label, value, color) {
    const d = el('div');
    const b = el('b', '', value);
    if (color) b.style.color = color;
    d.append(el('span', '', label), b);
    return d;
  }

  return {
    show(r) {
      card.replaceChildren();
      card.append(el('h1', 'ui-title', 'ROUTE COMPLETE'));
      card.append(el('p', 'ui-sub', r.mapName + '  ·  ' + r.busName));
      if (r.newBest) card.append(el('div', 'ui-badge', 'NEW BEST TIME!'));

      const big = el('div', 'ui-big');
      big.append(
        stat('TIME', fmt(r.time)),
        stat('SCORE', r.score.toLocaleString()),
        stat('GRADE', r.grade, GRADE_COLORS[r.grade])
      );
      card.append(big);

      const rows = el('div', 'ui-rows');
      const data = [
        ['Top speed', Math.round(r.topSpeed) + ' km/h'],
        ['Average speed', Math.round(r.avgSpeed) + ' km/h'],
        ['Crashes', String(r.crashes)],
        ['Route length', (r.distance / 1000).toFixed(2) + ' km'],
        ['Best time on this map', fmt(r.bestTime)],
        ['Time score', r.timeScore.toLocaleString()],
        ['Top speed bonus', '+' + r.speedBonus.toLocaleString()],
        ['Crash penalty', '-' + r.penalty.toLocaleString()],
        ['Bus stops served', r.stopsServed + ' / ' + r.stopsTotal],
        ['Skipped stop penalty', '+' + r.stopPenalty + ' s'],
      ];
      for (const [k, v] of data) {
        const row = el('div', 'ui-row');
        row.append(el('span', '', k), el('span', '', v));
        rows.append(row);
      }
      card.append(rows);

      const btns = el('div', 'ui-btns');
      const again = el('button', 'ui-go green', 'RESTART');
      const menu = el('button', 'ui-go grey', 'MAIN MENU');
      press(again, onRestart);
      press(menu, onMenu);
      btns.append(again, menu);
      card.append(btns);

      layer.classList.add('show');
    },
    hide() { layer.classList.remove('show'); },
  };
}
// ---------- MULTIPLAYER SCREENS (lobby, countdown, results) ----------
const LOBBY_CSS = `
.lb-input{width:100%;box-sizing:border-box;padding:11px 12px;font:inherit;font-size:15px;color:#f2eee2;background:rgba(242,238,226,.08);border:2px solid transparent;border-radius:4px;outline:none}
.lb-input:focus{border-color:#ffb000}
.lb-codein{text-transform:uppercase;letter-spacing:4px;font-weight:700}
.lb-or{margin:18px 0 8px;font-size:13px;color:#8d8a82;text-align:center}
.lb-row{display:flex;gap:8px}
.lb-row .lb-input{flex:1}
.lb-row .menu-start{flex:none;width:auto;padding:11px 22px;font-size:16px}
.lb-code{margin:2px 0;font:400 68px/1 Impact,Haettenschweiler,'Arial Narrow Bold',sans-serif;letter-spacing:12px;color:#f2eee2;text-shadow:3px 3px 0 #c82026}
.lb-hint{margin:6px 0 0;font-size:13px;color:#b9b5aa}
.lb-player{display:flex;align-items:center;gap:10px;margin-bottom:6px;padding:9px 12px;background:rgba(242,238,226,.06);border-left:4px solid var(--c);border-radius:4px}
.lb-player b{flex:1;font-size:15px}
.lb-player span{font-size:12px;color:#b9b5aa}
.lb-player .lb-ok{font-size:13px;font-weight:700;color:#4ade80}
.lb-player .lb-wait{font-size:13px;color:#8d8a82}
.menu-start:disabled{opacity:.45;cursor:default}
.menu-start:disabled:hover{background:#c82026}
.mp-count{position:fixed;inset:0;z-index:22;display:none;align-items:center;justify-content:center;pointer-events:none;font:400 180px Impact,Haettenschweiler,'Arial Narrow Bold',sans-serif;color:#fff;text-shadow:6px 6px 0 #c82026,0 0 30px rgba(0,0,0,.5)}
.mp-count.show{display:flex}
`;

let lobbyStyled = false;
function addLobbyStyle() {
  if (lobbyStyled) return;
  const s = document.createElement('style');
  s.textContent = LOBBY_CSS;
  document.head.appendChild(s);
  lobbyStyled = true;
}

const SLOT_COLORS = ['#ffb000', '#4ade80', '#60a5fa', '#f472b6'];   // one colour for each start bay

export function createLobby({ maps, busStyles, onCreate, onJoin, onReady, onStart, onLeave }) {
  addStyle();
  addLobbyStyle();
  let busy = false;
  let myId = null;
  let current = null;

  const layer = el('div', 'ui-layer');
  const panel = el('div', 'menu-panel');
  layer.appendChild(panel);

  const head = el('div', 'menu-head');
  head.append(el('h1', 'menu-title', 'MULTIPLAYER'), el('p', 'menu-tag', 'Race your friends to the last bus stand.'));
  const load = el('div', 'menu-load');
  load.appendChild(el('i'));
  const scroll = el('div', 'menu-scroll');
  const foot = el('div', 'menu-foot');
  panel.append(head, load, scroll, foot);

  const note = el('p', 'menu-note', '');
  const setNote = (t) => { note.textContent = t; };

  // --- view 1: create or join ---
  const entry = el('div');
  entry.appendChild(el('h2', 'menu-h', 'Your name'));
  const nameInput = el('input', 'lb-input');
  nameInput.maxLength = 16;
  nameInput.placeholder = 'Your name';
  nameInput.autocomplete = 'off';
  try { nameInput.value = localStorage.getItem('buspisso_name') || ''; } catch { /* ignore */ }
  entry.appendChild(nameInput);

  entry.appendChild(el('h2', 'menu-h', 'Start a room'));
  const createBtn = el('button', 'menu-start', 'Create room');
  createBtn.type = 'button';
  createBtn.appendChild(el('small', '', 'Uses the route and bus you picked in the main menu'));
  entry.appendChild(createBtn);

  entry.appendChild(el('p', 'lb-or', 'or join a friend'));
  const joinRow = el('div', 'lb-row');
  const codeInput = el('input', 'lb-input lb-codein');
  codeInput.maxLength = 4;
  codeInput.placeholder = 'CODE';
  codeInput.autocomplete = 'off';
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
  });
  const joinBtn = el('button', 'menu-start', 'Join');
  joinBtn.type = 'button';
  joinRow.append(codeInput, joinBtn);
  entry.appendChild(joinRow);

  function getName() {
    const n = nameInput.value.trim() || 'Player';
    try { localStorage.setItem('buspisso_name', n); } catch { /* ignore */ }
    return n;
  }
  function doJoin() {
    if (busy) return;
    const code = codeInput.value.trim();
    if (code.length !== 4) { setNote('Enter the 4-letter room code'); return; }
    setNote('');
    onJoin(getName(), code);
  }
  press(createBtn, () => { if (busy) return; setNote(''); onCreate(getName()); });
  press(joinBtn, doJoin);

  // Typing here must not steer the bus or toggle sounds (W, A, S, D, R, H, M and F are game keys)
  for (const input of [nameInput, codeInput]) {
    input.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        if (input === codeInput) doJoin();
        else codeInput.focus();
      }
      e.stopPropagation();
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
  }

  // --- view 2: inside a room ---
  const roomView = el('div');
  roomView.appendChild(el('h2', 'menu-h', 'Room code'));
  const codeEl = el('div', 'lb-code', '');
  roomView.append(codeEl, el('p', 'lb-hint', 'Give this code to your friends (2 to 4 players).'));
  const playersH = el('h2', 'menu-h', 'Players');
  const list = el('div');
  roomView.append(playersH, list, el('h2', 'menu-h', 'Route'));
  const routeBox = el('div', 'route on');
  routeBox.style.cursor = 'default';
  const routeText = el('span', 'route-text');
  const routeName = el('span', 'route-name', '');
  const routeMeta = el('span', 'route-meta', '');
  routeText.append(routeName, routeMeta);
  routeBox.appendChild(routeText);
  roomView.appendChild(routeBox);

  // --- footer ---
  const primary = el('button', 'menu-start', '');
  primary.type = 'button';
  const leaveBtn = el('button', 'menu-multi', 'Leave room');
  leaveBtn.type = 'button';
  foot.append(note, primary, leaveBtn);
  scroll.append(entry, roomView);
  document.body.appendChild(layer);

  press(primary, () => {
    if (busy || !current) return;
    if (current.hostId === myId) onStart();
    else onReady(!current.players.find((p) => p.id === myId)?.ready);
  });
  press(leaveBtn, () => { if (!busy) onLeave(); });

  function showEntry() {
    current = null;
    entry.style.display = '';
    roomView.style.display = 'none';
    primary.style.display = 'none';
    leaveBtn.textContent = 'Back to main menu';
  }

  function showRoom(room, id) {
    myId = id;
    current = room;
    entry.style.display = 'none';
    roomView.style.display = '';
    primary.style.display = '';
    leaveBtn.textContent = 'Leave room';
    codeEl.textContent = room.code;
    playersH.textContent = 'Players (' + room.players.length + ' of 4)';

    list.replaceChildren();
    for (const p of room.players) {
      const row = el('div', 'lb-player');
      row.style.setProperty('--c', SLOT_COLORS[p.slot % SLOT_COLORS.length]);
      const state = p.id === room.hostId ? el('span', 'lb-ok', 'Host')
        : p.ready ? el('span', 'lb-ok', 'Ready') : el('span', 'lb-wait', 'Waiting');
      row.append(el('b', '', p.name + (p.id === id ? ' (you)' : '')), el('span', '', busStyles[p.busIndex]?.name ?? ''), state);
      list.appendChild(row);
    }

    const map = maps[room.mapIndex];
    routeName.textContent = map ? map.name : '';
    routeMeta.textContent = map ? routeFacts(map) : '';

    primary.replaceChildren();
    if (room.hostId === id) {
      const all = room.players.every((p) => p.ready);
      primary.append(document.createTextNode('Start race'), el('small', '', all ? 'Everyone is ready' : 'Waiting for everyone to be ready'));
      primary.disabled = !all;
    } else {
      const me = room.players.find((p) => p.id === id);
      primary.append(
        document.createTextNode(me?.ready ? 'Not ready' : "I'm ready"),
        el('small', '', me?.ready ? 'Waiting for the host to start' : 'Tell the host you are ready')
      );
      primary.disabled = false;
    }
  }

  showEntry();
  return {
    show() { layer.classList.add('show'); },
    hide() { layer.classList.remove('show'); },
    showEntry, showRoom, setNote,
    setBusy(b) { busy = b; layer.classList.toggle('busy', b); },
  };
}

// The big 3, 2, 1, GO! in the middle of the screen
export function createCountdown() {
  addLobbyStyle();
  const box = el('div', 'mp-count');
  document.body.appendChild(box);
  let timer = 0;
  return {
    show(text, fade = false) {
      clearTimeout(timer);
      box.textContent = text;
      box.classList.add('show');
      if (fade) timer = setTimeout(() => box.classList.remove('show'), 900);
    },
    hide() { clearTimeout(timer); box.classList.remove('show'); },
  };
}

// Final places after a multiplayer race
export function createMpResults({ onBack, onMenu }) {
  addStyle();
  const layer = el('div', 'ui-layer ui-center');
  const card = el('div', 'ui-card');
  layer.appendChild(card);
  document.body.appendChild(layer);

  return {
    show(list, myId, mapName) {
      card.replaceChildren();
      card.append(el('h1', 'ui-title', 'RACE RESULTS'), el('p', 'ui-sub', mapName));
      const rows = el('div', 'ui-rows');
      for (const r of list) {
        const row = el('div', 'ui-row');
        const you = r.id === myId;
        const left = el('span', '', r.place + '.  ' + r.name + (you ? ' (you)' : ''));
        const right = el('span', '', r.dnf ? 'Did not finish' : fmt(r.time));
        if (you) { left.style.color = '#ffd60a'; right.style.color = '#ffd60a'; left.style.fontWeight = '700'; }
        row.append(left, right);
        rows.appendChild(row);
      }
      card.appendChild(rows);

      const btns = el('div', 'ui-btns');
      const back = el('button', 'ui-go green', 'BACK TO LOBBY');
      const menu = el('button', 'ui-go grey', 'MAIN MENU');
      press(back, onBack);
      press(menu, onMenu);
      btns.append(back, menu);
      card.appendChild(btns);
      layer.classList.add('show');
    },
    hide() { layer.classList.remove('show'); },
  };
}