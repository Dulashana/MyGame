// Sound for BusPisso: a heavy diesel truck engine, in the style of Euro Truck Simulator.
// Every sound is made live with the browser's Web Audio API, so there are no sound files to download.
// Browsers only allow sound after the player clicks or presses a key, so the sound wakes up on the first one.
//
// Keys handled here:  H = horn (hold),  M = mute / unmute

const VOLUME = 0.7;      // overall loudness (0 to 1)

// Make one sound louder or quieter: 1 = as designed, 0 = off
const MIX = {
  engine: 1,
  turbo: 0,      // turbo whistle and whoosh
  air: 0,        // air-brake and blow-off hiss
  road: 1,
  skid: 1,
  wind: 0,
  traffic: 0,
  horn: 1,
  crash: 1,
};

// ----- Engine and gearbox -----
const IDLE_RPM = 200;
const SHIFT_RPM = 800;    // the rpm you reach at the top of each gear
const MAX_RPM = 1000;
const GEAR_TOPS = [10.1, 14.7,  31,65,85];   // top speed of each gear (m/s). 6 gears
const SHIFT_TIME = 0.3;    // seconds of power cut at each gear change

const HORN_NOTES = [392, 494, 587];       // G, B and D together: a bright three-note air horn
const HEAR_TRAFFIC = 70;                  // how far away (metres) you can hear other vehicles

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let v = null;            // all the continuous voices, built once the browser allows sound
  let muted = false;
  let hornHeld = false;
  let rpm = IDLE_RPM;
  let gear = 0;
  let shiftTimer = 0;
  let boost = 0;           // turbo pressure, 0 to 1
  let lastLoad = 0;
  let blowGap = 0;
  let lastBrake = 0;
  let lastHand = false;
  let sinceUpdate = 0;
  let crashGap = 0;

  try { muted = localStorage.getItem('buspisso_muted') === '1'; } catch { /* ignore */ }

  let vol = VOLUME;
  try {
    const saved = parseFloat(localStorage.getItem('buspisso_volume'));
    if (saved >= 0) vol = Math.min(1, saved);
  } catch { /* ignore */ }

  // ---------- small helpers ----------
  const osc = (type, freq) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start();
    return o;
  };
  const gain = (value, dest) => {
    const g = ctx.createGain();
    g.gain.value = value;
    if (dest) g.connect(dest);
    return g;
  };
  const filter = (type, freq, q = 1) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  };
  // Endless hiss. Each one starts at a different spot so they don't sound identical.
  const hiss = () => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.start(0, Math.random() * 1.5);
    return s;
  };

  // ---------- build all the voices ----------
  function buildVoices() {
    // ENGINE: pulses at the firing rate, with a half-order rumble underneath and a slow "lope" in the volume
    const engFilter = filter('lowpass', 400, 1.4);
    const engAM = gain(0.7);
    const engOut = gain(0, master);
    engFilter.connect(engAM);
    engAM.connect(engOut);
    const saw1 = osc('sawtooth', 32);
    saw1.connect(gain(0.5, engFilter));
    const saw2 = osc('sawtooth', 16);               // half the firing rate: the deep, uneven thump
    saw2.detune.value = 9;
    saw2.connect(gain(0.4, engFilter));
    const sq = osc('square', 64);
    sq.connect(gain(0.08, engFilter));
    const lope = osc('sine', 5.4);                  // one wobble per engine cycle
    const lopeDepth = gain(0.2, engAM.gain);
    lope.connect(lopeDepth);

    // exhaust rumble: low breathing noise that grows under load
    const rumbleF = filter('lowpass', 450);
    const rumbleOut = gain(0, master);
    hiss().connect(rumbleF);
    rumbleF.connect(rumbleOut);

    // diesel clatter: noise switched on and off at the firing rate
    const knockF = filter('bandpass', 1400, 1.2);
    const knockOut = gain(0, master);
    hiss().connect(knockF);
    knockF.connect(knockOut);
    const knockOsc = osc('square', 32);
    const knockDepth = gain(0, knockOut.gain);
    knockOsc.connect(knockDepth);

    // TURBO: a thin whistle and a soft whoosh
    const turbo = osc('sine', 2000);
    const turboOut = gain(0, master);
    turbo.connect(turboOut);
    const whooshF = filter('bandpass', 2400, 0.9);
    const whooshOut = gain(0, master);
    hiss().connect(whooshF);
    whooshF.connect(whooshOut);

    // ROAD: tyre rumble, and a rougher crunch on grass and gravel
    const roadF = filter('lowpass', 400);
    const roadOut = gain(0, master);
    hiss().connect(roadF);
    roadF.connect(roadOut);

    // TYRE SQUEAL: skidding, handbrake turns, hard braking
    const skidF = filter('bandpass', 900, 2.5);
    const skidOut = gain(0, master);
    hiss().connect(skidF);
    skidF.connect(skidOut);

    // WIND
    const windF = filter('bandpass', 500, 0.7);
    const windOut = gain(0, master);
    hiss().connect(windF);
    windF.connect(windOut);

    // PASSING TRAFFIC: one voice that follows the closest vehicle
    const trafF = filter('lowpass', 500, 0.9);
    const trafSaw = osc('sawtooth', 80);
    trafSaw.connect(gain(0.6, trafF));
    const trafSq = osc('square', 40);
    trafSq.connect(gain(0.4, trafF));
    const trafOut = gain(0, master);
    const trafPan = ctx.createStereoPanner();
    trafF.connect(trafOut);
    trafOut.connect(trafPan);
    trafPan.connect(master);

    // HORN: always running, but silent until the key is held
    const hornF = filter('lowpass', 2200);
    const hornOut = gain(0, master);
    hornF.connect(hornOut);
    HORN_NOTES.forEach((f, i) => {
      const o = osc(i === 1 ? 'square' : 'sawtooth', f);
      o.detune.value = (i - 1) * 5;
      o.connect(gain(0.2, hornF));
    });

    return {
      saw1, saw2, sq, lope, lopeDepth, engFilter, engOut,
      rumbleF, rumbleOut, knockOsc, knockDepth, knockOut,
      turbo, turboOut, whooshF, whooshOut,
      roadF, roadOut, skidF, skidOut, windF, windOut,
      trafSaw, trafSq, trafF, trafOut, trafPan, hornOut,
    };
  }

  // ---------- start-up (needs a click or key press first) ----------
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    const compressor = ctx.createDynamicsCompressor();   // stops loud moments from distorting
    master = ctx.createGain();
    master.gain.value = muted ? 0 : vol;
    master.connect(compressor);
    compressor.connect(ctx.destination);

    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    v = buildVoices();
  }

  // ---------- one-shot sounds ----------
  function burst(filterType, freq, peak, dur, q = 0.8) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = filter(filterType, freq, q);
    const g = gain(0, master);
    s.connect(f);
    f.connect(g);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
    s.onended = () => { g.disconnect(); f.disconnect(); };
  }

  function note(freq, at, len, peak = 0.25) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = gain(0, master);
    o.connect(g);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + len);
    o.start(at);
    o.stop(at + len + 0.05);
    o.onended = () => g.disconnect();
  }

  // A hit. strength is the impact speed in m/s that collideBus returns.
  function crash(strength) {
    if (!ctx || !v || crashGap > 0) return;
    crashGap = 0.15;
    const k = clamp(strength / 14, 0.15, 1) * MIX.crash;
    const t = ctx.currentTime;

    burst('lowpass', 500 + k * 900, 0.55 * k, 0.35 + 0.3 * k);   // crunch
    if (k > 0.5) burst('bandpass', 1800, 0.14 * k, 0.2, 4);      // metal clang on hard hits

    const o = ctx.createOscillator();                              // low thump
    o.type = 'sine';
    const g = gain(0, master);
    o.connect(g);
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.3);
    g.gain.setValueAtTime(0.7 * k, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.start(t);
    o.stop(t + 0.45);
    o.onended = () => g.disconnect();
  }

  // Short happy tune when the bus reaches the end
  function finish() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, t + i * 0.13, i === 3 ? 0.7 : 0.25));
  }

  // ---------- mute ----------
  let toast = null;
  let toastTimer = 0;
  function showToast(text) {
    if (!toast) {
      toast = document.createElement('div');
      toast.style.cssText =
        'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);padding:8px 16px;border-radius:6px;' +
        'background:rgba(0,0,0,.7);color:#fff;font:14px system-ui,sans-serif;pointer-events:none;' +
        'transition:opacity .3s;opacity:0;z-index:30';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 1200);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : vol, ctx.currentTime, 0.05);
    try { localStorage.setItem('buspisso_muted', muted ? '1' : '0'); } catch { /* ignore */ }
    showToast(muted ? 'Sound off (M)' : 'Sound on (M)');
  }

  // ---------- every frame ----------
  // o = { active, bus (busState), keys, offRoad, traffic }
  function update(dt, o) {
    if (!ctx || !v) return;
    sinceUpdate += dt;
    if (sinceUpdate < 0.04) return;            // about 25 updates a second is plenty
    const step = sinceUpdate;
    sinceUpdate = 0;
    crashGap = Math.max(0, crashGap - step);
    blowGap = Math.max(0, blowGap - step);
    shiftTimer = Math.max(0, shiftTimer - step);

    const t = ctx.currentTime;
    const live = o.active ? 1 : 0;
    const b = o.bus;
    const keys = o.keys ?? {};
    const speed = Math.abs(b.speed);
    const throttle = clamp(Math.abs(b.throttle), 0, 1);
    const sp = clamp(speed / 31, 0, 1);

    // ----- gearbox: up at the top of a gear, back down well below the bottom of it -----
    while (gear < GEAR_TOPS.length - 1 && speed > GEAR_TOPS[gear]) { gear++; shiftTimer = SHIFT_TIME; }
    while (gear > 0 && speed < GEAR_TOPS[gear - 1] * 0.8) { gear--; shiftTimer = SHIFT_TIME; }
    const shifting = shiftTimer > 0;
    const load = shifting ? 0 : throttle;      // power is cut during a gear change

    // ----- engine speed: climbs in each gear, drops at every shift -----
    let wantRpm = Math.max(IDLE_RPM, (SHIFT_RPM * speed) / GEAR_TOPS[gear]);
    wantRpm = Math.max(wantRpm, IDLE_RPM + throttle * 500);       // revs up a little when pulling away
    const tau = wantRpm > rpm ? 0.22 : 0.14;                      // heavy flywheel: slow to rise, quicker to fall
    rpm += (wantRpm - rpm) * (1 - Math.exp(-step / tau));
    const rpmN = clamp((rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);

    // ----- engine voices -----
    const jitter = 1 + (Math.random() - 0.5) * 0.03 * (1 - rpmN);   // a little shake at idle
    const fire = (rpm / 60) * 3 * jitter;                           // 6-cylinder firing rate: about 32 to 95 Hz
    const tc = 0.05;
    const lump = clamp(0.34 - 0.24 * rpmN - 0.08 * load, 0.08, 0.34);   // lumpy at idle, smoother when revving
    const level = (0.3 + 0.22 * load + 0.08 * rpmN) * (shifting ? 0.65 : 1) * live * MIX.engine;

    v.saw1.frequency.setTargetAtTime(fire, t, tc);
    v.saw2.frequency.setTargetAtTime(fire * 0.5, t, tc);
    v.sq.frequency.setTargetAtTime(fire * 2, t, tc);
    v.lope.frequency.setTargetAtTime(rpm / 120, t, tc);
    v.lopeDepth.gain.setTargetAtTime(0.7 * lump, t, 0.1);
    v.engFilter.frequency.setTargetAtTime(220 + rpmN * 160 + load * 140, t, 0.08);
    v.engOut.gain.setTargetAtTime(level, t, live ? 0.05 : 0.4);

    v.rumbleF.frequency.setTargetAtTime(300 + rpmN * 400, t, 0.1);
    v.rumbleOut.gain.setTargetAtTime((0.1 + 0.22 * load + 0.05 * rpmN) * live * MIX.engine, t, 0.12);

    const knock = 0;   // clatter is loudest at idle
    v.knockOsc.frequency.setTargetAtTime(fire, t, tc);
    v.knockOut.gain.setTargetAtTime(knock, t, 0.1);
    v.knockDepth.gain.setTargetAtTime(knock, t, 0.1);

    // ----- turbo: spools up slowly under load, blows off when you lift or shift -----
    const boostWant = clamp(load * (rpmN * 1.4 - 0.1), 0, 1);
    boost += (boostWant - boost) * (1 - Math.exp(-step / (boostWant > boost ? 0.8 : 0.45)));
    v.turbo.frequency.setTargetAtTime(1600 + boost * 3400, t, 0.1);
    v.turboOut.gain.setTargetAtTime(boost * 0.01 * live * MIX.turbo, t, 0.1);
    v.whooshF.frequency.setTargetAtTime(1800 + boost * 2500, t, 0.1);
    v.whooshOut.gain.setTargetAtTime(boost * 0.035 * live * MIX.turbo, t, 0.1);
    if (live && boost > 0.4 && lastLoad > 0.5 && load < 0.2 && blowGap <= 0) {
      burst('highpass', 2800, 0.16 * MIX.air, 0.4);      // the "pssh"
      blowGap = 0.8;
    }
    lastLoad = load;

    // ----- road rumble (rougher on grass and gravel) -----
    const off = o.offRoad ? 1 : 0;
    const rolling = speed > 0.3 ? 1 : 0;
    v.roadF.frequency.setTargetAtTime(250 + speed * 28 + off * 900, t, 0.1);
    v.roadOut.gain.setTargetAtTime(
      (0.015 + 0.09 * sp + off * 0.16 * Math.min(1, speed / 8)) * rolling * live * MIX.road, t, 0.1
    );

    // ----- tyre squeal: sliding sideways, handbrake, hard braking -----
    const slide = clamp((Math.abs(b.vLat) - 0.8) / 3, 0, 1);
    const handbrake = keys.handbrake && speed > 6 ? 0.5 : 0;
    const hardBrake = b.brake > 0.6 && speed > 10 ? 0.25 : 0;
    const skid = clamp(slide * 0.6 + handbrake + hardBrake, 0, 0.7);
    v.skidF.frequency.setTargetAtTime(700 + speed * 25, t, 0.1);
    v.skidOut.gain.setTargetAtTime(skid * 0.22 * live * MIX.skid, t, 0.08);

    // ----- wind -----
    v.windF.frequency.setTargetAtTime(350 + sp * 700, t, 0.2);
    v.windOut.gain.setTargetAtTime(sp * sp * 0.12 * live * MIX.wind, t, 0.2);

    // ----- air brakes: hiss when you let go of a hard brake, and when the handbrake is set or released at a stop -----
    if (live && lastBrake > 0.5 && b.brake < 0.3 && speed > 2) burst('highpass', 3500, 0.12 * MIX.air, 0.28);
    lastBrake = b.brake;
    const hand = !!keys.handbrake;
    if (live && hand !== lastHand && speed < 3) burst('highpass', 3000, 0.14 * MIX.air, 0.45);
    lastHand = hand;

    // ----- horn -----
    const hornOn = hornHeld && live;
    v.hornOut.gain.setTargetAtTime(hornOn ? 0.35 * MIX.horn : 0, t, hornOn ? 0.02 : 0.06);

    // ----- the closest other vehicle: engine hum, panned left or right, with a pass-by pitch change -----
    let near = null;
    let nearD = HEAR_TRAFFIC;
    if (live && o.traffic) {
      for (const c of o.traffic.vehicles) {
        const d = Math.hypot(c.x - b.x, c.z - b.z);
        if (d < nearD) { nearD = d; near = c; }
      }
    }
    if (near) {
      const dx = near.x - b.x;
      const dz = near.z - b.z;
      const ux = dx / (nearD || 1);
      const uz = dz / (nearD || 1);
      const bvx = Math.sin(b.heading) * b.speed;
      const bvz = Math.cos(b.heading) * b.speed;
      const cvx = Math.sin(near.heading) * near.speed;
      const cvz = Math.cos(near.heading) * near.speed;
      const closing = -((cvx - bvx) * ux + (cvz - bvz) * uz);   // above 0 while getting closer
      const pitch = 1 + clamp(closing, -40, 40) / 120;
      const heavy = near.box.hz > 3;
      const hum = (120 - near.box.hz * 15) * pitch;             // lorries sound deeper than cars
      const closeness = 1 - nearD / HEAR_TRAFFIC;
      const side = dx * Math.cos(b.heading) - dz * Math.sin(b.heading);   // above 0 = on your left
      v.trafSaw.frequency.setTargetAtTime(hum, t, 0.08);
      v.trafSq.frequency.setTargetAtTime(hum * 0.5, t, 0.08);
      v.trafF.frequency.setTargetAtTime(300 + hum * 4, t, 0.08);
      v.trafOut.gain.setTargetAtTime(closeness * closeness * (heavy ? 0.3 : 0.2) * MIX.traffic, t, 0.1);
      v.trafPan.pan.setTargetAtTime(clamp(-side / 25, -1, 1), t, 0.08);
    } else {
      v.trafOut.gain.setTargetAtTime(0, t, 0.15);
    }
  }

  // ---------- keys, first click, and tab switching ----------
  window.addEventListener('pointerdown', init);
  window.addEventListener('keydown', (e) => {
    init();
    if (e.repeat) return;
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'KeyH') hornHeld = true;
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyH') hornHeld = false; });
  window.addEventListener('blur', () => { hornHeld = false; });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });

  return {
    update,
    crash,
    finish,
    toggleMute,
    isMuted: () => muted,
    horn: (on) => { hornHeld = !!on; },   // for touch buttons later
      setVolume: (x) => {
      vol = clamp(x, 0, 1);
      if (master && !muted) master.gain.setTargetAtTime(vol, ctx.currentTime, 0.03);
      try { localStorage.setItem('buspisso_volume', String(vol)); } catch { /* ignore */ }
    },
    getVolume: () => vol,
  };
}