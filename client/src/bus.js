import * as THREE from 'three';

// ---------- BUS DESIGNS (edit the colours and length freely) ----------
export const busStyles = [
  {
    name: 'SLTB Bus',
    viking: true,
    length: 12,
    lower: 0xc82026,
    body: 0xc82026,
    roof: 0xf2eee2,
    stripe: 0xffffff,
    stripe2: 0xc82026,
    glass: 0x1c2a3a,
  },
  {
    name: 'Private Bus',
    viking: true,
    length: 12,
    lower: 0xf4f4f4,
    body: 0x2f6db5,
    roof: 0xf4f4f4,
    stripe: 0x1d4f91,
    stripe2: 0xe63946,
    glass: 0x1c2a3a,
  },
  {
    name: 'Metro Bus',
    metro: true,
    length: 12,
    lower: 0xf1efe9,
    body: 0x15191f,
    roof: 0xf4f2ee,
    stripe: 0x1aa39b,
    stripe2: 0xc8201f,
    glass: 0x24384d,
  },
];

// Distance between the front and rear axles (used for the turning circle)
export function getWheelbase(style) {
  if (style.metro) return style.length - 6.2;
  return style.viking ? style.length - 4.6 : style.length - 3.2;
}

// ---------- SMALL HELPERS ----------
function toolkit(bus) {
  const cache = {};
  const mat = (c) => (cache[c] ??= new THREE.MeshLambertMaterial({ color: c }));
  const glow = (c) => (cache['g' + c] ??= new THREE.MeshBasicMaterial({ color: c }));

  // A box: width, height, length, then x, y, z position
  function box(w, h, l, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
    mesh.position.set(x, y, z);
    bus.add(mesh);
    return mesh;
  }

  // A round disc facing forward/back (used for headlights and badges)
  function disc(radius, thickness, x, y, z, material) {
    const geo = new THREE.CylinderGeometry(radius, radius, thickness, 14);
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    bus.add(mesh);
    return mesh;
  }

  return { mat, glow, box, disc };
}

function addWheels(bus, mat, zList, wheelX) {
  const tireGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 14);
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.44, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const markGeo = new THREE.BoxGeometry(0.46, 0.5, 0.1);

  bus.userData.wheels = [];
  bus.userData.frontWheels = [];

  zList.forEach((z, index) => {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.rotation.order = 'YXZ';   // steer first, then spin
      wheel.add(
        new THREE.Mesh(tireGeo, mat(0x111111)),
        new THREE.Mesh(hubGeo, mat(0xbdbdbd)),
        new THREE.Mesh(markGeo, mat(0x555555))
      );
      wheel.position.set(side * wheelX, 0.55, z);
      bus.add(wheel);
      bus.userData.wheels.push(wheel);
      if (index === 0) bus.userData.frontWheels.push(wheel); // first axle = front
    }
  });
}

// A flat plate with text on it (chrome lettering, number plates)
function textPlate(bus, text, w, h, bg, fg, x, y, z, flip = false) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round((1024 * h) / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.font = 'bold ' + Math.round(c.height * 0.6) + 'px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  plate.position.set(x, y, z);
  if (flip) plate.rotation.y = Math.PI;   // faces backwards
  bus.add(plate);
}

// ---------- BUS MODEL ----------
export function createBus(style = busStyles[0]) {
  if (style.metro) return createMetroBus(style);
  if (style.viking) return createVikingBus(style);

  // Classic bus (only used if you add a style without metro/viking)
  const bus = new THREE.Group();
  const { mat, glow, box } = toolkit(bus);
  const L = style.length;
  const f = L / 2;
  const glass = mat(style.glass);
  bus.userData.brakeMat = glow(0xff2a2a);

  box(2.4, 0.5, L - 0.4, 0, 0.75, 0, mat(0x1b1b1b));
  box(2.6, 1.2, L, 0, 1.45, 0, mat(style.lower));
  box(2.6, 1.3, L, 0, 2.7, 0, mat(style.body));
  box(2.66, 0.2, L + 0.04, 0, 2.05, 0, mat(style.stripe));
  box(2.66, 0.1, L + 0.04, 0, 1.15, 0, mat(style.stripe2));
  box(2.5, 0.18, L - 0.2, 0, 3.44, 0, mat(style.roof));

  const doorZ = f - 1.5;
  const windowCount = Math.floor((L - 1.8) / 1.5);
  for (let i = 0; i < windowCount; i++) {
    const z = -f + 1.1 + i * 1.5;
    for (const side of [-1, 1]) {
      if (side === 1 && z + 0.6 > doorZ - 0.55) continue;
      box(0.06, 0.85, 1.2, side * 1.31, 2.8, z, glass);
    }
  }
  box(0.08, 1.9, 1.1, 1.31, 1.95, doorZ, mat(0x16324f));

  box(2.3, 0.9, 0.08, 0, 2.65, f + 0.02, glass);
  box(1.8, 0.32, 0.08, 0, 3.22, f + 0.03, glow(0xfff3b0));
  box(2.7, 0.3, 0.35, 0, 0.85, f + 0.1, mat(0xb0b0b0));
  for (const side of [-1, 1]) {
    box(0.45, 0.32, 0.1, side * 0.95, 1.3, f + 0.04, glow(0xfff3b0));
  }

  box(2.3, 0.9, 0.08, 0, 2.65, -f - 0.02, glass);
  box(2.7, 0.3, 0.3, 0, 0.85, -f - 0.08, mat(0x888888));
  for (const side of [-1, 1]) {
    box(0.3, 0.4, 0.08, side * 1.1, 1.4, -f - 0.02, bus.userData.brakeMat);
  }

  addWheels(bus, mat, [f - 1.5, -f + 1.7], 1.25);
  setBrakeLights(bus, false);
  return bus;
}

// ---------- METRO BUS (Foton C12 style: low floor, two doors on the left) ----------
function createMetroBus(style) {
  const bus = new THREE.Group();
  const { mat, glow, box, disc } = toolkit(bus);
  const L = style.length;
  const f = L / 2;
  const fz = (d) => f - d;                 // z of a spot that is d metres back from the front
  const glass = mat(style.glass);
  const dark = mat(0x15191f);
  const slat = mat(0x3a3f47);
  const silver = mat(0xc9ccd1);
  const red = mat(style.stripe2);
  const teal = mat(style.stripe);
  const yellow = mat(0xf2c200);
  const bodyLen = L - 0.7;

  // ----- Main body -----
  box(2.5, 0.8, bodyLen, 0, 0.7, 0, mat(style.lower));
  box(2.5, 1.85, bodyLen, 0, 2.025, 0, mat(style.body));
  box(2.5, 0.35, bodyLen, 0, 3.125, 0, mat(style.roof));
  box(1.8, 0.18, 5.2, 0, 3.39, 0.4, mat(style.roof));

  for (const s of [-1, 1]) {
    box(0.03, 0.2, 7.6, s * 1.255, 0.6, 1.4, teal);
    box(0.03, 0.8, 2.5, s * 1.255, 0.7, fz(10.2), red);
  }

  // ----- Side windows -----
  const leftWindows = [[1.0, 0.9], [3.55, 1.4], [5.05, 1.4], [6.55, 1.4], [9.4, 1.2]];
  const rightWindows = [[1.0, 1.2], [2.35, 1.3], [3.75, 1.3], [5.15, 1.3], [6.55, 1.3], [7.95, 1.3], [9.35, 1.3], [10.75, 1.2]];
  for (const [d, w] of leftWindows) box(0.06, 1.35, w, 1.27, 2.05, fz(d), glass);
  for (const [d, w] of rightWindows) box(0.06, 1.35, w, -1.27, 2.05, fz(d), glass);

  // ----- Two double doors on the left -----
  for (const dz of [fz(2.2), fz(8.0)]) {
    box(0.07, 2.1, 1.25, 1.265, 1.4, dz, dark);
    box(0.08, 1.8, 0.55, 1.275, 1.45, dz - 0.3, glass);
    box(0.08, 1.8, 0.55, 1.275, 1.45, dz + 0.3, glass);
    box(0.085, 0.05, 1.1, 1.28, 1.0, dz, yellow);
  }

  // ----- Engine vents on the rear left side -----
  box(0.04, 1.3, 1.4, 1.27, 1.65, fz(10.8), dark);
  for (let i = 0; i < 5; i++) box(0.05, 0.03, 1.3, 1.275, 1.15 + i * 0.25, fz(10.8), slat);

  // ----- Front -----
  box(2.54, 3.0, 0.35, 0, 1.8, f - 0.175, red);
  box(2.2, 1.45, 0.06, 0, 2.225, f + 0.02, glass);
  box(0.05, 1.45, 0.08, 0, 2.225, f + 0.04, dark);
  box(1.9, 0.26, 0.07, 0, 2.78, f + 0.05, glow(0xbcd7f0));
  box(2.46, 0.12, 0.09, 0, 1.44, f + 0.04, teal);
  box(2.46, 0.63, 0.08, 0, 1.065, f + 0.03, dark);
  box(2.56, 0.3, 0.14, 0, 0.5, f + 0.05, red);
  box(0.55, 0.14, 0.03, 0, 0.5, f + 0.13, mat(0xf4f4f4));
  disc(0.1, 0.04, 0, 1.06, f + 0.075, silver);
  for (const s of [-1, 1]) {
    box(0.55, 0.16, 0.06, s * 0.88, 0.95, f + 0.09, glow(0xfff3b0));
    box(0.3, 0.07, 0.06, s * 0.88, 1.12, f + 0.09, glow(0xffffff));
    box(0.16, 0.1, 0.06, s * 1.1, 0.8, f + 0.09, glow(0xff9a1a));
    box(0.8, 0.03, 0.03, s * 0.5, 1.58, f + 0.07, dark);
    box(0.45, 0.05, 0.05, s * 1.5, 2.7, f - 0.2, dark);
    box(0.08, 0.7, 0.3, s * 1.72, 2.35, f - 0.2, dark);
  }

  // ----- Rear -----
  bus.userData.brakeMat = glow(0xd62020);
  box(2.54, 3.0, 0.35, 0, 1.8, -f + 0.175, red);
  box(2.1, 1.0, 0.06, 0, 2.45, -f - 0.02, glass);
  box(1.5, 0.55, 0.05, 0, 1.2, -f - 0.02, dark);
  for (let i = 0; i < 4; i++) box(1.5, 0.03, 0.06, 0, 1.0 + i * 0.14, -f - 0.05, slat);
  box(0.55, 0.14, 0.03, 0, 0.75, -f - 0.04, mat(0xf4f4f4));
  box(0.9, 0.08, 0.04, 0, 3.1, -f - 0.03, bus.userData.brakeMat);
  for (const s of [-1, 1]) {
    for (const y of [1.0, 1.2, 1.4]) box(0.14, 0.14, 0.05, s * 1.12, y, -f - 0.03, bus.userData.brakeMat);
    box(0.14, 0.14, 0.05, s * 1.12, 1.6, -f - 0.03, glow(0xff9a1a));
  }

  addWheels(bus, mat, [f - 3.8, -f + 2.4], 1.15);
  setBrakeLights(bus, false);
  return bus;
}

// ---------- VIKING-STYLE TWO-DOOR BUS (Lanka Ashok Leyland Viking) ----------
function createVikingBus(style) {
  const bus = new THREE.Group();
  const { mat, glow, box, disc } = toolkit(bus);
  const L = style.length;
  const f = L / 2;
  const glass = mat(style.glass);
  const dark = mat(0x1b1b1b);
  const silver = mat(0xc9ccd1);
  const doorMat = mat(0x16324f);
  bus.userData.brakeMat = glow(0xd62020);   // shared brake-light material
  const bumperColor = style.bumper ?? style.body;

  // ----- Main body (layers from bottom to top) -----
  box(2.2, 0.4, L - 0.6, 0, 0.7, 0, dark);                      // chassis
  box(2.5, 1.3, L, 0, 1.1, 0, mat(style.lower));                // lower body
  box(2.54, 0.12, L + 0.02, 0, 1.8, 0, mat(style.stripe));      // main stripe
  box(2.54, 0.05, L + 0.02, 0, 1.9, 0, mat(style.stripe2));     // thin line
  box(2.5, 1.0, L, 0, 2.4, 0, mat(style.body));                 // window band
  box(2.5, 0.4, L, 0, 3.1, 0, mat(style.roof));                 // roof band
  box(2.3, 0.14, L - 0.3, 0, 3.37, 0, mat(style.roof));         // roof cap
  box(0.9, 0.12, 0.9, 0, 3.5, L * 0.15, mat(0xbfbfbf));         // roof hatch
  box(0.9, 0.12, 0.9, 0, 3.5, -L * 0.2, mat(0xbfbfbf));         // roof hatch

  // ----- Two doors on the left side (+x) -----
  const frontDoorZ = f - 1.1;
  const rearDoorZ = -f + 3.8;
  for (const dz of [frontDoorZ, rearDoorZ]) {
    box(0.1, 1.95, 1.0, 1.26, 1.72, dz, doorMat);
    box(0.12, 0.7, 0.8, 1.27, 2.3, dz, glass);
    box(0.45, 0.1, 0.9, 1.4, 0.5, dz, mat(0x333333));
    box(0.06, 1.2, 0.06, 1.32, 1.4, dz - 0.45, silver);
  }

  // ----- Side windows (skipped where a door is) -----
  for (let z = -f + 1.0; z < f - 1.0; z += 1.45) {
    box(0.06, 0.75, 1.2, -1.27, 2.4, z, glass);
    const nearDoor =
      Math.abs(z - frontDoorZ) < 1.15 || Math.abs(z - rearDoorZ) < 1.15;
    if (!nearDoor) box(0.06, 0.75, 1.2, 1.27, 2.4, z, glass);
  }

  // ----- Front (modelled on the Lanka Ashok Leyland Viking) -----
  // Front panel around the windscreens
  box(2.5, 1.0, 0.1, 0, 2.4, f + 0.05, mat(style.lower));

  // Two windscreens: dark frames, glass, centre post
  for (const s of [-1, 1]) {
    box(1.1, 0.92, 0.06, s * 0.6, 2.37, f + 0.11, dark);
    box(1.0, 0.8, 0.04, s * 0.6, 2.37, f + 0.145, glass);
  }
  box(0.2, 0.92, 0.06, 0, 2.37, f + 0.13, mat(style.lower));

  // Wipers
  for (const s of [-1, 1]) {
    const wiper = box(0.75, 0.035, 0.035, s * 0.45, 2.06, f + 0.19, mat(0x171717));
    wiper.rotation.z = s * 0.3;
  }

  // Roof visor and destination board
  box(2.54, 0.1, 0.24, 0, 2.93, f + 0.12, mat(style.roof));
  box(1.5, 0.4, 0.08, 0, 3.12, f + 0.04, dark);
  box(1.36, 0.3, 0.04, 0, 3.12, f + 0.085, glow(0xf0b030));

  // Chrome ledge with lettering
  box(2.58, 0.14, 0.2, 0, 1.82, f + 0.1, silver);
  textPlate(bus, 'LANKA · ASHOK · LEYLAND', 1.6, 0.09, '#c9ccd1', '#1a1a1a', 0, 1.82, f + 0.205);

  // Wide grille: left vent, taller centre section, right vent
  box(0.67, 0.4, 0.06, -0.77, 1.48, f + 0.03, mat(0x0c0c0e));
  box(0.95, 0.64, 0.06, 0, 1.36, f + 0.03, mat(0x0c0c0e));
  box(0.67, 0.4, 0.06, 0.77, 1.48, f + 0.03, mat(0x0c0c0e));
  const slat = mat(0x2a2d33);
  for (let i = 0; i < 5; i++) {
    box(0.6, 0.03, 0.03, -0.77, 1.32 + i * 0.075, f + 0.065, slat);
    box(0.6, 0.03, 0.03, 0.77, 1.32 + i * 0.075, f + 0.065, slat);
  }
  for (let i = 0; i < 8; i++) {
    box(0.88, 0.03, 0.03, 0, 1.1 + i * 0.075, f + 0.065, slat);
  }

  // Badge
  disc(0.09, 0.04, 0, 0.93, f + 0.03, silver);

  // Two pairs of round headlights in lighter recessed panels
  for (const s of [-1, 1]) {
    box(0.58, 0.34, 0.03, s * 0.8, 1.07, f + 0.015, mat(0xb7c0ca));
    for (const dx of [-0.125, 0.125]) {
      const x = s * 0.8 + dx;
      disc(0.14, 0.06, x, 1.07, f + 0.05, silver);
      disc(0.1, 0.06, x, 1.07, f + 0.075, glow(0xfff1b5));
    }
    box(0.1, 0.28, 0.07, s * 1.2, 1.07, f + 0.03, glow(0xff9f1c));
  }

  // Bumper with number plate, VIKING badge and bolts
  box(2.62, 0.3, 0.4, 0, 0.6, f + 0.16, mat(bumperColor));
  box(2.5, 0.06, 0.34, 0, 0.43, f + 0.18, dark);
  textPlate(bus, 'NB 1234', 0.6, 0.2, '#e8e8e8', '#222222', 0, 0.58, f + 0.365);
  textPlate(bus, 'VIKING', 0.34, 0.08, '#1a1a1a', '#ffffff', 0.68, 0.7, f + 0.365);
  for (const s of [-1, 1]) disc(0.05, 0.03, s * 1.0, 0.6, f + 0.37, silver);

  // Mirrors
  for (const s of [-1, 1]) {
    box(0.35, 0.05, 0.05, s * 1.42, 2.7, f - 0.1, dark);
    box(0.12, 0.55, 0.22, s * 1.6, 2.4, f - 0.1, dark);
  }

  // ----- Rear -----
    // ----- Rear (modelled on the Lanka Ashok Leyland Viking) -----
  const rz = -f;   // the rear face

  // Roof visor and rear destination board in the dome
  box(2.54, 0.1, 0.24, 0, 2.93, rz - 0.12, mat(style.roof));
  box(1.7, 0.4, 0.08, 0, 3.12, rz - 0.04, dark);

  // Big rear window: dark frame, glass, louvres, decal banner
  box(2.34, 1.0, 0.08, 0, 2.4, rz - 0.04, dark);
  box(2.2, 0.86, 0.04, 0, 2.4, rz - 0.075, glass);
  for (let i = 0; i < 3; i++) {
    box(2.1, 0.025, 0.03, 0, 2.52 + i * 0.1, rz - 0.1, mat(0x3a3f47));
  }
  

  // Chrome ledge under the window
  box(2.56, 0.1, 0.14, 0, 1.93, rz - 0.06, silver);

  // Tail lights: three square lamps in a chrome housing on each side (these glow when you brake)
  for (const s of [-1, 1]) {
    box(0.88, 0.34, 0.05, s * 0.78, 1.68, rz - 0.03, silver);
    for (let i = 0; i < 3; i++) {
      box(0.22, 0.26, 0.05, s * (0.52 + i * 0.26), 1.68, rz - 0.065, bus.userData.brakeMat);
    }
  }

  // Number plate in the middle of the band
  box(0.78, 0.36, 0.04, 0, 1.68, rz - 0.04, dark);
  textPlate(bus, style.plateText ?? 'ND 8210', 0.7, 0.3, style.plateColor ?? '#f2c200', '#1a1a1a', 0, 1.68, rz - 0.065, true);

  // "LANKA ASHOK LEYLAND" chrome plate
  textPlate(bus, 'LANKA ASHOK LEYLAND', 1.9, 0.1, '#c9ccd1', '#1a1a1a', 0, 1.4, rz - 0.04, true);

  // Engine hatch: outline, handle, round badge
  const hatchLine = mat(0x555a60);
  box(1.56, 0.03, 0.03, 0, 1.36, rz - 0.03, hatchLine);
  box(1.56, 0.03, 0.03, 0, 0.56, rz - 0.03, hatchLine);
  box(0.03, 0.83, 0.03, -0.78, 0.96, rz - 0.03, hatchLine);
  box(0.03, 0.83, 0.03, 0.78, 0.96, rz - 0.03, hatchLine);
  box(0.06, 0.3, 0.06, -0.55, 1.05, rz - 0.06, silver);        // handle
  disc(0.12, 0.04, 0, 1.0, rz - 0.04, silver);                  // badge

  // Small amber / red / amber lights near the lower corners
  for (const s of [-1, 1]) {
    box(0.46, 0.18, 0.04, s * 1.0, 0.92, rz - 0.03, dark);
    box(0.12, 0.14, 0.05, s * 1.0 - 0.15, 0.92, rz - 0.05, glow(0xe0a030));
    box(0.14, 0.14, 0.05, s * 1.0, 0.92, rz - 0.05, bus.userData.brakeMat);
    box(0.12, 0.14, 0.05, s * 1.0 + 0.15, 0.92, rz - 0.05, glow(0xe0a030));
  }

  // Rear bumper: thin, in the bumper colour, with a chrome lip
  box(2.64, 0.22, 0.3, 0, 0.6, rz - 0.1, mat(bumperColor));
  box(2.66, 0.04, 0.32, 0, 0.72, rz - 0.1, silver);

  // ----- Wheels -----
  addWheels(bus, mat, [f - 2.7, -f + 1.9], 1.15);
  setBrakeLights(bus, false);
  return bus;
}

export function spinWheels(bus, speed, dt, steer = 0) {
  for (const wheel of bus.userData.wheels) {
    wheel.rotation.x += (speed / 0.55) * dt;
  }
  for (const wheel of bus.userData.frontWheels) {
    wheel.rotation.y = steer;   // front wheels turn with the steering
  }
}

// Dark red normally, bright red when braking
export function setBrakeLights(bus, on) {
  const m = bus.userData.brakeMat;
  if (!m) return;
  m.color.setHex(on ? 0xff3030 : 0x7a1010);
}

// ---------- DRIVING (heavy bus) ----------
// Tuning numbers: change these to adjust the feel
const MAX_SPEED = 31;         // hard limit (m/s)
const MAX_REVERSE = 6;
const ENGINE_POWER = 160;     // bigger = stronger at high speed
const MAX_PUSH = 3.5;         // strongest acceleration from a standstill (m/s²)
const BRAKE_DECEL = 7;        // braking strength (m/s²)
const HANDBRAKE_DECEL = 4;
const ROLLING = 0.25;         // constant resistance
const AIR_DRAG = 0.0045;      // resistance growing with speed
const ENGINE_BRAKE = 0.7;     // slowing when you lift off the gas
const MAX_STEER = 0.6;        // steering angle at low speed (radians)
const STEER_SPEED = 1.1;      // how fast the wheel turns (lower = heavier)
const STEER_RETURN = 1.8;     // how fast it straightens
const GRIP = 7.5;             // sideways grip (m/s²). Bigger = sticks to the road more
const HANDBRAKE_GRIP = 3.0;

export function createBusState(wheelbase = 5.5) {
  return {
    x: 0, z: 0, heading: 0,
    wheelbase,
    speed: 0,      // forward speed (m/s)
    vLat: 0,       // sideways sliding speed (m/s)
    steer: 0,      // current steering angle
    throttle: 0, brake: 0,
    roll: 0, pitch: 0,   // body lean for visuals
  };
}

// Moves a number toward a target at a fixed rate
function approach(value, target, rate, dt) {
  const step = rate * dt;
  if (value < target) return Math.min(value + step, target);
  return Math.max(value - step, target);
}

export function updateBus(state, keys, dt) {
  const oldSpeed = state.speed;

  // ----- 1. Pedals (they ramp in gradually) -----
  const movingForward = state.speed > 0.5;
  const movingBackward = state.speed < -0.5;
  let throttleTarget = 0;
  let brakeTarget = 0;
  if (keys.forward) {
    if (movingBackward) brakeTarget = 1; else throttleTarget = 1;
  }
  if (keys.back) {
    if (movingForward) brakeTarget = 1; else throttleTarget = -1;
  }
  state.throttle = approach(state.throttle, throttleTarget, 2.2, dt);
  state.brake = approach(state.brake, brakeTarget, 4, dt);

  // ----- 2. Forward speed -----
  let accel = 0;
  if (state.throttle > 0) {
    accel = Math.min(MAX_PUSH, ENGINE_POWER / Math.max(state.speed, 1)) * state.throttle;
  } else if (state.throttle < 0) {
    accel = 1.8 * state.throttle; // reversing is slow
  }

  const engineBrake = Math.abs(state.throttle) < 0.05 ? ENGINE_BRAKE : 0;
  const brakeForce = BRAKE_DECEL * state.brake + (keys.handbrake ? HANDBRAKE_DECEL : 0);
  const opposing =
    (ROLLING + AIR_DRAG * state.speed * state.speed + engineBrake + brakeForce) * dt;

  let v = state.speed + accel * dt;
  if (Math.abs(v) <= opposing) v = 0;
  else v -= Math.sign(v) * opposing;
  v = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, v));

  // ----- 3. Steering -----
  const steerInput = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  const maxSteer = MAX_STEER / (1 + Math.pow(Math.abs(v) / 9, 1.5));
  const rate = steerInput === 0 ? STEER_RETURN : STEER_SPEED;
  state.steer = approach(state.steer, steerInput * maxSteer, rate, dt);
  state.steer = Math.max(-maxSteer, Math.min(maxSteer, state.steer));

  // ----- 4. Turning -----
  let yawRate = (v * Math.tan(state.steer)) / state.wheelbase;
  if (keys.handbrake) yawRate *= 1.35;
  const yawCap = ((keys.handbrake ? 1.6 : 1.1) * GRIP) / Math.max(Math.abs(v), 2);
  yawRate = Math.max(-yawCap, Math.min(yawCap, yawRate));

  // ----- 5. Sideways sliding -----
  let vL = state.vLat;
  vL += -yawRate * v * dt;
  const friction = (keys.handbrake ? HANDBRAKE_GRIP : GRIP) * dt;
  if (Math.abs(vL) <= friction) vL = 0;
  else vL -= Math.sign(vL) * friction;

  v += yawRate * vL * dt;
  v -= Math.sign(v) * Math.abs(vL) * 0.5 * dt;

  // ----- 6. Move -----
  state.heading += yawRate * dt;
  const sinH = Math.sin(state.heading);
  const cosH = Math.cos(state.heading);
  state.x += (sinH * v + cosH * vL) * dt;
  state.z += (cosH * v - sinH * vL) * dt;
  state.speed = v;
  state.vLat = vL;

  // ----- 7. Body lean (visual only) -----
  const aLat = v * yawRate;
  const aLong = (v - oldSpeed) / Math.max(dt, 0.0001);
  const rollTarget = Math.max(-0.12, Math.min(0.12, aLat * 0.014));
  const pitchTarget = Math.max(-0.06, Math.min(0.08, -aLong * 0.006));
  state.roll += (rollTarget - state.roll) * (1 - Math.exp(-3.5 * dt));
  state.pitch += (pitchTarget - state.pitch) * (1 - Math.exp(-5 * dt));
}