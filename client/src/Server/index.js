// BusPisso multiplayer server.
// Keeps the rooms, passes each player's position to the others, runs the countdown and decides the finish order.
// Every player's browser still drives its own bus; the server never simulates driving.

import http from 'node:http';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3001;
const ORIGINS = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true;   // true = any site (fine on your own computer)
const MAX_PLAYERS = 4;
const TICK_MS = 50;                                                  // 20 position updates per second
const COUNTDOWN = Number(process.env.COUNTDOWN) || 3;                // seconds before GO
const DNF_AFTER_MS = Number(process.env.DNF_AFTER_MS) || 90_000;     // after the first finisher, everyone else has this long
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';                     // no I or O, they look like 1 and 0

const rooms = new Map();    // room code -> room

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('BusPisso server is running. Rooms open: ' + rooms.size + '\n');
});
const io = new Server(server, { cors: { origin: ORIGINS }, maxHttpBufferSize: 1e4 });

// ---------- helpers ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Only accept real numbers, and keep them in a sensible range
function num(v, lo, hi, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
}

function cleanName(n) {
  const s = String(n ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16);
  return s || 'Player';
}

function makeCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
}

function freeSlot(room) {
  const used = new Set([...room.players.values()].map((p) => p.slot));
  for (let s = 0; s < MAX_PLAYERS; s++) if (!used.has(s)) return s;
  return 0;
}

function addPlayer(room, socket, data) {
  const p = {
    id: socket.id,
    name: cleanName(data?.name),
    busIndex: Math.round(num(data?.busIndex, 0, 20, 0)),
    slot: freeSlot(room),
    ready: room.hostId === socket.id,       // the host counts as ready
    finished: false, time: null, place: 0,
    st: null,                               // the latest position this player sent
    lastMsg: 0,
  };
  room.players.set(socket.id, p);
  socket.join(room.code);
  socket.data.code = room.code;
  return p;
}

// What every player is allowed to see about a room
function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    mapIndex: room.mapIndex,
    state: room.state,                      // 'lobby' | 'countdown' | 'racing'
    players: [...room.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({ id: p.id, name: p.name, busIndex: p.busIndex, slot: p.slot, ready: p.ready, finished: p.finished })),
  };
}
const sendRoom = (room) => io.to(room.code).emit('room:update', publicRoom(room));

// Live race positions: finished players first (in the order they arrived), then by how far along the road they are
function ranks(room) {
  const list = [...room.players.values()];
  list.sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished) return a.place - b.place;
    return (b.st?.pr ?? 0) - (a.st?.pr ?? 0);
  });
  return new Map(list.map((p, i) => [p.id, i + 1]));
}

function closeRoom(room) {
  clearInterval(room.countTimer);
  clearTimeout(room.dnfTimer);
  rooms.delete(room.code);
}

// ---------- race flow ----------
function startCountdown(room) {
  room.state = 'countdown';
  room.finishers = 0;
  for (const p of room.players.values()) { p.finished = false; p.time = null; p.place = 0; p.st = null; }
  sendRoom(room);

  let n = COUNTDOWN;
  io.to(room.code).emit('race:countdown', { n, room: publicRoom(room) });
  room.countTimer = setInterval(() => {
    n -= 1;
    if (n > 0) { io.to(room.code).emit('race:countdown', { n }); return; }
    clearInterval(room.countTimer);
    room.state = 'racing';
    room.startedAt = Date.now();
    io.to(room.code).emit('race:start', {});
    sendRoom(room);
  }, 1000);
}

function endRace(room) {
  if (room.state !== 'racing') return;
  clearTimeout(room.dnfTimer);
  room.dnfTimer = null;

  const all = [...room.players.values()];
  const done = all.filter((p) => p.finished).sort((a, b) => a.time - b.time);     // final order is by time (includes stop penalties)
  const dnf = all.filter((p) => !p.finished).sort((a, b) => (b.st?.pr ?? 0) - (a.st?.pr ?? 0));
  const results = [...done, ...dnf].map((p, i) => ({
    id: p.id, name: p.name, busIndex: p.busIndex,
    place: i + 1, time: p.finished ? p.time : null, dnf: !p.finished,
  }));
  io.to(room.code).emit('race:results', { results, mapIndex: room.mapIndex });

  room.state = 'lobby';
  for (const p of all) {
    p.ready = p.id === room.hostId;
    p.finished = false; p.time = null; p.place = 0; p.st = null;
  }
  sendRoom(room);
}

function checkAllDone(room) {
  if (room.state === 'racing' && [...room.players.values()].every((p) => p.finished)) endRace(room);
}

function leaveRoom(socket) {
  const code = socket.data.code;
  if (!code) return;
  socket.data.code = null;
  socket.leave(code);

  const room = rooms.get(code);
  if (!room) return;
  room.players.delete(socket.id);

  if (room.players.size === 0) { closeRoom(room); return; }
  if (room.hostId === socket.id) {                 // the host left: the next player takes over
    room.hostId = room.players.values().next().value.id;
    room.players.get(room.hostId).ready = true;
  }
  sendRoom(room);
  checkAllDone(room);                              // the one who left may have been the last unfinished player
}

// ---------- connections ----------
io.on('connection', (socket) => {
  const roomOf = () => rooms.get(socket.data.code);

  // Make a new room. data = { name, busIndex, mapIndex }
  socket.on('room:create', (data, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    leaveRoom(socket);
    const room = {
      code: makeCode(), hostId: socket.id,
      mapIndex: Math.round(num(data?.mapIndex, 0, 20, 0)),
      state: 'lobby', players: new Map(), finishers: 0, startedAt: 0,
      countTimer: null, dnfTimer: null,
    };
    rooms.set(room.code, room);
    addPlayer(room, socket, data);
    reply({ ok: true, id: socket.id, room: publicRoom(room) });
  });

  // Join with a code. data = { code, name, busIndex }
  socket.on('room:join', (data, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const room = rooms.get(String(data?.code ?? '').trim().toUpperCase());
    if (!room) return reply({ ok: false, error: 'Room not found' });
    if (room.state !== 'lobby') return reply({ ok: false, error: 'That race has already started' });
    if (room.players.size >= MAX_PLAYERS) return reply({ ok: false, error: 'Room is full' });
    leaveRoom(socket);
    addPlayer(room, socket, data);
    reply({ ok: true, id: socket.id, room: publicRoom(room) });
    sendRoom(room);
  });

  socket.on('room:leave', () => leaveRoom(socket));

  // Host picks the map. data = { mapIndex }
  socket.on('room:map', (data) => {
    const room = roomOf();
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    room.mapIndex = Math.round(num(data?.mapIndex, 0, 20, room.mapIndex));
    for (const p of room.players.values()) p.ready = p.id === room.hostId;     // everyone has to agree to the new map again
    sendRoom(room);
  });

  // Each player picks a bus. data = { busIndex }
  socket.on('player:bus', (data) => {
    const room = roomOf();
    const p = room?.players.get(socket.id);
    if (!p || room.state !== 'lobby') return;
    p.busIndex = Math.round(num(data?.busIndex, 0, 20, p.busIndex));
    sendRoom(room);
  });

  // data = true or false
  socket.on('room:ready', (value) => {
    const room = roomOf();
    const p = room?.players.get(socket.id);
    if (!p || room.state !== 'lobby' || room.hostId === socket.id) return;
    p.ready = !!value;
    sendRoom(room);
  });

  // Host starts the race once everyone is ready
  socket.on('room:start', (data, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const room = roomOf();
    if (!room || room.hostId !== socket.id) return reply({ ok: false, error: 'Only the host can start' });
    if (room.state !== 'lobby') return reply({ ok: false, error: 'Already starting' });
    if (![...room.players.values()].every((p) => p.ready)) return reply({ ok: false, error: 'Waiting for everyone to be ready' });
    reply({ ok: true });
    startCountdown(room);
  });

  // The bus position, sent about 20 times a second by every player during the countdown and the race
  // data = { x, z, y, h (heading), v (speed), sr (steer), rx, rz (tilt), pr (0 to 1 along the road), g (1 = ghost) }
  socket.on('state', (s) => {
    const room = roomOf();
    const p = room?.players.get(socket.id);
    if (!p || !s || (room.state !== 'racing' && room.state !== 'countdown')) return;
    const now = Date.now();
    if (now - p.lastMsg < 30) return;               // ignore anyone sending faster than about 33 times a second
    p.lastMsg = now;
    p.st = {
      x: num(s.x, -1e5, 1e5), z: num(s.z, -1e5, 1e5), y: num(s.y, -1000, 1000),
      h: num(s.h, -10, 10), v: num(s.v, -100, 100), sr: num(s.sr, -1, 1),
      rx: num(s.rx, -1, 1), rz: num(s.rz, -1, 1),
      pr: num(s.pr, 0, 1), g: s.g ? 1 : 0,
    };
  });

  // A player reached the finish. data = { time } in seconds, including stop penalties
  socket.on('finish', (data) => {
    const room = roomOf();
    const p = room?.players.get(socket.id);
    if (!p || room.state !== 'racing' || p.finished) return;

    const elapsed = (Date.now() - room.startedAt) / 1000;
    // Nobody can be faster than the real time that has passed since GO. Stop penalties can make the time longer.
    p.time = clamp(num(data?.time, 0, 36000, elapsed), elapsed - 1.5, elapsed + 120);
    p.finished = true;
    p.place = ++room.finishers;

    io.to(room.code).emit('player:finished', { id: p.id, place: p.place, time: p.time });
    if (p.place === 1 && !room.dnfTimer) room.dnfTimer = setTimeout(() => endRace(room), DNF_AFTER_MS);
    sendRoom(room);
    checkAllDone(room);
  });

  socket.on('disconnect', () => leaveRoom(socket));
});

// Send everyone's latest positions to each room, 20 times a second
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.state !== 'racing' && room.state !== 'countdown') continue;
    const rank = ranks(room);
    const snap = [];
    for (const p of room.players.values()) {
      if (p.st) snap.push({ id: p.id, ...p.st, pos: rank.get(p.id), f: p.finished ? 1 : 0 });
    }
    if (snap.length) io.to(room.code).emit('snap', snap);
  }
}, TICK_MS);

server.listen(PORT, () => console.log('BusPisso server running on http://localhost:' + PORT));