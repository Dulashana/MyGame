// Simple, fast collisions.
// The bus is treated as a row of circles along its length.
// Trees and rocks are circles. Houses and shops are boxes. Bushes are NOT solid.

const BUS_HALF_WIDTH = 1.3;
const BOUNCE = 0.12;       // how much the bus bounces back (0 = dead stop)
const TWIST = 0.05;        // how much a hit turns the bus (bigger = spins more)
const MAX_TWIST = 0.1;     // largest turn from a single hit (radians)
const SCRAPE_DRAG = 1.2;   // slowing while you scrape along something

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Returns how hard the hardest hit was (m/s), or 0 if nothing was touched.
export function collideBus(state, colliders, busLength, dt) {
  if (!colliders) return 0;

  const r = BUS_HALF_WIDTH;
  const span = Math.max(0, busLength - 2 * r);          // distance between first and last circle
  const count = Math.max(2, Math.ceil(span / 2) + 1);   // a circle about every 2 metres
  const inertia = (busLength * busLength + 4 * r * r) / 12;
  const reach = busLength / 2 + 1;
  let strongest = 0;
  let touched = false;

  // Pushes the bus out and takes away the speed that was going into the obstacle.
  // (nx, nz) points from the obstacle toward the bus. (px, pz) is where they touch.
  function hit(nx, nz, depth, px, pz) {
    touched = true;
    const push = Math.min(depth, 1.2);
    state.x += nx * push;
    state.z += nz * push;

    const s = Math.sin(state.heading);
    const c = Math.cos(state.heading);
    const vx = s * state.speed + c * state.vLat;
    const vz = c * state.speed - s * state.vLat;
    const vn = vx * nx + vz * nz;
    if (vn >= 0) return;                                 // already moving away

    const impulse = -(1 + BOUNCE) * vn;
    const nvx = vx + nx * impulse;
    const nvz = vz + nz * impulse;
    state.speed = nvx * s + nvz * c;
    state.vLat = nvx * c - nvz * s;

    // A hit off-centre twists the bus (a hit on the front-left turns the nose right)
    const rx = px - state.x;
    const rz = pz - state.z;
    const twist = ((rz * nx - rx * nz) * impulse) / inertia;
    state.heading += clamp(twist * TWIST, -MAX_TWIST, MAX_TWIST);

    strongest = Math.max(strongest, -vn);
  }

  for (let pass = 0; pass < 2; pass++) {
    const sinH = Math.sin(state.heading);
    const cosH = Math.cos(state.heading);

    for (let k = 0; k < count; k++) {
      const off = -span / 2 + (span * k) / (count - 1);
      const cx = state.x + sinH * off;
      const cz = state.z + cosH * off;

      // ----- Trees and rocks (circles) -----
      for (const c of colliders.circles) {
        if (Math.abs(c.x - state.x) > reach + c.r || Math.abs(c.z - state.z) > reach + c.r) continue;
        const dx = cx - c.x;
        const dz = cz - c.z;
        const limit = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= limit * limit) continue;
        const d = Math.sqrt(d2);
        const nx = d > 0.0001 ? dx / d : -sinH;
        const nz = d > 0.0001 ? dz / d : -cosH;
        hit(nx, nz, limit - d, cx - nx * r, cz - nz * r);
      }

      // ----- Houses and shops (boxes that can be turned) -----
      for (const b of colliders.boxes) {
        if (Math.abs(b.x - state.x) > reach + b.bound || Math.abs(b.z - state.z) > reach + b.bound) continue;
        const relX = cx - b.x;
        const relZ = cz - b.z;
        const u = relX * b.ax + relZ * b.az;   // position along the box's width
        const w = relX * b.bx + relZ * b.bz;   // position along the box's depth
        let lx, lz, depth;                     // push direction in the box's own axes

        if (Math.abs(u) < b.hx && Math.abs(w) < b.hz) {
          // The circle's centre is inside: push out the shortest way
          const outX = b.hx - Math.abs(u);
          const outZ = b.hz - Math.abs(w);
          if (outX < outZ) { lx = Math.sign(u) || 1; lz = 0; depth = outX + r; }
          else { lx = 0; lz = Math.sign(w) || 1; depth = outZ + r; }
        } else {
          const px = clamp(u, -b.hx, b.hx);
          const pz = clamp(w, -b.hz, b.hz);
          const ddx = u - px;
          const ddz = w - pz;
          const d = Math.hypot(ddx, ddz);
          if (d >= r) continue;
          lx = ddx / d;
          lz = ddz / d;
          depth = r - d;
        }

        const nx = lx * b.ax + lz * b.bx;
        const nz = lx * b.az + lz * b.bz;
        hit(nx, nz, depth, cx - nx * r, cz - nz * r);
      }
    }
  }

  if (touched) state.speed *= Math.max(0, 1 - SCRAPE_DRAG * dt);
  return strongest;
}