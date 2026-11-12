import * as THREE from 'three';

function seededRandom(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAR_COLORS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0xecf0f1, 0x27ae60, 0x7f8c8d, 0x111827];
const VAN_COLORS = [0xffffff, 0xf1f1f1, 0xe8e8e8, 0xdde6ee];
const LORRY_COLORS = [
  { cab: 0x1d4f91, box: 0xd9d9d9 },
  { cab: 0xe67e22, box: 0x2e5e3e },
  { cab: 0xc0392b, box: 0xe8e0c8 },
  { cab: 0xf1c40f, box: 0x3a5a80 },
];

// Solid box sizes for collisions: half width (hx) and half length (hz)
const HIT = {
  car: { hx: 0.95, hz: 2.15 },
  van: { hx: 1.05, hz: 2.6 },
  lorry: { hx: 1.3, hz: 3.9 },
};

// ---------- Vehicle models (front of every vehicle faces +Z) ----------
// Geometry and materials are shared by every vehicle (built once), instead of ~1800 separate copies
const GEO = {};
const MATS = {};
const boxGeo = (w, h, l) => (GEO['b' + w + '_' + h + '_' + l] ??= new THREE.BoxGeometry(w, h, l));
const wheelGeo = (r) => (GEO['w' + r] ??= new THREE.CylinderGeometry(r, r, 0.3, 12).rotateZ(Math.PI / 2));
const sharedMat = (c) => (MATS[c] ??= new THREE.MeshLambertMaterial({ color: c }));
const sharedGlow = (c) => (MATS['g' + c] ??= new THREE.MeshBasicMaterial({ color: c }));

function kit(group) {
  const mat = sharedMat;
  const glow = sharedGlow;
  const box = (w, h, l, x, y, z, m) => {
    const mesh = new THREE.Mesh(boxGeo(w, h, l), m);
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  const wheel = (x, y, z, r) => {
    const mesh = new THREE.Mesh(wheelGeo(r), mat(0x111111));
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  return { mat, glow, box, wheel };
}

function buildCar(rand) {
  const g = new THREE.Group();
  const { mat, glow, box, wheel } = kit(g);
  const body = mat(CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]);
  const glass = mat(0x1c2a3a);
  box(1.8, 0.6, 4.2, 0, 0.7, 0, body);
  box(1.6, 0.4, 2.2, 0, 1.2, -0.2, body);
  box(1.64, 0.32, 2.0, 0, 1.22, -0.2, glass);
  box(1.5, 0.1, 1.9, 0, 1.45, -0.2, body);
  for (const s of [-1, 1]) {
    box(0.4, 0.2, 0.05, s * 0.6, 0.75, 2.12, glow(0xfff3b0));
    box(0.4, 0.2, 0.05, s * 0.6, 0.75, -2.12, glow(0xff2a2a));
    wheel(s * 0.9, 0.35, 1.3, 0.35);
    wheel(s * 0.9, 0.35, -1.3, 0.35);
  }
  return g;
}

function buildVan(rand) {
  const g = new THREE.Group();
  const { mat, glow, box, wheel } = kit(g);
  const body = mat(VAN_COLORS[Math.floor(rand() * VAN_COLORS.length)]);
  const glass = mat(0x1c2a3a);
  box(2.0, 1.5, 5.0, 0, 1.25, 0, body);
  box(2.04, 0.5, 4.4, 0, 1.6, 0.1, glass);
  box(1.8, 0.6, 0.05, 0, 1.5, 2.52, glass);
  box(2.1, 0.25, 0.2, 0, 0.55, 2.55, mat(0x333333));
  for (const s of [-1, 1]) {
    box(0.4, 0.2, 0.05, s * 0.7, 0.9, 2.52, glow(0xfff3b0));
    box(0.3, 0.3, 0.05, s * 0.8, 1.0, -2.52, glow(0xff2a2a));
    wheel(s * 1.0, 0.4, 1.6, 0.4);
    wheel(s * 1.0, 0.4, -1.6, 0.4);
  }
  return g;
}

function buildLorry(rand) {
  const g = new THREE.Group();
  const { mat, glow, box, wheel } = kit(g);
  const col = LORRY_COLORS[Math.floor(rand() * LORRY_COLORS.length)];
  const glass = mat(0x1c2a3a);
  box(2.2, 0.3, 7.6, 0, 0.75, 0.1, mat(0x1b1b1b));          // chassis
  box(2.5, 2.4, 5.2, 0, 2.1, -1.2, mat(col.box));           // cargo box
  box(2.4, 2.0, 2.2, 0, 1.9, 2.6, mat(col.cab));            // cab
  box(2.0, 0.7, 0.06, 0, 2.3, 3.72, glass);                 // windscreen
  box(2.44, 0.6, 1.2, 0, 2.35, 2.5, glass);                 // side windows
  box(2.5, 0.25, 0.25, 0, 0.7, 3.8, mat(0xb0b0b0));         // front bumper
  for (const s of [-1, 1]) {
    box(0.4, 0.25, 0.05, s * 0.8, 1.0, 3.72, glow(0xfff3b0));
    box(0.3, 0.3, 0.05, s * 0.9, 1.0, -3.82, glow(0xff2a2a));
    wheel(s * 1.1, 0.5, 2.6, 0.5);
    wheel(s * 1.1, 0.5, -1.4, 0.5);
    wheel(s * 1.1, 0.5, -2.8, 0.5);
  }
  return g;
}

const BUILDERS = { car: buildCar, van: buildVan, lorry: buildLorry };
const SPEEDS = {            // cruise speed range in m/s (10 m/s = 36 km/h)
  car: [12, 12],
  van: [12, 12],
  lorry: [12, 12],
};

// ---------- Create the traffic for a map ----------
export function createTraffic(map, road) {
  const cfg = map.traffic ?? { cars: 3, vans: 1, lorries: 1 };
  const rand = seededRandom((map.seed ?? 1) * 13 + 7);
  const n = road.samples.length;

  let total = 0;
  for (let i = 1; i < n; i++) {
    total += Math.hypot(road.samples[i].x - road.samples[i - 1].x,
                        road.samples[i].z - road.samples[i - 1].z);
  }

  const kinds = [];
  for (let k = 0; k < (cfg.cars ?? 0); k++) kinds.push('car');
  for (let k = 0; k < (cfg.vans ?? 0); k++) kinds.push('van');
  for (let k = 0; k < (cfg.lorries ?? 0); k++) kinds.push('lorry');
  kinds.sort(() => rand() - 0.5);

  const out = {
    road, n,
    spacing: total / (n - 1),        // metres between road samples
    lane: road.half * 0.5,           // distance of a lane from the road centre
    group: new THREE.Group(),
    boxes: [],
    vehicles: [],
  };

  kinds.forEach((kind, k) => {
    const group = BUILDERS[kind](rand);
    group.rotation.order = 'YXZ';
    out.group.add(group);

    const dir = rand() < 0.5 ? 1 : -1;                          // 1 = same way as you, -1 = coming toward you
    const [lo, hi] = SPEEDS[kind];
    const hit = HIT[kind];
    const box = { x: 0, z: 0, ax: 1, az: 0, bx: 0, bz: 1, hx: hit.hx, hz: hit.hz, bound: Math.hypot(hit.hx, hit.hz) };
    out.boxes.push(box);

    const v = {
      group, box, dir,
      i: n * (0.12 + 0.8 * ((k + rand() * 0.6) / kinds.length)),   // spread along the road, not at the start
      cruise: lo + rand() * (hi - lo),
      speed: 0, x: 0, z: 0, heading: 0,
    };
    v.speed = v.cruise;
    out.vehicles.push(v);
    place(v, out);
  });

  return out;
}

// Puts a vehicle on its lane (drives on the LEFT, like Sri Lanka)
function place(v, t) {
  const { road, n } = t;
  const i0 = Math.max(0, Math.min(Math.floor(v.i), n - 2));
  const f = v.i - i0;
  const a = road.samples[i0], b = road.samples[i0 + 1];
  const ta = road.tangents[i0], tb = road.tangents[i0 + 1];

  let tx = ta.x + (tb.x - ta.x) * f;
  let tz = ta.z + (tb.z - ta.z) * f;
  const len = Math.hypot(tx, tz) || 1;
  tx /= len; tz /= len;

  const lat = v.dir > 0 ? t.lane : -t.lane;      // left of the direction of travel
  const x = a.x + (b.x - a.x) * f + tz * lat;
  const z = a.z + (b.z - a.z) * f - tx * lat;
  const heading = Math.atan2(v.dir * tx, v.dir * tz);

  // follow the hills
  const fx = Math.sin(heading) * 2, fz = Math.cos(heading) * 2;
  const yF = road.heightAt(x + fx, z + fz);
  const yB = road.heightAt(x - fx, z - fz);
  const pitch = Math.atan2(yF - yB, 4);

  v.x = x; v.z = z; v.heading = heading;
  v.group.position.set(x, (yF + yB) / 2, z);
  v.group.rotation.set(-pitch, heading, 0);

  // keep the collision box on the vehicle
  const bx = v.box;
  bx.x = x; bx.z = z;
  bx.ax = Math.cos(heading); bx.az = -Math.sin(heading);
  bx.bx = Math.sin(heading); bx.bz = Math.cos(heading);
}

// Call every frame
const ACTIVE_RANGE = 450; 

// Traffic reaction settings
const STOP_DISTANCE = 8;       // Distance to maintain behind the bus
const BRAKE_DISTANCE = 22;     // Start braking at this distance
const MAX_BRAKING = 12;        // Braking strength
const TRAFFIC_ACCELERATION = 2;// metres: vehicles further than this from the bus are hidden and not simulated in detail


export function updateTraffic(t, bus, dt) {
  if (!t) return;

  const far2 = ACTIVE_RANGE * ACTIVE_RANGE;

  for (const v of t.vehicles) {

    // Far away traffic
    const idx = Math.max(0, Math.min(t.n - 1, Math.floor(v.i)));
    const sp = t.road.samples[idx];

    const fx = sp.x - bus.x;
    const fz = sp.z - bus.z;

    if (fx * fx + fz * fz > far2) {
      if (v.group.visible) v.group.visible = false;

      v.box.x = 1e9;
      v.box.z = 1e9;

      v.x = sp.x;
      v.z = sp.z;
      v.speed = v.cruise;

      v.i += (v.dir * v.speed * dt) / t.spacing;

      if (v.i > t.n - 3) v.i = t.n * 0.06;
      if (v.i < 2) v.i = t.n - 4;

      continue;
    }

    if (!v.group.visible) v.group.visible = true;

    // Detect the player's bus
    const dx = bus.x - v.x;
    const dz = bus.z - v.z;

    const s = Math.sin(v.heading);
    const c = Math.cos(v.heading);

    const ahead = dx * s + dz * c;
    const side = dx * c - dz * s;

    // Bus is in front and close to the traffic vehicle's lane
    const busInFront =
      ahead > 0 &&
      ahead < BRAKE_DISTANCE &&
      Math.abs(side) < 2.8;

    let target = v.cruise;

    // Gradually slow down and completely stop before the bus
    if (busInFront) {
      if (ahead <= STOP_DISTANCE) {
        target = 0;
      } else {
        const remainingDistance = ahead - STOP_DISTANCE;
        const brakingRatio = Math.min(
          1,
          remainingDistance / (BRAKE_DISTANCE - STOP_DISTANCE)
        );

        target = v.cruise * brakingRatio;
      }
    }

    // Avoid hitting other traffic vehicles
    for (const u of t.vehicles) {
      if (u === v || u.dir !== v.dir) continue;

      const gap = (u.i - v.i) * v.dir * t.spacing;

      if (gap <= 0 || gap > 18) continue;

      if (gap < 7) {
        target = 0;
      } else {
        target = Math.min(target, u.speed);
      }
    }

    // Smooth braking and acceleration
    const acceleration =
      target < v.speed
        ? MAX_BRAKING
        : TRAFFIC_ACCELERATION;

    const change = Math.max(
      -acceleration * dt,
      Math.min(acceleration * dt, target - v.speed)
    );

    v.speed += change;

    // Move traffic vehicle
    v.i += (v.dir * v.speed * dt) / t.spacing;

    if (v.i > t.n - 3) v.i = t.n * 0.06;
    if (v.i < 2) v.i = t.n - 4;

    place(v, t);
  }
}

