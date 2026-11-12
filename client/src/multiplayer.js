// Multiplayer glue: joins the lobby screens, the network and the other players' buses to the game in main.js.
import { createNetwork } from './network.js';
import { createRemotePlayers } from './remote.js';
import { createLobby, createCountdown, createMpResults } from './ui.js';

const SEND_EVERY = 0.05;     // seconds between position updates (20 a second)

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function setupMultiplayer(game) {
  const net = createNetwork();
  const remote = createRemotePlayers(game.scene, game.busStyles);
  const countdown = createCountdown();

  const posLabel = document.createElement('div');
  posLabel.style.cssText =
    'position:fixed;left:16px;top:16px;display:none;color:#fff;font:bold 30px sans-serif;text-shadow:0 2px 4px rgba(0,0,0,0.8)';
  document.body.appendChild(posLabel);

  let active = false;        // true from opening the lobby until the player leaves
  let phase = 'off';         // 'lobby' | 'countdown' | 'racing' | 'finished' | 'results'
  let room = null;
  let sendTimer = 0;
  let myPlace = 0;

  // ----- loading a route (shows the loading strip first, because it freezes the page for a moment) -----
  function loadMap(index) {
    lobby.setBusy(true);
    lobby.setNote('Loading route…');
    return new Promise((resolve) => {
      setTimeout(() => {
        try { game.loadMap(index); } finally {
          lobby.setBusy(false);
          lobby.setNote('');
          resolve();
        }
      }, 50);
    });
  }

  // ----- the lobby and results screens -----
  async function enter(request) {
    lobby.setNote('');
    try {
      const { room: r } = await request;
      room = r;
      if (r.mapIndex !== game.getMapIndex()) await loadMap(r.mapIndex);   // use the host's route
      phase = 'lobby';
      lobby.showRoom(room, net.id);
    } catch (e) {
      lobby.setNote(e.message);
    }
  }

  const lobby = createLobby({
    maps: game.maps, busStyles: game.busStyles,
    onCreate: (name) => enter(net.create({ name, busIndex: game.getBusIndex(), mapIndex: game.getMapIndex() })),
    onJoin: (name, code) => enter(net.join({ name, code, busIndex: game.getBusIndex() })),
    onReady: (value) => net.setReady(value),
    onStart: () => net.start().catch((e) => lobby.setNote(e.message)),
    onLeave: () => leaveToMenu(),
  });

  const results = createMpResults({
    onBack: () => backToLobby(),
    onMenu: () => leaveToMenu(),
  });

  // ----- opening, leaving -----
  async function openLobby() {
    active = true;
    phase = 'lobby';
    game.setMultiplayerOn(true);        // no traffic in multiplayer
    game.menu.hide();
    lobby.showEntry();
    lobby.show();
    await loadMap(game.getMapIndex());  // reload the route without traffic
    try { await net.connect(); } catch (e) { lobby.setNote(e.message); }
  }

  function leave() {
    if (!active) return;
    active = false;
    phase = 'off';
    room = null;
    net.leave();
    remote.clear();
    lobby.hide();
    results.hide();
    countdown.hide();
    posLabel.style.display = 'none';
    game.freeze(false);
    game.setMultiplayerOn(false);
  }

  function leaveToMenu() {
    leave();
    game.loadMap(game.getMapIndex());   // brings the traffic back
    game.showMenu();
  }

  function backToLobby() {
    results.hide();
    remote.clear();
    countdown.hide();
    posLabel.style.display = 'none';
    game.freeze(false);
    game.loadMap(game.getMapIndex());   // fresh route and bus stops
    game.showMenu();
    game.menu.hide();
    phase = 'lobby';
    lobby.showRoom(room, net.id);
    lobby.show();
  }

  // ----- the race -----
  function beginCountdown(r) {
    room = r;
    phase = 'countdown';
    myPlace = 0;
    const me = r.players.find((p) => p.id === net.id);
    lobby.hide();
    results.hide();
    game.setSlot(me ? me.slot : 0);
    game.freeze(true);                  // the bus can't be driven until GO
    game.startRace();                   // puts the bus in its bay and switches to the driving view
    remote.sync(r.players, net.id);
    posLabel.textContent = '';
    posLabel.style.display = 'block';
  }

  net.on('room', (r) => {
    if (!active) return;
    room = r;
    if (phase === 'lobby') lobby.showRoom(r, net.id);
    else remote.sync(r.players, net.id);        // someone left during the race
  });

  net.on('countdown', (d) => {
    if (!active) return;
    if (d.room) beginCountdown(d.room);
    countdown.show(String(d.n));
  });

  net.on('start', () => {
    if (!active) return;
    phase = 'racing';
    game.freeze(false);
    game.goNow();                       // the timer starts at GO for everyone
    countdown.show('GO!', true);
  });

  net.on('snap', (list) => {
    if (!active) return;
    remote.applySnap(list, net.id);
    const me = list.find((p) => p.id === net.id);
    if (me) myPlace = me.pos;
  });

  net.on('results', (d) => {
    if (!active) return;
    phase = 'results';
    countdown.hide();
    posLabel.style.display = 'none';
    results.show(d.results, net.id, game.maps[d.mapIndex]?.name ?? '');
  });

  net.on('disconnect', () => {
    if (!active) return;
    leave();
    game.loadMap(game.getMapIndex());
    game.showMenu();
    game.menu.setNote('Lost connection to the server');
  });

  // Called by main.js when this player crosses the finish line (time includes stop penalties)
  function localFinished(time) {
    phase = 'finished';
    net.sendFinish(time);
    posLabel.textContent = 'Finished. Waiting for the others…';
  }

  // Called by main.js every frame
  function update(dt) {
    if (!active) return;
    remote.update(dt);
    if (phase !== 'countdown' && phase !== 'racing' && phase !== 'finished') return;
    if (phase === 'racing' && myPlace && room) posLabel.textContent = ordinal(myPlace) + ' of ' + room.players.length;

    sendTimer += dt;
    if (sendTimer < SEND_EVERY) return;
    sendTimer = 0;
    const b = game.getBus();
    net.sendState({
      x: b.state.x, z: b.state.z, y: b.y,
      h: b.state.heading, v: b.state.speed, sr: b.state.steer ?? 0,
      rx: b.object.rotation.x, rz: b.object.rotation.z,
      pr: b.progress, g: b.state.ghost ? 1 : 0,
    });
  }

    return {
    get active() { return active; },
    openLobby, leave, update, localFinished,
    leaveToMenu,
  };
}
