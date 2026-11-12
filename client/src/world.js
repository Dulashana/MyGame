import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Seeded random: the same seed always gives the same world (important for multiplayer)
function seededRandom(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Helpers ----------
function tooClose(x, z, list, radius) {
  for (const s of list) {
    const dx = s.x - x, dz = s.z - z;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

// Picks random positions near the road (never on it)
function pickSpots(rand, road, count, o) {
  const spots = [];
  const minDist = road.half + o.near;
  let attempts = 0;
  while (spots.length < count && attempts < count * 10) {
    attempts++;
    const s = road.samples[Math.floor(rand() * road.samples.length)];
    const angle = rand() * Math.PI * 2;
    const dist = minDist + rand() * (o.far - o.near);
    const x = s.x + Math.cos(angle) * dist;
    const z = s.z + Math.sin(angle) * dist;
    if (road.nearest(x, z).dist < minDist) continue;
    if (clearZone && clearZone(x, z)) continue;
    if (o.avoid && tooClose(x, z, o.avoid, o.avoidRadius)) continue;
    if (o.spacing && tooClose(x, z, spots, o.spacing)) continue;
    spots.push({
      x, z,
      y: road.terrainY(x, z),   // sit on the hillside
      size: o.min + rand() * (o.max - o.min),
      spin: rand() * Math.PI * 2,
      pick: rand(),
    });
  }
  return spots;
}

// Draws many copies of a shape with only a few draw calls (fast!)
function buildInstanced(layers, spots, rand) {
  const meshes = [];
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  const color = new THREE.Color();

  for (const layer of layers) {
    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      flatShading: !!layer.flat,
      side: layer.double ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.InstancedMesh(layer.geo, material, spots.length);
    mesh.frustumCulled = false;

    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y ?? 0, s.z);
      dummy.rotation.y = s.spin;
      dummy.rotation.x = s.tilt ?? 0;
      dummy.scale.set(s.sx ?? s.size, s.sy ?? s.size, s.sz ?? s.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const base = layer.palette
        ? layer.palette[Math.floor(s.pick * layer.palette.length)]
        : layer.color;
      color.set(base);
      if (layer.vary) color.offsetHSL(0, 0, (rand() - 0.5) * layer.vary);
      mesh.setColorAt(i, color);
    });

    meshes.push(mesh);
  }
  return meshes;
}

// ---------- Tree shapes (each is a list of layers) ----------
function treeLayers(type, map) {
  if (type === 'palm') {
    return [
      { geo: new THREE.CylinderGeometry(0.25, 0.4, 8, 6).translate(0, 4, 0), color: map.trunkColor, vary: 0.08 },
      { geo: new THREE.ConeGeometry(3.4, 1.2, 7).translate(0, 8.2, 0), color: map.leafColor, vary: 0.14 },
      { geo: new THREE.SphereGeometry(0.5, 5, 4).translate(0, 7.6, 0), color: 0x5a3a1a },
    ];
  }
  if (type === 'round') {
    return [
      { geo: new THREE.CylinderGeometry(0.3, 0.4, 2.5, 6).translate(0, 1.25, 0), color: map.trunkColor, vary: 0.08 },
      { geo: new THREE.SphereGeometry(2.2, 7, 6).translate(0, 3.8, 0), color: map.leafColor, vary: 0.14 },
      { geo: new THREE.SphereGeometry(1.5, 6, 5).translate(1.1, 5.0, 0.4), color: map.leafColor, vary: 0.14 },
    ];
  }
  if (type === 'slim') {
    // tall thin tree (like the eucalyptus you see in the hill country)
    return [
      { geo: new THREE.CylinderGeometry(0.25, 0.35, 3, 6).translate(0, 1.5, 0), color: map.trunkColor, vary: 0.08 },
      { geo: new THREE.ConeGeometry(1.3, 9, 6).translate(0, 7.5, 0), color: map.leafColor, vary: 0.14 },
    ];
  }
  // pine (default)
  return [
    { geo: new THREE.CylinderGeometry(0.3, 0.4, 2, 6).translate(0, 1, 0), color: map.trunkColor, vary: 0.08 },
    { geo: new THREE.ConeGeometry(2.2, 3.4, 7).translate(0, 3.2, 0), color: map.leafColor, vary: 0.14 },
    { geo: new THREE.ConeGeometry(1.6, 3.0, 7).translate(0, 5.4, 0), color: map.leafColor, vary: 0.14 },
    { geo: new THREE.ConeGeometry(1.0, 2.4, 7).translate(0, 7.2, 0), color: map.leafColor, vary: 0.14 },
  ];
}

// ---------- Houses (small Sri Lankan village style) ----------
function houseLayers() {
  return [
    { geo: new THREE.BoxGeometry(6, 3, 6).translate(0, 1.5, 0),
      palette: [0xf2e3c6, 0xf7d9a0, 0xcfe8e0, 0xf2c1b6, 0xdbe4f0] },
    { geo: new THREE.ConeGeometry(4.6, 2.4, 4).rotateY(Math.PI / 4).translate(0, 4.2, 0),
      palette: [0xb5532f, 0xa0402a, 0x7a8b99] },
    { geo: new THREE.BoxGeometry(1, 1.9, 0.12).translate(0, 0.95, 3.02), color: 0x5a3a22 },
    { geo: new THREE.BoxGeometry(1, 0.9, 0.1).translate(-1.9, 1.9, 3.02), color: 0x7fb3d5 },
    { geo: new THREE.BoxGeometry(1, 0.9, 0.1).translate(1.9, 1.9, 3.02), color: 0x7fb3d5 },
  ];
}

// ---------- Roadside shops (small Sri Lankan town style) ----------
const SHOP_WALLS = [0xf2e3c6, 0xf7d9a0, 0xcfe8e0, 0xf2c1b6, 0xdbe4f0, 0xe8d5b5];
const TIN_ROOFS = [0x8a8f94, 0x7a8b99, 0xa0402a, 0x6f7479];
const BRIGHT = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22];

// A simple pitched roof. width = across the ridge, length = along the ridge.
function gableRoof(width, height, length, baseY) {
  const g = new THREE.CylinderGeometry(1, 1, length, 3).rotateX(-Math.PI / 2);
  g.scale(width / 1.732, height / 1.5, 1);
  g.translate(0, baseY + height / 3, 0);
  return g;
}

// Small corner shop (kade) with tin roof and awning
function shopLayers() {
  return [
    { geo: new THREE.BoxGeometry(7, 3.2, 6).translate(0, 1.6, 0), palette: SHOP_WALLS },
    { geo: gableRoof(6.8, 1.5, 7.8, 3.2).rotateY(Math.PI / 2), palette: TIN_ROOFS },
    { geo: new THREE.BoxGeometry(5, 2.3, 0.12).translate(0, 1.15, 3.02), color: 0x3a2a1e },
    { geo: new THREE.BoxGeometry(7.2, 0.15, 1.8).translate(0, 2.55, 3.9), palette: BRIGHT },
    { geo: new THREE.BoxGeometry(4.2, 0.6, 0.12).translate(0, 2.95, 3.03), color: 0xf5f0e0 },
  ];
}

// Two-storey shop with a flat roof
function shopHouseLayers() {
  return [
    { geo: new THREE.BoxGeometry(8, 6.4, 7).translate(0, 3.2, 0), palette: SHOP_WALLS },
    { geo: new THREE.BoxGeometry(8.4, 0.35, 7.4).translate(0, 6.55, 0), color: 0x9a9a94 },
    { geo: new THREE.BoxGeometry(2.2, 2.4, 0.12).translate(-2.4, 1.2, 3.52), color: 0x3a2a1e },
    { geo: new THREE.BoxGeometry(2.2, 2.4, 0.12).translate(2.4, 1.2, 3.52), color: 0x3a2a1e },
    { geo: new THREE.BoxGeometry(1.4, 2.2, 0.12).translate(0, 1.1, 3.52), color: 0x5a3a22 },
    { geo: new THREE.BoxGeometry(6, 0.7, 0.14).translate(0, 3.0, 3.55), palette: BRIGHT },
    { geo: new THREE.BoxGeometry(1.3, 1.3, 0.12).translate(-2.4, 4.8, 3.52), color: 0x7fb3d5 },
    { geo: new THREE.BoxGeometry(1.3, 1.3, 0.12).translate(0, 4.8, 3.52), color: 0x7fb3d5 },
    { geo: new THREE.BoxGeometry(1.3, 1.3, 0.12).translate(2.4, 4.8, 3.52), color: 0x7fb3d5 },
    { geo: new THREE.BoxGeometry(8.6, 0.12, 1.2).translate(0, 3.5, 4.1), color: 0xbdb7a9 },
  ];
}

// Roadside tea stall: open front, counter, tin roof
function stallLayers() {
  return [
    { geo: new THREE.BoxGeometry(4.4, 2.6, 0.25).translate(0, 1.3, -1.6), palette: SHOP_WALLS },
    { geo: new THREE.BoxGeometry(0.25, 2.6, 3.4).translate(-2.1, 1.3, 0), palette: SHOP_WALLS },
    { geo: new THREE.BoxGeometry(0.25, 2.6, 3.4).translate(2.1, 1.3, 0), palette: SHOP_WALLS },
    { geo: new THREE.BoxGeometry(4, 1, 0.8).translate(0, 0.5, 1.2), color: 0x7a5a3a },
    { geo: gableRoof(4.4, 0.9, 5.2, 2.6).rotateY(Math.PI / 2), palette: TIN_ROOFS },
    { geo: new THREE.BoxGeometry(2.6, 0.5, 0.1).translate(0, 2.2, 1.75), palette: BRIGHT },
  ];
}

// depth = how far the building reaches back from the road (metres)
// hit = the solid box for collisions: half the width, and how far it reaches behind (z0) and in front (z1) of its centre
const TOWN_TYPES = [
  { layers: shopLayers, depth: 6, weight: 3, hit: { hx: 3.6, z0: -3.0, z1: 4.8 } },
  { layers: shopHouseLayers, depth: 7, weight: 3, hit: { hx: 4.3, z0: -3.5, z1: 4.7 } },
  { layers: stallLayers, depth: 3.4, weight: 2, hit: { hx: 2.3, z0: -2.0, z1: 2.2 } },
  { layers: houseLayers, depth: 6, weight: 2, hit: { hx: 3.1, z0: -3.1, z1: 3.1 } },
];

// A solid box for collisions, turned to face the same way as the building
function makeBox(x, z, spin, hx, z0, z1) {
  const ax = Math.cos(spin), az = -Math.sin(spin);   // the building's width direction
  const bx = Math.sin(spin), bz = Math.cos(spin);    // the direction its front faces
  const mid = (z0 + z1) / 2;
  const hz = (z1 - z0) / 2;
  return { x: x + bx * mid, z: z + bz * mid, ax, az, bx, bz, hx, hz, bound: Math.hypot(hx, hz) };
}

// Puts rows of shops and houses beside the road in the stretches the map lists in `towns`
function buildTowns(map, road) {
  const out = { meshes: [], spots: [] };
  if (!map.towns) return out;

  const rand = seededRandom(map.seed * 31 + 5);   // its own random numbers, so other scenery stays the same
  const n = road.samples.length;
  const crossIdx = (map.crossings ?? []).map((u) => road.pointAt(u).index);
  const byType = TOWN_TYPES.map(() => []);
  const totalWeight = TOWN_TYPES.reduce((sum, t) => sum + t.weight, 0);

  for (const town of map.towns) {
    const i0 = Math.round(town.from * (n - 1));
    const i1 = Math.round(town.to * (n - 1));
    for (const side of [1, -1]) {                  // 1 = driver's left, -1 = right
      let i = i0 + Math.floor(rand() * 4);
      while (i < i1) {
        const nearCrossing = crossIdx.some((c) => Math.abs(c - i) < 7);
        const gap = rand() < 0.12;                 // an occasional empty plot
        if (!nearCrossing && !gap) {
          let roll = rand() * totalWeight;
          let k = 0;
          while (k < TOWN_TYPES.length - 1 && roll >= TOWN_TYPES[k].weight) {
            roll -= TOWN_TYPES[k].weight;
            k++;
          }
          const scale = 0.9 + rand() * 0.25;
          const p = road.samples[i];
          const t = road.tangents[i];
          const nx = t.z * side;
          const nz = -t.x * side;
          const lateral = road.half + 4 + (TOWN_TYPES[k].depth * scale) / 2;
          const x = p.x + nx * lateral;
          const z = p.z + nz * lateral;
          if (road.nearest(x, z).dist >= road.half + 3 && !tooClose(x, z, out.spots, 8)) {
            const spot = {
              x, z,
              y: road.terrainY(x, z) - 0.3,         // sink a little so it never floats on a slope
              size: scale,
              spin: Math.atan2(-nx, -nz),           // front faces the road
              pick: rand(),
              type: k,
            };
            byType[k].push(spot);
            out.spots.push(spot);
          }
        }
        i += 6 + Math.floor(rand() * 3);            // roughly every 12 to 16 metres
      }
    }
  }

  byType.forEach((spots, k) => {
    if (spots.length > 0) out.meshes.push(...buildInstanced(TOWN_TYPES[k].layers(), spots, rand));
  });
  return out;
}

let clearZone = null;   // set by createScenery: keeps scenery out of the bus yards

// ---------- Road signs ----------
function triangleGeo(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function signPost() {
  return { geo: new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5).translate(0, 1.3, 0), color: 0x888888 };
}

// Red warning triangle. kind = 'curve' (exclamation mark) or 'hill' (slope)
function warningSignLayers(kind) {
  const W = 1.9, H = 1.65, baseY = 1.75;
  const inner = triangleGeo(W, H)
    .translate(0, -H / 3, 0).scale(0.66, 0.66, 1).translate(0, H / 3, 0);
  const layers = [
    signPost(),
    { geo: triangleGeo(W, H).translate(0, baseY, 0.08), color: 0xc0392b, double: true },
    { geo: inner.translate(0, baseY, 0.1), color: 0xffffff, double: true },
  ];
  if (kind === 'hill') {
    const wedge = new THREE.Shape();
    wedge.moveTo(-0.45, 0);
    wedge.lineTo(0.45, 0);
    wedge.lineTo(0.45, 0.42);
    wedge.closePath();
    layers.push({
      geo: new THREE.ShapeGeometry(wedge).translate(0, baseY + 0.38, 0.12),
      color: 0x111111, double: true,
    });
  } else {
    layers.push(
      { geo: new THREE.BoxGeometry(0.12, 0.55, 0.03).translate(0, baseY + 0.78, 0.12), color: 0x111111 },
      { geo: new THREE.BoxGeometry(0.12, 0.12, 0.03).translate(0, baseY + 0.4, 0.12), color: 0x111111 },
    );
  }
  return layers;
}

// Blue pedestrian crossing sign
function crossingSignLayers() {
  return [
    signPost(),
    { geo: new THREE.BoxGeometry(1.2, 1.2, 0.06).translate(0, 2.35, 0.08), color: 0x1f5fa8 },
    { geo: triangleGeo(0.85, 0.75).translate(0, 1.95, 0.12), color: 0xffffff, double: true },
    { geo: new THREE.BoxGeometry(0.1, 0.35, 0.03).translate(0, 2.2, 0.14), color: 0x111111 },
  ];
}

function poleLayers() {
  return [
    { geo: new THREE.CylinderGeometry(0.12, 0.17, 8, 6).translate(0, 4, 0), color: 0x6e6a62 },
    { geo: new THREE.BoxGeometry(2.4, 0.15, 0.15).translate(0, 7.4, 0), color: 0x4a3a2a },
  ];
}

// ---------- Everything along the road: signs, crossings, power poles, stone walls ----------
function buildRoadside(map, road) {
  const meshes = [];
  const opts = map.roadside ?? {};
  const samples = road.samples;
  const tangents = road.tangents;
  const n = samples.length;
  const idxOf = (u) => Math.round(u * (n - 1));
  const noRand = () => 0.5;
  const inTown = (i) =>
    (map.towns ?? []).some((t) => i >= idxOf(t.from) - 20 && i <= idxOf(t.to) + 20);

  // A spot beside the road. side: 1 = driver's left, -1 = right. lateral = metres from the road centre.
  function sideSpot(i, side, lateral) {
    const p = samples[i];
    const t = tangents[i];
    const nxL = t.z;
    const nzL = -t.x;
    const x = p.x + nxL * side * lateral;
    const z = p.z + nzL * side * lateral;
    return {
      x, z,
      y: road.terrainY(x, z),
      nxL, nzL,
      spin: Math.atan2(-t.x, -t.z),   // plate faces the oncoming driver
      size: 1,
      pick: 0,
    };
  }

  // Curve warning signs: a sign about 30 m before every noticeable bend
  const curveSigns = [];
  if (opts.curveSigns) {
    let i = 10;
    while (i < n - 35) {
      const a = tangents[i];
      const b = tangents[Math.min(i + 30, n - 1)];
      const turn = Math.atan2(Math.abs(a.x * b.z - a.z * b.x), a.x * b.x + a.z * b.z);
      if (turn > 0.4) {
        const at = Math.max(0, i - 14);
        if (!inTown(at)) curveSigns.push(sideSpot(at, -1, road.half + 1.8));
        i += 70;
      } else {
        i += 1;
      }
    }
  }

  // Hill warning signs: a sign about 50 m before each climb starts
  const hillSigns = [];
  if (opts.hillSigns && road.hasHills) {
    let climbing = false;
    for (let i = 0; i < n - 11; i++) {
      const slope = (road.elev[i + 10] - road.elev[i]) / 20;
      if (!climbing && slope > 0.03) {
        climbing = true;
        hillSigns.push(sideSpot(Math.max(0, i - 25), -1, road.half + 1.8));
      } else if (climbing && slope < 0.01) {
        climbing = false;
      }
    }
  }

  // Zebra crossings and their signs
  const crossingSigns = [];
  const stripes = [];
  const stripeCount = Math.floor((road.half * 2 - 1) / 1.1);
  for (const u of map.crossings ?? []) {
    const c = road.pointAt(u);
    for (const side of [1, -1]) crossingSigns.push(sideSpot(Math.max(0, c.index - 4), side, road.half + 1.8));
    for (let k = 0; k < stripeCount; k++) {
      const off = (k - (stripeCount - 1) / 2) * 1.1;
      stripes.push({
        x: c.x + c.tz * off,
        y: c.y + 0.25,
        z: c.z - c.tx * off,
        spin: c.heading,
        size: 1,
        pick: 0,
      });
    }
  }

  const addSet = (layers, spots, rand = noRand) => {
    if (spots.length > 0) meshes.push(...buildInstanced(layers, spots, rand));
  };
  addSet(warningSignLayers('curve'), curveSigns);
  addSet(warningSignLayers('hill'), hillSigns);
  addSet(crossingSignLayers(), crossingSigns);
  addSet([{ geo: new THREE.PlaneGeometry(0.6, 3.4).rotateX(-Math.PI / 2), color: 0xffffff }], stripes);

  // Power poles along the right side, with two wires between them
  if (opts.poles) {
    const crossIdx = (map.crossings ?? []).map((u) => idxOf(u));
    const poles = [];
    for (let i = 8; i < n; i += 22) {
      if (crossIdx.some((c) => Math.abs(c - i) < 5)) continue;
      poles.push(sideSpot(i, -1, road.half + 2.2));
    }
    addSet(poleLayers(), poles);

    const wires = [];
    for (let k = 0; k < poles.length - 1; k++) {
      const A = poles[k];
      const B = poles[k + 1];
      for (const off of [-0.9, 0.9]) {
        const ax = A.x + A.nxL * off, ay = A.y + 7.4, az = A.z + A.nzL * off;
        const bx = B.x + B.nxL * off, by = B.y + 7.4, bz = B.z + B.nzL * off;
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const hl = Math.hypot(dx, dz);
        wires.push({
          x: (ax + bx) / 2, y: (ay + by) / 2, z: (az + bz) / 2,
          spin: Math.atan2(dx, dz),
          tilt: -Math.atan2(dy, hl),
          sx: 1, sy: 1, sz: Math.hypot(hl, dy),
          size: 1, pick: 0,
        });
      }
    }
    addSet([{ geo: new THREE.BoxGeometry(0.05, 0.05, 1), color: 0x1a1a1a }], wires);
  }

  // Stone retaining walls on the hillside (left) edge of the road
  const walls = [];
  for (const w of map.walls ?? []) {
    const i0 = idxOf(w.from);
    const i1 = idxOf(w.to);
    for (let i = i0; i + 2 <= i1; i += 2) {
      const a = sideSpot(i, 1, road.half + 0.9);
      const b = sideSpot(i + 2, 1, road.half + 0.9);
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const hl = Math.hypot(dx, dz);
      walls.push({
        x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2,
        spin: Math.atan2(dx, dz),
        tilt: -Math.atan2(dy, hl),
        sx: 1, sy: 1, sz: Math.hypot(hl, dy) + 0.25,
        size: 1, pick: 0,
      });
    }
  }
  addSet([
    { geo: new THREE.BoxGeometry(0.55, 0.9, 1).translate(0, 0.45, 0), color: 0x9a958a, vary: 0.15 },
    { geo: new THREE.BoxGeometry(0.72, 0.12, 1).translate(0, 0.96, 0), color: 0xb5afa3 },
  ], walls, seededRandom(map.seed * 17 + 3));

  return meshes;
}

// ---------- Build all scenery for a map ----------
export function createScenery(map, road, stands = null) {
  clearZone = stands ? (x, z) => stands.contains(x, z, 6) : null;
  const group = new THREE.Group();
  const rand = seededRandom(map.seed);

  // Town shops and the things along the road come first, so everything else keeps clear of them
  const town = buildTowns(map, road);
  if (town.meshes.length > 0) group.add(...town.meshes);
  if (map.roadside || map.crossings || map.walls) {
    const roadside = buildRoadside(map, road);
    if (roadside.length > 0) group.add(...roadside);
  }

  // Houses next, so trees and rocks can avoid them
  const houses = pickSpots(rand, road, map.houseCount ?? 20, {
    near: 6, far: 22, min: 0.9, max: 1.2, spacing: 16, avoid: town.spots, avoidRadius: 12,
  });
  houses.forEach((h) => {
    const r = road.nearest(h.x, h.z);
    h.spin = Math.atan2(r.x - h.x, r.z - h.z); // front door faces the road
    h.y -= 0.3;                                 // sink the base a little so it never floats on a slope
  });
  group.add(...buildInstanced(houseLayers(), houses, rand));

  // Trees (a map can list several shapes in `treeTypes`, they get mixed)
  const trees = pickSpots(rand, road, map.treeCount, {
    near: 8, far: 128, min: 0.8, max: 1.7, avoid: houses.concat(town.spots), avoidRadius: 8,
  });
  const types = map.treeTypes ?? [map.treeType ?? 'pine'];
  types.forEach((type, k) => {
    const ofThisType = trees.filter((t) => Math.floor(t.pick * types.length) === k);
    if (ofThisType.length > 0) {
      group.add(...buildInstanced(treeLayers(type, map), ofThisType, rand));
    }
  });

  // Bushes
  const bushes = pickSpots(rand, road, Math.floor(map.treeCount * 0.5), {
    near: 2.5, far: 30, min: 0.7, max: 1.6, avoid: houses.concat(town.spots), avoidRadius: 6,
  });
  bushes.forEach((b) => { b.sy = b.size * 0.8; });
  group.add(...buildInstanced([
    { geo: new THREE.SphereGeometry(1.2, 6, 5).translate(0, 0.6, 0), color: map.leafColor, vary: 0.2 },
  ], bushes, rand));

  // Rocks
  const rocks = pickSpots(rand, road, 80, {
    near: 4, far: 60, min: 0.6, max: 2.4, avoid: houses.concat(town.spots), avoidRadius: 6,
  });
  rocks.forEach((r) => {
    r.sx = r.size * (0.8 + rand() * 0.6);
    r.sy = r.size * (0.5 + rand() * 0.5);
    r.sz = r.size * (0.8 + rand() * 0.6);
  });
  group.add(...buildInstanced([
    { geo: new THREE.DodecahedronGeometry(1, 0).translate(0, 0.3, 0), color: 0x8d8d86, vary: 0.15, flat: true },
  ], rocks, rand));

  // Distant hills (seen through the haze)
  const hills = pickSpots(rand, road, 40, { near: 220, far: 420, min: 1, max: 1 });
  hills.forEach((h) => {
    h.sx = 80 + rand() * 80;
    h.sz = h.sx;
    h.sy = 30 + rand() * 40;
    if (road.hasHills) h.y -= 20;   // sink the base so it never floats above the slope
  });
  group.add(...buildInstanced([
    { geo: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), color: map.hillColor ?? 0x5b8f4a, vary: 0.12 },
  ], hills, rand));

  // ----- Solid things the bus can hit: trees, rocks, houses and shops (bushes are not solid) -----
  const colliders = { circles: [], boxes: [] };
  trees.forEach((t) => colliders.circles.push({ x: t.x, z: t.z, r: 0.45 * t.size }));   // the trunk
  rocks.forEach((r) => {
    if (r.sy * 1.3 > 0.7) {   // very low rocks are small enough to drive over
      colliders.circles.push({ x: r.x, z: r.z, r: 0.85 * Math.max(r.sx, r.sz) });
    }
  });
  houses.forEach((h) => {
    colliders.boxes.push(makeBox(h.x, h.z, h.spin, 3.1 * h.size, -3.1 * h.size, 3.1 * h.size));
  });
  town.spots.forEach((t) => {
    const hit = TOWN_TYPES[t.type].hit;
    colliders.boxes.push(makeBox(t.x, t.z, t.spin, hit.hx * t.size, hit.z0 * t.size, hit.z1 * t.size));
  });
  group.userData.colliders = colliders;

  return group;
}

// ---------- Optional: models made in Blender (.glb) ----------
const loader = new GLTFLoader();

export function createProps(map, road) {
  const group = new THREE.Group();
  if (!map.props) return group;

  for (const prop of map.props) {
    loader.load(
      prop.model,
      (gltf) => {
        const model = gltf.scene;
        model.position.set(prop.x, road ? road.terrainY(prop.x, prop.z) : 0, prop.z);
        model.rotation.y = prop.rotation || 0;
        group.add(model);
      },
      undefined,
      (error) => console.error('Could not load model:', prop.model, error)
    );
  }
  return group;
}