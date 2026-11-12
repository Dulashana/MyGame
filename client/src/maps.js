const baseMaps = [
  {
    name: 'Colombo to Kandy',
    seed: 11,
    skyColor: 0xa8d8ea,
    groundColor: 0x4f9d3a,
    roadColor: 0x3a3a3f,
    leafColor: 0x2d6a4f,
    trunkColor: 0x6b4226,
    roadWidth: 14,
    treeCount: 300,
    treeTypes: ['pine', 'round', 'slim'],   // a mix of tree shapes so it doesn't look repetitive
    traffic: { cars: 27, vans: 14, lorries: 7},
    busStops: [0.5, 0.9],

    // ----- HILLS -----
    // Road height along the route: [how far along (0 = start, 1 = finish), height in metres]
    // Two pairs with the same height make a flat stretch. Different heights make a climb.
    elevation: [
      [0, 0], [0.10, 0],      // flat start
      [0.38, 22],             // first climb
      [0.50, 22],             // flat rest area
      [0.80, 54],             // second climb
      [1, 54],                // flat top, finish
    ],
    hillLeft: 14,    // how high the hillside rises on the driver's left (metres)
    hillRight: 6,    // and on the right (keep this above 3 so there is never a drop)

    // ----- ALONG THE ROAD -----
    // Stretches with rows of shops and houses (same 0-to-1 numbers as `elevation`)
    towns: [
      { from: 0.02, to: 0.095 },   // the town at the start
      { from: 0.395, to: 0.49 },   // the village at the rest area
    ],
    crossings: [0.055, 0.44],      // zebra crossings (keep these in flat stretches)
    walls: [
      { from: 0.13, to: 0.36 },    // stone wall along the hillside, first climb
      { from: 0.53, to: 0.78 },    // and second climb
    ],
    roadside: { poles: true, curveSigns: true, hillSigns: true },

    points: [
      [0, 0], [0, 80], [40, 160], [110, 220], [120, 320], [60, 400],
      [-40, 450], [-120, 540], [-110, 650], [-30, 720], [60, 800],
      [80, 900], [20, 1000], [-60, 1080], [-60, 1200],
    ],
  },
  {
    name: 'Anuradhapura to Kurunegala',
    seed: 22,
    skyColor: 0xbfe6a8,
    groundColor: 0x7bc043,
    roadColor: 0x4a4a4a,
    leafColor: 0x3f9c35,
    trunkColor: 0x8a5a2b,
    roadWidth: 12,
    treeCount: 900,
    traffic: { cars: 25, vans: 11, lorries: 9},
    busStops: [0.17, 0.93],

    // ----- ALONG THE ROAD -----
    towns: [
      { from: 0.01, to: 0.10 },    // village at the start
      { from: 0.24, to: 0.33 },    // small village
      { from: 0.66, to: 0.86 },    // the main village near the end
    ],
    crossings: [0.055, 0.285, 0.76],
    roadside: { poles: true, curveSigns: true },
    points: [
      [0, 0], [0, 100], [30, 200], [100, 260], [200, 280], [300, 340],
      [340, 440], [320, 540], [250, 620], [150, 660], [50, 740],
      [0, 840], [0, 960],
    ],
  },
  {
    name: 'Galle to Mathara',
    seed: 33,
    skyColor: 0x8fd3f4,
    groundColor: 0xe2d29a,
    roadColor: 0x44444a,
    leafColor: 0x2e8b57,
    trunkColor: 0x9c6b3a,
    roadWidth: 14,
    treeCount: 350,
    traffic: { cars: 22, vans: 13, lorries: 8 },
    busStops: [0.3, 0.93],

    // ----- ALONG THE ROAD -----
    towns: [
      { from: 0.09, to: 0.21 },    // fishing village
      { from: 0.77, to: 0.86 },    // town near the end
    ],
    crossings: [0.15, 0.815],
    roadside: { poles: true, curveSigns: true },
    points: [
      [0, 0], [0, 120], [-60, 240], [-80, 380], [-20, 500], [80, 560],
      [200, 560], [300, 620], [340, 740], [300, 860], [200, 940],
      [100, 1020], [100, 1140],
    ],
  },
  {
    name: 'Panadura to kandy',
    seed: 11,
    skyColor: 0xa8d8ea,
    groundColor: 0x4f9d3a,
    roadColor: 0x3a3a3f,
    leafColor: 0x2d6a4f,
    trunkColor: 0x6b4226,
    roadWidth: 14,
    treeCount: 700,
    traffic: { cars: 25, vans: 12, lorries: 10 },
    busStops: [0.3, 0.6, 0.9],

    points: [
      [0, 0], [0, 80], [40, 160], [110, 220], [120, 320], [60, 400],
      [-40, 450], [-120, 540], [-110, 650], [-30, 720], [60, 800],
      [80, 900], [20, 1000], [-60, 1080], [-60, 1200],
    ],
  },
  
];
// ---------- MAP LENGTH ----------
// 1 = original length, 3 = three times longer. Change this one number to adjust.
const LENGTH_SCALE = 3;

export const maps = baseMaps.map((m) => ({
  ...m,
  // stretch the route
  points: m.points.map(([x, z]) => [x * LENGTH_SCALE, z * LENGTH_SCALE]),
  // keep the same density of scenery along a longer road
  treeCount: Math.round(m.treeCount * LENGTH_SCALE),
  houseCount: Math.round((m.houseCount ?? 20) * LENGTH_SCALE),
  // keep the same steepness: a 3x longer climb needs 3x the height
  elevation: m.elevation?.map(([u, h]) => [u, h * LENGTH_SCALE]),
  // more traffic to fill the longer road (only if the map has a traffic line)
  traffic: m.traffic && {
    cars: Math.round((m.traffic.cars ?? 0) * LENGTH_SCALE),
    vans: Math.round((m.traffic.vans ?? 0) * LENGTH_SCALE),
    lorries: Math.round((m.traffic.lorries ?? 0) * LENGTH_SCALE),
  },
}));