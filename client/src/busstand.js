import * as THREE from 'three';

const YARD_HALF = 12;                     // yard is 24 m wide
const YARD_LEN = 20;                      // and 20 m long
const SLOT_X = [5.4, 1.8, -1.8, -5.4];    // 4 bays side by side (slot 0 = nearest the platform)
const SLOT_Z = 9;                         // bus centre, metres into the yard

// ---------- helpers ----------
function makeFrame(anchor, heading) {
  const s = Math.sin(heading), c = Math.cos(heading);
  return {
    // local (x = left of travel, z = forward) -> world
    toWorld(lx, lz) { return { x: anchor.x + c * lx + s * lz, z: anchor.z - s * lx + c * lz }; },
    // world -> local
    toLocal(x, z) {
      const dx = x - anchor.x, dz = z - anchor.z;
      return { lx: dx * c - dz * s, lz: dx * s + dz * c };
    },
  };
}

function css(hex) { return '#' + hex.toString(16).padStart(6, '0'); }

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

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#111'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function inside(frame, dir, x, z, m) {
  const { lx, lz } = frame.toLocal(x, z);
  if (Math.abs(lx) > YARD_HALF + m) return false;
  return dir < 0 ? (lz < 1 + m && lz > -YARD_LEN - m) : (lz > -1 - m && lz < YARD_LEN + m);
}

// ---------- one bus stand ----------
// dir = -1: the yard is BEHIND the anchor (start). dir = +1: the yard is AHEAD of it (end).
function buildStand(o) {
  const { anchor, heading, y, dir, title, sub, accent, boxes, circles } = o;
  const frame = makeFrame(anchor, heading);
  const group = new THREE.Group();
  group.position.set(anchor.x, y, anchor.z);
  group.rotation.y = heading;

  const cache = {};
  const mat = (c) => (cache[c] ??= new THREE.MeshLambertMaterial({ color: c }));
  const box = (w, h, l, x, yy, z, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);
    mesh.position.set(x, yy, z);
    group.add(mesh);
    return mesh;
  };

  const s = Math.sin(heading), c = Math.cos(heading);
  const solidBox = (lx, lz, hx, hz) => {
    const w = frame.toWorld(lx, lz);
    boxes.push({ x: w.x, z: w.z, ax: c, az: -s, bx: s, bz: c, hx, hz, bound: Math.hypot(hx, hz) });
  };
  const solidPole = (lx, lz, r) => {
    const w = frame.toWorld(lx, lz);
    circles.push({ x: w.x, z: w.z, r });
  };

  const zc = (dir * YARD_LEN) / 2;

  // Paved yard + white bay lines
  box(YARD_HALF * 2, 0.1, YARD_LEN, 0, 0.15, zc, mat(0x77777b));
  for (const x of [-7.2, -3.6, 0, 3.6, 7.2]) {
    box(0.14, 0.02, 14, x, 0.215, dir * SLOT_Z, mat(0xffffff));
  }

  // Waiting platform on the left side: raised floor, back wall, tin roof, posts, bench
  const PX = 10;
  box(4, 0.25, 16, PX, 0.12, zc, mat(0xb9b6ad));
  box(0.2, 2.6, 16, 11.8, 1.5, zc, mat(0x9fb8c8));
  box(4.6, 0.18, 16.4, PX, 3.3, zc, mat(0x8a8f94));
  box(4.6, 0.12, 16.4, PX, 3.44, zc, mat(accent));
  for (const dz of [-7.5, 0, 7.5]) box(0.18, 3.1, 0.18, 8.1, 1.7, zc + dz, mat(0x555555));
  box(0.7, 0.12, 10, 11.1, 0.7, zc, mat(0x7a5a3a));
  solidBox(11.8, zc, 0.2, 8);

  // Sign board on a pole (readable from both sides)
  const sz = dir < 0 ? -1 : 3;
  box(0.2, 5, 0.2, 8.4, 2.5, sz, mat(0x666666));
  solidPole(8.4, sz, 0.3);
  const boardMat = new THREE.MeshBasicMaterial({ map: labelTexture(title, sub, css(accent)) });
  const boardGeo = new THREE.PlaneGeometry(5, 1.25);
  const front = new THREE.Mesh(boardGeo, boardMat);
  front.position.set(8.4, 5.4, sz + 0.12);
  const back = new THREE.Mesh(boardGeo, boardMat);
  back.position.set(8.4, 5.4, sz - 0.12);
  back.rotation.y = Math.PI;
  group.add(front, back);

  return { group, frame, dir };
}

// ---------- both stands for a map ----------
export function createBusStands(map, road) {
  const n = road.samples.length;
  const half = road.half;
  const names = map.stands ?? {};
  const boxes = [];
  const circles = [];

  // START: yard behind the first point of the road
  const startAnchor = { x: road.start.x, z: road.start.z };
  const startHeading = road.start.heading;
  const start = buildStand({
    anchor: startAnchor, heading: startHeading, dir: -1,
    y: road.heightAt(startAnchor.x, startAnchor.z),
    title: names.start ?? 'BUS STAND', sub: 'START', accent: 0x1b5e8c,
    boxes, circles,
  });

  // END: yard ahead of the last point of the road
  const a = road.samples[n - 1];
  const b = road.samples[Math.max(0, n - 6)];
  const endHeading = Math.atan2(a.x - b.x, a.z - b.z);
  const end = buildStand({
    anchor: { x: a.x, z: a.z }, heading: endHeading, dir: 1,
    y: road.heightAt(a.x, a.z),
    title: names.end ?? 'BUS STAND', sub: 'FINISH', accent: 0x8c1b2a,
    boxes, circles,
  });

  // Finish gantry across the road + checkered line
  const g = end.group;
  const gx = half + 1.2;
  const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 7, 8);
  const postMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(sx * gx, 3.5, 0);
    g.add(post);
    const w = end.frame.toWorld(sx * gx, 0);
    circles.push({ x: w.x, z: w.z, r: 0.4 });
  }
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(gx * 2 + 0.6, 0.5, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x222222 })
  );
  beam.position.set(0, 6.9, 0);
  g.add(beam);

  const bannerMat = new THREE.MeshBasicMaterial({ map: labelTexture('FINISH', 'END OF ROUTE', '#111111') });
  const bannerGeo = new THREE.PlaneGeometry(8, 2);
  const bf = new THREE.Mesh(bannerGeo, bannerMat);
  bf.position.set(0, 5.6, 0.25);
  const bb = new THREE.Mesh(bannerGeo, bannerMat);
  bb.position.set(0, 5.6, -0.25);
  bb.rotation.y = Math.PI;
  g.add(bf, bb);

  const tex = checkerTexture();
  tex.repeat.set((half * 2) / 2, 1);
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2, 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  line.position.set(0, 0.27, 0);
  g.add(line);

  const group = new THREE.Group();
  group.add(start.group, end.group);

  // The four starting spots (slot 0..3), as world positions
  const starts = SLOT_X.map((lx) => {
    const w = start.frame.toWorld(lx, -SLOT_Z);
    return { x: w.x, z: w.z, heading: startHeading };
  });

  return {
    group, boxes, circles, starts,
    endFrame: end.frame,
    // true if a point is inside either yard (m = extra margin in metres)
    contains(x, z, m = 0) {
      return inside(start.frame, -1, x, z, m) || inside(end.frame, 1, x, z, m);
    },
  };
}

// True once the bus centre has crossed the finish line
export function atFinish(stands, state) {
  const { lx, lz } = stands.endFrame.toLocal(state.x, state.z);
  return lz > 0 && lz < YARD_LEN && Math.abs(lx) < YARD_HALF;
}