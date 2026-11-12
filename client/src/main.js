import * as THREE from 'three';
import { keys } from './controls.js';
import { maps } from './maps.js';
import { createRoad } from './road.js';
import { createScenery, createProps } from './world.js';
import { collideBus } from './collisions.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createBusStands, atFinish } from './busstand.js';
import {
  createBus, createBusState, updateBus, busStyles, spinWheels, getWheelbase, setBrakeLights,
} from './bus.js';
import { createAudio } from './audio.js';
import { createBusStops, setGhost } from './stops.js';
import { setupMultiplayer } from './multiplayer.js';
import { createMenu, createEndScreen, createPauseMenu } from './ui.js';


// ...after the renderer/UI setup



let traffic = null;
let stands = null;
const audio = createAudio();
let offRoad = false;   // true while the bus is on grass or gravel (the sound uses this)
let playerSlot = 0;   // which of the 4 start bays this player uses (0 to 3). Later: set by the server
let multiplayerOn = false;   // true while in a multiplayer room (traffic is switched off)
let frozen = false;          // true during the countdown: the bus can't be driven yet
let mp = null;               // the multiplayer helper, created further down
let busStops = null;
const STOP_PENALTY = 15;   // seconds added for each skipped stop

const stopLabel = document.createElement('div');
stopLabel.style.cssText =
  'position:fixed;left:50%;top:70px;transform:translateX(-50%);color:#ffd60a;font:bold 22px sans-serif;text-shadow:0 2px 4px rgba(0,0,0,0.8);text-align:center';
document.body.appendChild(stopLabel);

// Race timer
const raceLabel = document.createElement('div');
raceLabel.style.cssText =
  'position:fixed;left:50%;top:16px;transform:translateX(-50%);color:#fff;font:bold 26px sans-serif;text-shadow:0 2px 4px rgba(0,0,0,0.8)';
document.body.appendChild(raceLabel);
let raceTime = 0, raceStarted = false, raceFinished = false;
function formatTime(t) {
  return Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0');
}

// ---------- GAME STATE ----------
let gameState = 'menu';        // 'menu' | 'playing' | 'finished'
let stats = newStats();        // numbers collected during a race
let crashCooldown = 0;
let routeLength = 0;           // metres, measured when a map loads
const PAR_SPEED = 20;          // m/s. The "par" pace for scoring

function newStats() { return { topSpeed: 0, crashes: 0 }; }

function measureRoute(r) {
  let len = 0;
  for (let i = 1; i < r.samples.length; i++) {
    len += Math.hypot(r.samples[i].x - r.samples[i - 1].x, r.samples[i].z - r.samples[i - 1].z);
  }
  return len;
}

// Best time per map, saved in the browser
function loadBest() {
  try { return parseFloat(localStorage.getItem('bestTime_' + currentMap.name)) || null; }
  catch { return null; }
}
function saveBest(t) {
  try { localStorage.setItem('bestTime_' + currentMap.name, String(t)); } catch { /* ignore */ }
}

function calcResult() {
  const parTime = routeLength / PAR_SPEED;
  const timeScore = Math.min(12000, Math.round((8000 * parTime) / Math.max(raceTime, 1)));
  const speedBonus = Math.round(stats.topSpeed * 3.6 * 5);     // 5 points per km/h of top speed
  const penalty = stats.crashes * 300;                         // 300 points per crash
  const score = Math.max(0, timeScore + speedBonus - penalty);
  const grade = score >= 11000 ? 'S' : score >= 9500 ? 'A' : score >= 8000 ? 'B' : score >= 6000 ? 'C' : 'D';

  const best = loadBest();
  const newBest = best === null || raceTime < best;
  if (newBest) saveBest(raceTime);

  return {
    mapName: currentMap.name, busName: busStyles[busIndex].name,
    time: raceTime, score, grade, timeScore, speedBonus, penalty,
    topSpeed: stats.topSpeed * 3.6,
    avgSpeed: (routeLength / raceTime) * 3.6,
    crashes: stats.crashes, distance: routeLength,
    bestTime: newBest ? raceTime : best, newBest,
    stopsServed: stats.stopsServed ?? 0, stopsTotal: stats.stopsTotal ?? 0, stopPenalty: stats.stopPenalty ?? 0,
  };
}

// ---------- SHOW ERRORS ON SCREEN (helps with debugging) ----------
const errorBox = document.createElement('pre');
errorBox.style.cssText =
  'position:fixed;left:16px;bottom:16px;max-width:70vw;margin:0;padding:10px;background:rgba(150,0,0,0.85);color:#fff;font:12px monospace;white-space:pre-wrap;display:none;z-index:10';
document.body.appendChild(errorBox);
window.addEventListener('error', (e) => {
  errorBox.style.display = 'block';
  errorBox.textContent = 'ERROR: ' + e.message + '\n' + (e.filename || '') + ':' + (e.lineno || '');
});

// ---------- SCENE ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 80, 420);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 600);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- LIGHTS ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0x4a7c3a, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(50, 100, 30);
scene.add(sun);

// ---------- GROUND ----------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(14000, 14000),
  new THREE.MeshLambertMaterial({ color: 0x5aa02c })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---------- HELPERS ----------
function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  });
}

// ---------- LABELS (small text on screen) ----------
const mapLabel = document.createElement('div');
mapLabel.style.cssText =
  'position:fixed;left:16px;top:44px;color:#fff;font:bold 18px sans-serif;text-shadow:0 1px 3px rgba(0,0,0,0.7)';
document.body.appendChild(mapLabel);

const camLabel = document.createElement('div');
camLabel.style.cssText =
  'position:fixed;left:16px;top:72px;color:#fff;font:14px sans-serif;text-shadow:0 1px 3px rgba(0,0,0,0.7)';
document.body.appendChild(camLabel);

// ---------- BUS ----------
let bus = null;
let busIndex = 0;
const busState = createBusState();

// Hills: how high the bus is, and how much it tilts to match the slope
let busY = 0;
let slopePitch = 0;
let camBaseY = 0;

// Collisions: the solid things on the current map, and the camera shake after a hit
let colliders = null;
let shake = 0;

function setBus(index) {
  if (bus) {
    scene.remove(bus);
    disposeGroup(bus);
  }
  busIndex = index;
  bus = createBus(busStyles[index]);
  bus.rotation.order = 'YXZ';
  scene.add(bus);
  busState.wheelbase = getWheelbase(busStyles[index]);
}
setBus(0); // 0 = Classic, 1 = Public Service, 2 = Coach, 3 = Viking-Style

// ---------- MAP LOADING ----------
let road = null;
let currentMap = null;
let mapIndex = 0;
let mapGroup = null;

const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();

function updateMapLabel() {
  mapLabel.textContent =
    `Map ${mapIndex + 1}: ${currentMap.name}  ·  ${busStyles[busIndex].name}  (Esc = main menu)`;
}

function resetBus() {
    const slot = stands.starts[playerSlot % stands.starts.length];
  Object.assign(busState, createBusState(getWheelbase(busStyles[busIndex])), {
    x: slot.x,
    z: slot.z,
    heading: slot.heading,
  });
  raceTime = 0; raceStarted = false; raceFinished = false;
  stats = newStats(); crashCooldown = 0;
  busStops.reset();
  busY = road.heightAt(busState.x, busState.z);
  slopePitch = 0;
  camBaseY = busY;
  camPos.set(
    busState.x - Math.sin(busState.heading) * 15,
    busY + 6,
    busState.z - Math.cos(busState.heading) * 15
  );
}

function loadMap(index) {
  if (mapGroup) {
    scene.remove(mapGroup);
    disposeGroup(mapGroup);
  }

  mapIndex = index;
  currentMap = maps[index];
  scene.background.set(currentMap.skyColor);
  scene.fog.color.set(currentMap.skyColor);
  ground.material.color.set(currentMap.groundColor);
  hemi.groundColor.set(currentMap.groundColor);

  road = createRoad(currentMap);
  routeLength = measureRoute(road);
  // On hill maps the hills cover the ground, so the flat ground drops out of the way
  ground.position.y = road.hasHills ? -1 : 0;

  stands = createBusStands(currentMap, road);
  busStops = createBusStops(currentMap, road);
  const keepClear = { contains: (x, z, m) => stands.contains(x, z, m) || busStops.contains(x, z, m) };
  const scenery = createScenery(currentMap, road, keepClear);
  traffic = createTraffic(
    multiplayerOn ? { ...currentMap, traffic: { cars: 0, vans: 0, lorries: 0 } } : currentMap,
    road
  );  const solid = scenery.userData.colliders;
  colliders = {
    circles: solid.circles.concat(stands.circles, busStops.circles),
    boxes: solid.boxes.concat(traffic.boxes, stands.boxes, busStops.boxes),
  };

  mapGroup = new THREE.Group();
  mapGroup.add(road.group, scenery, createProps(currentMap, road), traffic.group, stands.group, busStops.group);
  scene.add(mapGroup);

  resetBus();
  updateMapLabel();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (e.repeat) return;

    if (mp.active) {
      mp.leaveToMenu();
    } else if (gameState === 'playing') {
      pauseGame();
    } else if (gameState === 'paused') {
      resumeGame();
    }
    return;
  }

  if (e.code === 'KeyP') {
    if (e.repeat) return;
    if (gameState === 'playing') pauseGame();
    else if (gameState === 'paused') resumeGame();
    return;
  }

  if (gameState !== 'playing') return;
  if (e.code === 'KeyV') toggleCameraMode();
});

loadMap(0);

// ---------- 360 VIEW ----------
let cameraMode = 'follow';   // 'follow' or 'showroom'
let yawOffset = 0;           // how far the camera has been turned around the bus
let camHeight = 6;
let camDistance = 15;
let dragging = false;

document.body.style.userSelect = 'none';
renderer.domElement.style.touchAction = 'none';

renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yawOffset -= e.movementX * 0.006;
  camHeight = Math.min(30, Math.max(1.5, camHeight + e.movementY * 0.05));
});
renderer.domElement.addEventListener('wheel', (e) => {
  if (cameraMode !== 'showroom') return;
  camDistance = Math.min(35, Math.max(8, camDistance + e.deltaY * 0.02));
}, { passive: true });

function updateCamLabel() {
  camLabel.textContent = cameraMode === 'follow'
    ? 'Camera: Follow  (drag mouse to look around · V = showroom 360°)'
    : 'Camera: Showroom 360°  (drag to rotate · scroll to zoom · V = back to driving view)';
}

function toggleCameraMode() {
  cameraMode = cameraMode === 'follow' ? 'showroom' : 'follow';
  // keep the angle within one turn so the camera doesn't spin back many times
  yawOffset = ((yawOffset + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  if (cameraMode === 'showroom') { camDistance = 16; camHeight = 5; }
  updateCamLabel();
}
updateCamLabel();

// ---------- CAMERA FOLLOW ----------
function updateCamera(dt) {
  if (!dragging) {
    if (cameraMode === 'follow') {
      // swing back behind the bus after looking around
      const ease = 1 - Math.exp(-2.5 * dt);
      yawOffset += (0 - yawOffset) * ease;
      camHeight += (6 - camHeight) * ease;
      camDistance += (15 - camDistance) * ease;
    } else {
      yawOffset += 0.25 * dt;   // slow automatic turntable
    }
  }

  const angle = busState.heading + yawOffset;
  const wantedX = busState.x - Math.sin(angle) * camDistance;
  const wantedZ = busState.z - Math.cos(angle) * camDistance;
  const stiffness = (dragging || cameraMode === 'showroom') ? 12 : 4;
  const smooth = 1 - Math.exp(-stiffness * dt);
  camPos.x += (wantedX - camPos.x) * smooth;
  camPos.z += (wantedZ - camPos.z) * smooth;

  // the camera rises and falls with the hill (a little behind the bus, so it feels like climbing)
  camBaseY += (busY - camBaseY) * (1 - Math.exp(-4 * dt));
  camPos.y = camBaseY + camHeight;
  camera.position.copy(camPos);
  if (shake > 0.002) {            // small camera shake after a hit
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake *= Math.exp(-6 * dt);
  }
  camTarget.set(busState.x, busY + 2, busState.z);
  camera.lookAt(camTarget);
}

// ---------- ROAD EDGE RULES ----------
function applyRoadRules(dt) {
  const info = road.nearest(busState.x, busState.z);
  const inYard = stands.contains(busState.x, busState.z, 0);
  offRoad = info.dist > road.half && !inYard;

  if (info.dist > road.half && !inYard) {
    busState.speed *= 1 - 0.6 * dt;
  }

  const wallDistance = road.half + 14;
  if (info.dist > wallDistance && !inYard) {
    const overshoot = info.dist - wallDistance;
    const dirX = (info.x - busState.x) / info.dist;
    const dirZ = (info.z - busState.z) / info.dist;
    busState.x += dirX * overshoot;
    busState.z += dirZ * overshoot;
    busState.speed *= 1 - 3 * dt;
  }
}

// ---------- HILLS: keep the bus on the ground and tilt it with the slope ----------
function placeBusOnHill(dt) {
  const halfBase = (busState.wheelbase || 6) / 2;
  const fx = Math.sin(busState.heading) * halfBase;
  const fz = Math.cos(busState.heading) * halfBase;

  // height under the front and under the back of the bus
  const frontY = road.heightAt(busState.x + fx, busState.z + fz);
  const backY = road.heightAt(busState.x - fx, busState.z - fz);

  busY = (frontY + backY) / 2;
  const wantedPitch = Math.atan2(frontY - backY, halfBase * 2);
  slopePitch += (wantedPitch - slopePitch) * (1 - Math.exp(-10 * dt));
}

// ---------- GAME LOOP ----------
// ---------- MENU & GAME FLOW ----------
function setHud(visible) {
  const d = visible ? '' : 'none';
  mapLabel.style.display = 'none';
  camLabel.style.display = 'none';
  raceLabel.style.display = d;
  stopLabel.style.display = d;
  const speedEl = document.getElementById('speed');
  if (speedEl) speedEl.style.display = d;
}

const menu = createMenu({
  title: 'BUSPISSO',                       // change the game name here
  maps, busStyles,
  onPickMap: (i) => { loadMap(i); menu.select(mapIndex, busIndex); },
  onPickBus: (i) => { setBus(i); updateMapLabel(); menu.select(mapIndex, busIndex); },
  onSingle: () => startRace(),
  onMulti: () => mp.openLobby(),               // we'll connect this when we build multiplayer
});

const endScreen = createEndScreen({
  onRestart: () => { loadMap(mapIndex); startRace(); },   // reloads the map, so traffic starts fresh
  onMenu: () => { loadMap(mapIndex); showMenu(); },
});

mp = setupMultiplayer({
  scene, maps, busStyles, menu,
  loadMap,
  getMapIndex: () => mapIndex,
  getBusIndex: () => busIndex,
  setSlot: (n) => { playerSlot = n; },
  setMultiplayerOn: (on) => { multiplayerOn = on; },
  freeze: (on) => { frozen = on; },
  startRace,
  showMenu,
  goNow: () => { raceStarted = true; raceTime = 0; },       // the timer starts at GO for everyone
  getBus: () => ({
    state: busState, y: busY, object: bus,
    progress: road.nearest(busState.x, busState.z).index / (road.samples.length - 1),
  }),
});

const pauseMenu = createPauseMenu({
  audio,
  onResume: () => resumeGame(),
  onRestart: () => { loadMap(mapIndex); startRace(); },
  onMenu: () => { loadMap(mapIndex); showMenu(); },
});

function pauseGame() {
  if (gameState !== 'playing') return;
  gameState = 'paused';
  pauseMenu.show();
}

function resumeGame() {
  if (gameState !== 'paused') return;
  pauseMenu.hide();
  gameState = 'playing';
}

function showMenu() {
  pauseMenu.hide();
  gameState = 'menu';
  endScreen.hide();
  setHud(false);
  if (cameraMode === 'follow') toggleCameraMode();   // slow turntable around the bus
  menu.select(mapIndex, busIndex);
  menu.show();
}

function startRace() {
  pauseMenu.hide();
  menu.hide();
  endScreen.hide();
  resetBus();
  setHud(true);
  if (cameraMode === 'showroom') toggleCameraMode();
  gameState = 'playing';
}

function finishRace() {
  gameState = 'finished';
  raceFinished = true;

  const missed = busStops.count - busStops.served();
  stats.stopsTotal = busStops.count;
  stats.stopsServed = busStops.served();
  stats.stopPenalty = missed * STOP_PENALTY;
  raceTime += stats.stopPenalty;

  raceLabel.textContent = 'FINISHED  ' + formatTime(raceTime);
  audio.finish();                      // the little finish tune
  if (multiplayerOn) { mp.localFinished(raceTime); return; }   // multiplayer: the server decides the places
  const result = calcResult();
  // let the bus roll to a stop for a moment, then show the results
  setTimeout(() => { if (gameState === 'finished') endScreen.show(result); }, 1800);
}

showMenu();

  // ---------- FULL SCREEN BUTTON ----------
 const ICON_ENTER =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f2eee2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
 const ICON_EXIT =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f2eee2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

 const fsBtn = document.createElement('button');
 fsBtn.type = 'button';
 fsBtn.setAttribute('aria-label', 'Toggle full screen');
 fsBtn.title = 'Full screen (F)';
 fsBtn.innerHTML = ICON_ENTER;
 fsBtn.style.cssText =
  'position:fixed;right:16px;top:16px;z-index:25;width:44px;height:44px;padding:0;border:0;border-radius:8px;' +
  'background:rgba(20,22,26,.65);cursor:pointer;display:grid;place-items:center';
 fsBtn.onmouseenter = () => { fsBtn.style.background = 'rgba(20,22,26,.9)'; };
 fsBtn.onmouseleave = () => { fsBtn.style.background = 'rgba(20,22,26,.65)'; };
 document.body.appendChild(fsBtn);

 async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
      // Lets the game still see the Esc key (for the menu). In full screen you now HOLD Esc to leave.
      try { await navigator.keyboard?.lock(['Escape']); } catch { /* not supported, ignore */ }
    }
  } catch { /* the browser said no, ignore */ }
}

fsBtn.onclick = () => { fsBtn.blur(); toggleFullscreen(); };   // blur: so Space (handbrake) can't press it again

document.addEventListener('fullscreenchange', () => {
  const on = !!document.fullscreenElement;
  fsBtn.innerHTML = on ? ICON_EXIT : ICON_ENTER;
  fsBtn.title = on ? 'Exit full screen (F)' : 'Full screen (F)';
  if (!on) navigator.keyboard?.unlock?.();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && !e.repeat) toggleFullscreen();
});

// ---------- GAME LOOP ----------
const speedDisplay = document.getElementById('speed');
const clock = new THREE.Clock();
const NO_KEYS = {};
const BRAKING_KEYS = { handbrake: true };

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (gameState === 'paused') {
    audio.update(dt, { active: false, bus: busState, keys: NO_KEYS, offRoad, traffic });
    renderer.render(scene, camera);
    return;
  }

    if (gameState === 'playing' && keys.reset && !multiplayerOn) resetBus();

  // Only the player's keys count while racing. In the menu the bus stands still, after the finish it brakes.
  const driveKeys = gameState === 'playing' ? (frozen ? NO_KEYS : keys) : gameState === 'finished' ? BRAKING_KEYS : NO_KEYS;
  updateBus(busState, driveKeys, dt);
  if (gameState === 'finished') busState.speed *= Math.max(0, 1 - 2 * dt);   // roll to a stop inside the yard
  applyRoadRules(dt);
  if (gameState !== 'menu') updateTraffic(traffic, busState, dt);

  // Hit trees, rocks, houses and shops
  const hitStrength = collideBus(busState, colliders, busStyles[busIndex].length, dt);
  if (hitStrength > 1) {
    shake = Math.max(shake, Math.min(0.5, hitStrength * 0.03));
    audio.crash(hitStrength);
  }

  placeBusOnHill(dt);

  bus.position.set(busState.x, busY, busState.z);
  bus.rotation.y = busState.heading;
  bus.rotation.z = busState.roll;
  bus.rotation.x = busState.pitch - slopePitch;   // nose up when climbing
  spinWheels(bus, busState.speed, dt, busState.steer);
  setBrakeLights(bus, driveKeys.back || driveKeys.handbrake || busState.brake > 0.1);

  updateCamera(dt);
  speedDisplay.textContent = Math.round(Math.abs(busState.speed) * 3.6) + ' km/h';

  // ----- Race timer, stats and finish -----
  if (gameState === 'playing') {
    if (!raceStarted && Math.abs(busState.speed) > 0.5) raceStarted = true;
    if (raceStarted) {
      raceTime += dt;
      stats.topSpeed = Math.max(stats.topSpeed, Math.abs(busState.speed));
      if (hitStrength > 3 && crashCooldown <= 0) { stats.crashes++; crashCooldown = 1; }
      if (atFinish(stands, busState)) finishRace();
    }
    if (gameState === 'playing') {
      raceLabel.textContent = raceStarted ? formatTime(raceTime) : 'Ready at the bus stand';
    }
  }
  crashCooldown = Math.max(0, crashCooldown - dt);

  audio.update(dt, {
    active: gameState === 'playing',   // silent in the menu, and fades out after the finish
    bus: busState,
    keys: driveKeys,
    offRoad,
    traffic,
  });

  const stopInfo = busStops.update(busState, busStyles[busIndex].length, dt, gameState === 'playing');
  busState.ghost = stopInfo.ghost;          // multiplayer will use this flag
  setGhost(bus, stopInfo.ghost);
  stopLabel.textContent = gameState === 'playing' ? stopInfo.text : '';
  mp.update(dt);
  renderer.render(scene, camera);
}
animate();