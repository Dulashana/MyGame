import * as THREE from 'three';

const ZONE_ALONG = 11;    // half-length of a stop area (m)
const SIDE_OUT = 6.5;     // how far the area reaches past the road edge (m)
const DWELL = 2;          // seconds you must hold still
const STOP_SPEED = 1;     // m/s: slower than this counts as stopped

function labelTexture(title, sub, bg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 56px sans-serif'; g.fillText(title, 256, 48);
  g.font = 'bold 34px sans-serif'; g.fillText(sub, 256, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Makes a bus see-through (ghost) or solid again
export function setGhost(bus, on) {
  if (!bus || bus.userData.ghost === on) return;
  bus.userData.ghost = on;
  bus.traverse((o) => {
    if (!o.isMesh) return;
    o.material.transparent = on;
    o.material.opacity = on ? 0.4 : 1;
    o.material.depthWrite = !on;
    o.material.needsUpdate = true;
  });
}

export function createBusStops(map, road) {
  const group = new THREE.Group();
  const boxes = [];
  const circles = [];
  const stops = [];
  const n = road.samples.length;
  const half = road.half;
  const cache = {};
  const mat = (c) => (cache[c] ??= new THREE.MeshLambertMaterial({ color: c }));
  const list = map.busStops ?? [];

  list.forEach((u, k) => {
    const i = Math.max(3, Math.min(n - 4, Math.round(u * (n - 1))));
    const p = road.samples[i];
    const tg = road.tangents[i];
    const len = Math.hypot(tg.x, tg.z) || 1;
    const tx = tg.x / len, tz = tg.z / len;
    const heading = Math.atan2(tx, tz);
    const s = Math.sin(heading), c = Math.cos(heading);
    // local x = left of the road, local z = along the road
    const toWorld = (lx, lz) => ({ x: p.x + c * lx + s * lz, z: p.z - s * lx + c * lz });

    const g = new THREE.Group();
    const yF = road.heightAt(p.x + tx * 3, p.z + tz * 3);
    const yB = road.heightAt(p.x - tx * 3, p.z - tz * 3);
    g.rotation.order = 'YXZ';
    g.position.set(p.x, road.heightAt(p.x, p.z), p.z);
    g.rotation.set(-Math.atan2(yF - yB, 6), heading, 0);
    group.add(g);

    const box = (w, h, l, x, y, z, m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);
      mesh.position.set(x, y, z);
      g.add(mesh);
    };

    // Yellow bay painted on the left lane (turns green when the stop is done)
    const bayMat = new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.6 });
    box(half - 1.2, 0.03, 15, half / 2, 0.26, 0, bayMat);

    // Waiting platform, back wall, tin roof, posts, bench
    box(3, 0.25, 16, half + 2, 0.12, 0, mat(0xb9b6ad));
    box(0.2, 2.6, 12, half + 3.7, 1.5, 0, mat(0x9fb8c8));
    box(3.8, 0.15, 12.4, half + 2.5, 3.1, 0, mat(0x8a8f94));
    box(3.8, 0.1, 12.4, half + 2.5, 3.22, 0, mat(0xc82026));
    for (const dz of [-5.8, 0, 5.8]) box(0.16, 2.9, 0.16, half + 0.9, 1.6, dz, mat(0x555555));
    box(0.6, 0.1, 8, half + 3.2, 0.7, 0, mat(0x7a5a3a));

    // Sign on a pole at the start of the stop (readable from both sides)
    box(0.18, 4.5, 0.18, half + 1.2, 2.3, -8, mat(0x666666));
    const boardMat = new THREE.MeshBasicMaterial({
      map: labelTexture('BUS STOP', 'STOP ' + (k + 1) + ' / ' + list.length, '#c82026'),
    });
    const boardGeo = new THREE.PlaneGeometry(3.6, 0.9);
    const front = new THREE.Mesh(boardGeo, boardMat);
    front.position.set(half + 1.2, 4.7, -7.88);
    const back = new THREE.Mesh(boardGeo, boardMat);
    back.position.set(half + 1.2, 4.7, -8.12);
    back.rotation.y = Math.PI;
    g.add(front, back);

    // Solid parts: the back wall and the sign pole
    const w = toWorld(half + 3.7, 0);
    boxes.push({ x: w.x, z: w.z, ax: c, az: -s, bx: s, bz: c, hx: 0.2, hz: 6, bound: Math.hypot(0.2, 6) });
    const pole = toWorld(half + 1.2, -8);
    circles.push({ x: pole.x, z: pole.z, r: 0.3 });

    stops.push({ px: p.x, pz: p.z, tx, tz, bayMat, served: false, dwell: 0 });
  });

  function local(st, x, z) {
    const dx = x - st.px, dz = z - st.pz;
    return { along: dx * st.tx + dz * st.tz, lat: dx * st.tz - dz * st.tx };
  }

  let msg = '';
  let msgTimer = 0;

  return {
    group, boxes, circles,
    count: stops.length,
    served: () => stops.filter((st) => st.served).length,

    reset() {
      for (const st of stops) { st.served = false; st.dwell = 0; st.bayMat.color.set(0xffd60a); }
      msgTimer = 0;
    },

    // true if a point is inside any stop area (m = extra margin). Used to keep trees and rocks away.
    contains(x, z, m = 0) {
      for (const st of stops) {
        const { along, lat } = local(st, x, z);
        if (Math.abs(along) < ZONE_ALONG + m && lat > -half - m && lat < half + SIDE_OUT + m) return true;
      }
      return false;
    },

    // Call every frame. Returns { ghost, text }
    update(state, busLength, dt, active) {
      let ghost = false;
      let text = '';
      msgTimer = Math.max(0, msgTimer - dt);

      stops.forEach((st, k) => {
        const { along, lat } = local(st, state.x, state.z);
        const inZone =
          Math.abs(along) < ZONE_ALONG + busLength / 2 &&
          lat > -half - 1.3 && lat < half + SIDE_OUT + 1.3;
        if (!inZone) { if (!st.served) st.dwell = 0; return; }

        ghost = true;                              // touching the stop area: ghost until fully out
        if (!active || st.served) return;

        const inBay = Math.abs(along) < ZONE_ALONG - 1 && lat > 0;
        if (inBay && Math.abs(state.speed) < STOP_SPEED) {
          st.dwell += dt;
          text = 'Passengers boarding...  ' + Math.max(0, DWELL - st.dwell).toFixed(1) + ' s';
          if (st.dwell >= DWELL) {
            st.served = true;
            st.bayMat.color.set(0x38d66b);
            msg = 'Stop ' + (k + 1) + ' / ' + stops.length + ' done!';
            msgTimer = 2.5;
          }
        } else {
          st.dwell = 0;
          text = 'BUS STOP ' + (k + 1) + ': pull in on the left and stop';
        }
      });

      return { ghost, text: msgTimer > 0 ? msg : text };
    },
  };
}