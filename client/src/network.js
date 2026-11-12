// Talks to the multiplayer server (server/index.js). Nothing in here touches the game itself.
import { io } from 'socket.io-client';

// Where the server lives. On your own computer it is port 3001.
// Later, put the real address in a .env file as VITE_SERVER_URL=https://your-server-address
const HOST = typeof location !== 'undefined' ? location.hostname : 'localhost';
const SERVER_URL = import.meta.env?.VITE_SERVER_URL || 'http://' + HOST + ':3001';

export function createNetwork() {
  let socket = null;
  let connecting = null;
  const handlers = {};                                          // event name -> function
  const call = (name, ...args) => { handlers[name]?.(...args); };

  function connect() {
    if (socket?.connected) return Promise.resolve();
    if (connecting) return connecting;
    connecting = new Promise((resolve, reject) => {
      const s = io(SERVER_URL, { transports: ['websocket'], reconnection: false, timeout: 4000 });
      socket = s;
      s.on('connect', () => { connecting = null; resolve(); });
      s.on('connect_error', () => {
        connecting = null;
        s.close();
        if (socket === s) socket = null;
        reject(new Error("Can't reach the server. Is it running?"));
      });
      s.on('disconnect', () => { if (socket === s) socket = null; call('disconnect'); });
      s.on('room:update', (r) => call('room', r));
      s.on('race:countdown', (d) => call('countdown', d));
      s.on('race:start', () => call('start'));
      s.on('snap', (list) => call('snap', list));
      s.on('player:finished', (d) => call('finished', d));
      s.on('race:results', (d) => call('results', d));
    });
    return connecting;
  }

  // Sends a message and waits for the server's answer. Rejects with a readable error.
  function ask(event, data) {
    return new Promise((resolve, reject) => {
      if (!socket) return reject(new Error('Not connected to the server'));
      socket.timeout(5000).emit(event, data, (err, res) => {
        if (err) return reject(new Error('The server did not answer'));
        if (!res?.ok) return reject(new Error(res?.error || 'Something went wrong'));
        resolve(res);
      });
    });
  }

  return {
    connect,
    // on('room' | 'countdown' | 'start' | 'snap' | 'finished' | 'results' | 'disconnect', function)
    on(name, fn) { handlers[name] = fn; },
    get id() { return socket?.id ?? null; },
    async create(data) { await connect(); return ask('room:create', data); },
    async join(data) { await connect(); return ask('room:join', data); },
    leave() { socket?.emit('room:leave'); },
    setReady(value) { socket?.emit('room:ready', !!value); },
    start() { return ask('room:start', {}); },
    sendState(state) { socket?.volatile.emit('state', state); },   // volatile: if one gets lost, the next one replaces it
    sendFinish(time) { socket?.emit('finish', { time }); },
  };
}