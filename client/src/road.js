import * as THREE from 'three';

// The grass sits a little below the road surface so the two never overlap
const TERRAIN_DROP = 0.3;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// A flat ribbon that follows the road. `elev` gives the height of each sample point.
function makeStrip(samples, tangents, elev, from, to, y, color, unlit = false) {
  const positions = [];
  const normals = [];
  const indices = [];

  samples.forEach((p, i) => {
    const t = tangents[i];
    const nx = t.z;   // sideways direction, perpendicular to travel
    const nz = -t.x;
    positions.push(
      p.x + nx * from, y + elev[i], p.z + nz * from,
      p.x + nx * to, y + elev[i], p.z + nz * to
    );
    normals.push(0, 1, 0, 0, 1, 0);
    if (i < samples.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);

  const mat = unlit
  ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })   // pure colour, no green tint
  : new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

// Turns the map's `elevation` list into one height for every sample point.
// Each pair is [how far along the road (0 to 1), height in metres].
// Between two pairs the road eases smoothly, so every pair is a flat spot.
function buildElevation(map, count) {
  const pts = map.elevation;
  const out = new Array(count).fill(0);
  if (!pts) return out;

  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    let k = 0;
    while (k < pts.length - 2 && u > pts[k + 1][0]) k++;
    const [u0, h0] = pts[k];
    const [u1, h1] = pts[k + 1];
    const t = Math.min(1, Math.max(0, (u - u0) / (u1 - u0)));
    out[i] = h0 + (h1 - h0) * (t * t * (3 - 2 * t));
  }
  return out;
}

export function createRoad(map) {
  const curve = new THREE.CatmullRomCurve3(
    map.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal'
  );

  // One sample point roughly every 2 metres along the curve
  const count = Math.ceil(curve.getLength() / 2);
  const samples = curve.getSpacedPoints(count);

  const tangents = samples.map((p, i) => {
    const a = samples[Math.max(i - 1, 0)];
    const b = samples[Math.min(i + 1, samples.length - 1)];
    return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  });

  const hasHills = !!map.elevation;
  const elev = buildElevation(map, samples.length);
  const hillLeft = map.hillLeft ?? 14;    // how high the hillside rises on the driver's left
  const hillRight = map.hillRight ?? 6;   // and on the driver's right

  const half = map.roadWidth / 2;
  const group = new THREE.Group();

  group.add(makeStrip(samples, tangents, elev, -half, half, 0.1, map.roadColor));
  group.add(makeStrip(samples, tangents, elev, -half + 0.3, -half + 0.7, 0.2, 0xffffff, true));
  group.add(makeStrip(samples, tangents, elev, half - 0.7, half - 0.3, 0.2, 0xffffff, true));
  group.add(makeStrip(samples, tangents, elev, -0.15, 0.15, 0.2, 0xffffff, true));

  // Find the closest point on the road to any position
  function nearest(x, z) {
    let best = Infinity;
    let bestIndex = 0;
    for (let i = 0; i < samples.length; i++) {
      const dx = samples[i].x - x;
      const dz = samples[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; bestIndex = i; }
    }

    // Road height at that spot, blended smoothly between two sample points
    const a = samples[bestIndex];
    let j = Math.min(bestIndex + 1, samples.length - 1);
    let sx = samples[j].x - a.x;
    let sz = samples[j].z - a.z;
    if ((x - a.x) * sx + (z - a.z) * sz < 0) {
      j = Math.max(bestIndex - 1, 0);
      sx = samples[j].x - a.x;
      sz = samples[j].z - a.z;
    }
    const len2 = sx * sx + sz * sz;
    let t = len2 > 0 ? ((x - a.x) * sx + (z - a.z) * sz) / len2 : 0;
    t = Math.min(1, Math.max(0, t));

    const tg = tangents[bestIndex];
    return {
      dist: Math.sqrt(best),
      index: bestIndex,
      x: a.x,
      z: a.z,
      elev: elev[bestIndex] + (elev[j] - elev[bestIndex]) * t,
      side: ((x - a.x) * tg.z - (z - a.z) * tg.x) >= 0 ? 1 : -1, // 1 = driver's left
    };
  }

  // Height of the hillside at any position (never lower than the road)
  function groundHeight(info, x, z) {
    if (!hasHills) return 0;
    const near = smoothstep(half + 4, half + 90, info.dist);  // hillside slowly rises beside the road
    const far = smoothstep(60, 320, info.dist);               // land keeps rising far away
    const sideAmount = info.side > 0 ? hillLeft : hillRight;
    const bumps =
      Math.sin(x * 0.011) * Math.cos(z * 0.013) + 0.5 * Math.sin(x * 0.027 + z * 0.021);
    return info.elev + near * Math.max(0, sideAmount + bumps * 2) + far * 20;
  }

  // Height of the visible grass (used for trees, houses, rocks)
  function terrainY(x, z) {
    if (!hasHills) return 0;
    return groundHeight(nearest(x, z), x, z) - TERRAIN_DROP;
  }

  // Height the bus should drive at: on the road surface, or on the grass beside it
  function heightAt(x, z) {
    if (!hasHills) return 0;
    const info = nearest(x, z);
    const grass = groundHeight(info, x, z) - TERRAIN_DROP;
    const offRoad = smoothstep(half, half + 2.5, info.dist);
    return info.elev + (grass - info.elev) * offRoad;
  }

  // ---------- The hills themselves ----------
  if (hasHills) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
    }
    const margin = 450;   // reaches past the fog, so the edge is never seen
    const cell = 8;       // size of each terrain square in metres
    const x0 = minX - margin;
    const z0 = minZ - margin;
    const nx = Math.ceil((maxX + margin - x0) / cell) + 1;
    const nz = Math.ceil((maxZ + margin - z0) / cell) + 1;

    const positions = new Float32Array(nx * nz * 3);
    const colors = new Float32Array(nx * nz * 3);
    const base = new THREE.Color(map.groundColor);
    const c = new THREE.Color();

    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = x0 + ix * cell;
        const z = z0 + iz * cell;
        const y = groundHeight(nearest(x, z), x, z) - TERRAIN_DROP;
        const v = (iz * nx + ix) * 3;
        positions[v] = x;
        positions[v + 1] = y;
        positions[v + 2] = z;

        // Soft patches of lighter and darker grass so the hills don't look flat
        const shade =
          Math.sin(x * 0.021) * Math.cos(z * 0.017) * 0.035 +
          Math.sin(x * 0.05 + z * 0.04) * 0.015;
        c.copy(base).offsetHSL(0, 0, shade);
        colors[v] = c.r;
        colors[v + 1] = c.g;
        colors[v + 2] = c.b;
      }
    }

    const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let k = 0;
    for (let iz = 0; iz < nz - 1; iz++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        const a = iz * nx + ix;
        const b = (iz + 1) * nx + ix;
        const cc = iz * nx + ix + 1;
        const d = (iz + 1) * nx + ix + 1;
        indices[k++] = a; indices[k++] = b; indices[k++] = cc;
        indices[k++] = cc; indices[k++] = b; indices[k++] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  // A spot on the road, given how far along it is (0 = start, 1 = finish)
  function pointAt(u) {
    const i = Math.min(samples.length - 1, Math.max(0, Math.round(u * (samples.length - 1))));
    const t = tangents[i];
    return {
      index: i,
      x: samples[i].x,
      y: elev[i],
      z: samples[i].z,
      tx: t.x,
      tz: t.z,
      heading: Math.atan2(t.x, t.z),
    };
  }

  const t0 = tangents[0];
  const start = { x: samples[0].x, z: samples[0].z, heading: Math.atan2(t0.x, t0.z) };

  return {
    group, samples, tangents, elev, nearest, start, half, hasHills, heightAt, terrainY, pointAt,
  };
}