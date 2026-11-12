// The other players' buses: creates them, and moves them smoothly between the server's position updates.
import * as THREE from 'three';
import { createBus, spinWheels } from './bus.js';
import { setGhost } from './stops.js';

function nameSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(5, 1.25, 1);
  return sprite;
}

function dispose(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}

export function createRemotePlayers(scene, busStyles) {
  const players = new Map();      // player id -> everything we know about that bus

  function add(p) {
    const bus = createBus(busStyles[p.busIndex] ?? busStyles[0]);
    bus.rotation.order = 'YXZ';
    const label = nameSprite(p.name);
    label.position.set(0, 5, 0);
    bus.add(label);
    bus.visible = false;                        // hidden until the first position arrives
    scene.add(bus);
    players.set(p.id, {
      bus, seen: false, t: 0,
      x: 0, y: 0, z: 0, h: 0,                   // where the bus is drawn now
      tx: 0, ty: 0, tz: 0, th: 0,               // the last position the server sent
      v: 0, sr: 0, rx: 0, rz: 0, g: 0,
    });
  }

  function remove(id) {
    const p = players.get(id);
    if (!p) return;
    scene.remove(p.bus);
    dispose(p.bus);
    players.delete(id);
  }

  return {
    // Make the list of buses match the room's player list (everyone except me)
    sync(list, myId) {
      const ids = new Set(list.filter((p) => p.id !== myId).map((p) => p.id));
      for (const id of [...players.keys()]) if (!ids.has(id)) remove(id);
      for (const p of list) if (p.id !== myId && !players.has(p.id)) add(p);
    },

    // The server's latest positions for everyone
    applySnap(snap, myId) {
      const now = performance.now();
      for (const e of snap) {
        const p = players.get(e.id);
        if (!p || e.id === myId) continue;
        p.tx = e.x; p.ty = e.y; p.tz = e.z; p.th = e.h;
        p.v = e.v; p.sr = e.sr; p.rx = e.rx; p.rz = e.rz; p.g = e.g;
        p.t = now;
        if (!p.seen) {                          // first position: appear there straight away
          p.seen = true;
          p.x = p.tx; p.y = p.ty; p.z = p.tz; p.h = p.th;
          p.bus.visible = true;
        }
      }
    },

    // Call every frame
    update(dt) {
      const now = performance.now();
      for (const p of players.values()) {
        if (!p.seen) continue;
        // aim a little ahead of the last position, so the bus keeps moving between updates
        const ahead = Math.min(0.12, (now - p.t) / 1000);
        const gx = p.tx + Math.sin(p.th) * p.v * ahead;
        const gz = p.tz + Math.cos(p.th) * p.v * ahead;
        const k = 1 - Math.exp(-14 * dt);
        p.x += (gx - p.x) * k;
        p.y += (p.ty - p.y) * k;
        p.z += (gz - p.z) * k;
        const dh = Math.atan2(Math.sin(p.th - p.h), Math.cos(p.th - p.h));   // turn the short way round
        p.h += dh * k;

        p.bus.position.set(p.x, p.y, p.z);
        p.bus.rotation.set(p.rx, p.h, p.rz);
        spinWheels(p.bus, p.v, dt, p.sr);
        setGhost(p.bus, !!p.g);
      }
    },

    clear() { for (const id of [...players.keys()]) remove(id); },
  };
}