/* ==========================================================================
   Rainy Mood App Engine - Procedural Audio & Canvas Visuals
   ========================================================================== */

// Global State
const state = {
  audioCtx: null,
  masterGain: null,
  analyser: null,
  isPlaying: false,
  activeTheme: 'midnight',
  activePreset: null,
  isMasterMuted: false,
  preMuteVolume: 80,
  
  // Audio Nodes
  sounds: {
    rain: { active: false, volume: 60, type: 'soft', sourceNode: null, gainNode: null, filterNode: null, extraNode: null, extraGainNode: null },
    wind: { active: false, volume: 0, type: 'light', sourceNode: null, gainNode: null, filterNode: null, lfoNode: null, lfoGainNode: null },
    thunder: { active: false, volume: 0, type: 'rare', gainNode: null, timerId: null },
    fire: { active: false, volume: 0, type: 'crackly', roarSourceNode: null, roarGainNode: null, roarFilterNode: null, crackleSourceNode: null, crackleGainNode: null, crackleFilterNode: null, mainGainNode: null },
    waves: { active: false, volume: 0, type: 'slow', sourceNode: null, gainNode: null, filterNode: null, lfoNode: null, lfoGainNode: null, modulatorGainNode: null },
    music: { active: false, volume: 20, type: 'dreamy', gainNode: null, activeOscillators: [], sequencerIntervalId: null, delayNode: null, feedbackNode: null }
  },

  // Audio Buffers (Pre-generated on enter)
  buffers: {
    pinkNoise: null,
    brownNoise: null,
    whiteNoise: null,
    fireCrackle: null
  },

  // Sleep Timer
  timer: {
    duration: 0, // Total duration in seconds
    timeLeft: 0, // Remaining seconds
    intervalId: null,
    isActive: false,
    isFadingOut: false
  },

  // Interactive quotes for the footer
  quotes: [
    "\"Soft rain, restless wind — nature's quietest lullaby.\"",
    "\"Let the downpour rinse the worries of the day away.\"",
    "\"Inside every storm, there's a sheltered corner to call your own.\"",
    "\"As the waves rise and settle, let your breath find its own rhythm.\"",
    "\"A quiet crackle of embers, a steady warmth, easing into sleep.\"",
    "\"Lean into the ambient hum — a quiet clearing for your mind.\""
  ]
};

// --- 1. PROCEDURAL SOUND GENERATORS (BUFFERS) ---

function createPinkNoiseBuffer(ctx, seconds = 8) {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * seconds;
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const output = buffer.getChannelData(0);
  
  // Paul Kellet's refined method for pink noise approximation
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    let white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    output[i] *= 0.11; // compensate gain
    b6 = white * 0.115926;
  }
  return buffer;
}

function createBrownNoiseBuffer(ctx, seconds = 8) {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * seconds;
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const output = buffer.getChannelData(0);
  
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    let white = Math.random() * 2 - 1;
    output[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = output[i];
    output[i] *= 3.5; // boost rumble volume
  }
  return buffer;
}

function createWhiteNoiseBuffer(ctx, seconds = 5) {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * seconds;
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createCampfireCrackleBuffer(ctx, seconds = 4) {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * seconds;
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const output = buffer.getChannelData(0);
  
  // Initialize with zero
  for (let i = 0; i < bufferSize; i++) output[i] = 0;
  
  // Add random cracking wood click impulses (~18 clicks per second)
  const clicks = 18 * seconds;
  for (let c = 0; c < clicks; c++) {
    const pos = Math.floor(Math.random() * bufferSize);
    // Click duration 4ms - 15ms
    const clickSamples = Math.floor((0.004 + Math.random() * 0.011) * sampleRate);
    
    for (let j = 0; j < clickSamples; j++) {
      if (pos + j >= bufferSize) break;
      const t = j / clickSamples;
      const decay = Math.exp(-t * 8); // fast decay
      const noise = Math.random() * 2 - 1;
      output[pos + j] += noise * decay * (0.2 + Math.random() * 0.8);
    }
  }
  
  // Normalize
  let max = 0;
  for (let i = 0; i < bufferSize; i++) {
    if (Math.abs(output[i]) > max) max = Math.abs(output[i]);
  }
  if (max > 0) {
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (output[i] / max) * 0.85;
    }
  }
  return buffer;
}

// --- 2. AUDIO SYNTH NODE MANAGEMENT ---

function initAudioEngine() {
  if (state.audioCtx) return;

  // Real-audio engine (audio.js) has taken over — skip procedural synth.
  if (window.USE_REAL_AUDIO) return;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  state.audioCtx = new AudioContext();

  // Create Master Volume Control & Analyser
  state.masterGain = state.audioCtx.createGain();
  
  // Read starting master slider value
  const masterVal = parseFloat(document.getElementById('masterVolumeSlider').value) / 100;
  state.masterGain.gain.setValueAtTime(state.isPlaying ? masterVal : 0, state.audioCtx.currentTime);

  state.analyser = state.audioCtx.createAnalyser();
  state.analyser.fftSize = 256;

  // Connections
  state.masterGain.connect(state.analyser);
  state.analyser.connect(state.audioCtx.destination);

  // Generate Reusable Buffers
  state.buffers.pinkNoise = createPinkNoiseBuffer(state.audioCtx);
  state.buffers.brownNoise = createBrownNoiseBuffer(state.audioCtx);
  state.buffers.whiteNoise = createWhiteNoiseBuffer(state.audioCtx);
  state.buffers.fireCrackle = createCampfireCrackleBuffer(state.audioCtx);

  // Initialize Individual Synths
  setupRainSynth();
  setupWindSynth();
  setupThunderSynth();
  setupFireSynth();
  setupWavesSynth();
  setupMusicSynth();

  // Load Initial sound configurations
  applySoundLevels();
}

// Smooth gain change utility using setTargetAtTime to avoid pops
function rampGain(gainNode, targetVal, timeConstant = 0.15) {
  if (!gainNode || !state.audioCtx) return;
  gainNode.gain.setTargetAtTime(targetVal, state.audioCtx.currentTime, timeConstant);
}

// RAIN SYNTH
function setupRainSynth() {
  const ctx = state.audioCtx;
  const cfg = state.sounds.rain;

  // Main Rain Loop (Pink Noise)
  cfg.sourceNode = ctx.createBufferSource();
  cfg.sourceNode.buffer = state.buffers.pinkNoise;
  cfg.sourceNode.loop = true;

  cfg.filterNode = ctx.createBiquadFilter();
  cfg.filterNode.type = 'lowpass';
  cfg.filterNode.frequency.value = 1000;

  cfg.gainNode = ctx.createGain();
  cfg.gainNode.gain.setValueAtTime(0, ctx.currentTime);

  // Secondary highpass splatter rain loop (White Noise)
  cfg.extraNode = ctx.createBufferSource();
  cfg.extraNode.buffer = state.buffers.whiteNoise;
  cfg.extraNode.loop = true;

  cfg.extraGainNode = ctx.createGain();
  cfg.extraGainNode.gain.setValueAtTime(0, ctx.currentTime);

  // Connections
  cfg.sourceNode.connect(cfg.filterNode);
  cfg.filterNode.connect(cfg.gainNode);
  cfg.gainNode.connect(state.masterGain);

  cfg.extraNode.connect(cfg.extraGainNode);
  cfg.extraGainNode.connect(state.masterGain);

  cfg.sourceNode.start(0);
  cfg.extraNode.start(0);
}

function updateRainSynth() {
  const cfg = state.sounds.rain;
  if (!state.audioCtx) return;

  const isMuted = document.querySelector('[data-sound="rain"]')?.classList.contains('muted') ?? false;
  const targetVolume = (cfg.active && !isMuted) ? (cfg.volume / 100) : 0;

  // Update Lowpass and Splatter depending on mode
  if (cfg.type === 'soft') {
    cfg.filterNode.frequency.setTargetAtTime(750, state.audioCtx.currentTime, 0.5);
    rampGain(cfg.gainNode, targetVolume * 0.9);
    rampGain(cfg.extraGainNode, 0); // No high splatter
  } else if (cfg.type === 'medium') {
    cfg.filterNode.frequency.setTargetAtTime(1100, state.audioCtx.currentTime, 0.5);
    rampGain(cfg.gainNode, targetVolume * 0.8);
    rampGain(cfg.extraGainNode, targetVolume * 0.05); // Subtle splatter
  } else if (cfg.type === 'heavy') {
    cfg.filterNode.frequency.setTargetAtTime(1600, state.audioCtx.currentTime, 0.5);
    rampGain(cfg.gainNode, targetVolume * 0.75);
    rampGain(cfg.extraGainNode, targetVolume * 0.18); // Crisp splash clicks
  }

  // Update DOM card active state
  const card = document.getElementById('card-rain');
  if (cfg.active && cfg.volume > 0 && !isMuted) card?.classList.add('mixer-card-active');
  else card?.classList.remove('mixer-card-active');
}

// WIND SYNTH
function setupWindSynth() {
  const ctx = state.audioCtx;
  const cfg = state.sounds.wind;

  cfg.sourceNode = ctx.createBufferSource();
  cfg.sourceNode.buffer = state.buffers.pinkNoise;
  cfg.sourceNode.loop = true;

  cfg.filterNode = ctx.createBiquadFilter();
  cfg.filterNode.type = 'bandpass';
  cfg.filterNode.Q.value = 2.5;
  cfg.filterNode.frequency.value = 500;

  cfg.lfoNode = ctx.createOscillator();
  cfg.lfoNode.type = 'triangle';
  cfg.lfoNode.frequency.value = 0.06;

  cfg.lfoGainNode = ctx.createGain();
  cfg.lfoGainNode.gain.value = 250;

  cfg.gainNode = ctx.createGain();
  cfg.gainNode.gain.setValueAtTime(0, ctx.currentTime);

  // Connections
  cfg.lfoNode.connect(cfg.lfoGainNode);
  cfg.lfoGainNode.connect(cfg.filterNode.frequency);

  cfg.sourceNode.connect(cfg.filterNode);
  cfg.filterNode.connect(cfg.gainNode);
  cfg.gainNode.connect(state.masterGain);

  cfg.sourceNode.start(0);
  cfg.lfoNode.start(0);
}

function updateWindSynth() {
  const cfg = state.sounds.wind;
  if (!state.audioCtx) return;

  const isMuted = document.querySelector('[data-sound="wind"]')?.classList.contains('muted') ?? false;
  const targetVolume = (cfg.active && !isMuted) ? (cfg.volume / 100) : 0;

  rampGain(cfg.gainNode, targetVolume * 0.85);

  if (cfg.type === 'light') {
    cfg.lfoNode.frequency.setTargetAtTime(0.04, state.audioCtx.currentTime, 1);
    cfg.lfoGainNode.gain.setTargetAtTime(150, state.audioCtx.currentTime, 1);
    cfg.filterNode.Q.setTargetAtTime(1.8, state.audioCtx.currentTime, 1);
  } else if (cfg.type === 'howling') {
    cfg.lfoNode.frequency.setTargetAtTime(0.11, state.audioCtx.currentTime, 1);
    cfg.lfoGainNode.gain.setTargetAtTime(380, state.audioCtx.currentTime, 1);
    cfg.filterNode.Q.setTargetAtTime(3.2, state.audioCtx.currentTime, 1);
  }

  const card = document.getElementById('card-wind');
  if (cfg.active && cfg.volume > 0 && !isMuted) card?.classList.add('mixer-card-active');
  else card?.classList.remove('mixer-card-active');
}

// THUNDER SYNTH
function setupThunderSynth() {
  const ctx = state.audioCtx;
  const cfg = state.sounds.thunder;

  cfg.gainNode = ctx.createGain();
  cfg.gainNode.gain.setValueAtTime(0, ctx.currentTime);
  cfg.gainNode.connect(state.masterGain);
}

function triggerThunderStrike() {
  if (!state.audioCtx || !state.sounds.thunder.active) return;
  
  const ctx = state.audioCtx;
  const cfg = state.sounds.thunder;
  const isMuted = document.querySelector('[data-sound="thunder"]')?.classList.contains('muted') ?? false;
  if (isMuted || cfg.volume === 0) return;

  // Flash UI screen slightly if screen sleep mode is NOT active
  const card = document.getElementById('card-thunder');
  if (card && document.getElementById('dimOverlay').classList.contains('hidden')) {
    card.style.borderColor = 'rgba(255, 255, 255, 0.4)';
    card.style.boxShadow = '0 0 20px rgba(255, 255, 255, 0.15)';
    setTimeout(() => {
      card.style.borderColor = '';
      card.style.boxShadow = '';
    }, 450);
  }

  const source = ctx.createBufferSource();
  source.buffer = state.buffers.brownNoise;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(160, ctx.currentTime);

  const strikeGain = ctx.createGain();
  strikeGain.gain.setValueAtTime(0, ctx.currentTime);

  // Connections
  source.connect(lowpass);
  lowpass.connect(strikeGain);
  strikeGain.connect(cfg.gainNode);

  const masterVolumeScale = cfg.volume / 100;
  const peakVolume = (0.4 + Math.random() * 0.6) * masterVolumeScale;
  const duration = 5.5 + Math.random() * 4.0;

  strikeGain.gain.setValueAtTime(0, ctx.currentTime);
  strikeGain.gain.linearRampToValueAtTime(peakVolume, ctx.currentTime + 0.15);
  strikeGain.gain.setTargetAtTime(peakVolume * 0.45, ctx.currentTime + 0.35, 0.45);
  strikeGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  lowpass.frequency.setValueAtTime(160, ctx.currentTime);
  lowpass.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + duration);

  source.start(0);
  source.stop(ctx.currentTime + duration + 0.5);
}

function updateThunderSynth() {
  const cfg = state.sounds.thunder;
  if (!state.audioCtx) return;

  if (cfg.timerId) {
    clearInterval(cfg.timerId);
    cfg.timerId = null;
  }

  const isMuted = document.querySelector('[data-sound="thunder"]')?.classList.contains('muted') ?? false;
  const targetVolume = (cfg.active && !isMuted) ? (cfg.volume / 100) : 0;
  
  cfg.gainNode.gain.setValueAtTime(targetVolume * 1.5, state.audioCtx.currentTime);

  if (cfg.active && cfg.volume > 0 && !isMuted) {
    document.getElementById('card-thunder')?.classList.add('mixer-card-active');
    
    let intervalTime = 30000;
    if (cfg.type === 'rare') {
      intervalTime = 35000 + Math.random() * 25000;
    } else if (cfg.type === 'frequent') {
      intervalTime = 12000 + Math.random() * 12000;
    }

    cfg.timerId = setInterval(() => {
      if (Math.random() > 0.3) {
        triggerThunderStrike();
      }
    }, intervalTime);
  } else {
    document.getElementById('card-thunder')?.classList.remove('mixer-card-active');
  }
}

// CAMPFIRE SYNTH
function setupFireSynth() {
  const ctx = state.audioCtx;
  const cfg = state.sounds.fire;

  cfg.roarSourceNode = ctx.createBufferSource();
  cfg.roarSourceNode.buffer = state.buffers.pinkNoise;
  cfg.roarSourceNode.loop = true;

  cfg.roarFilterNode = ctx.createBiquadFilter();
  cfg.roarFilterNode.type = 'lowpass';
  cfg.roarFilterNode.frequency.value = 110;

  cfg.roarGainNode = ctx.createGain();
  cfg.roarGainNode.gain.setValueAtTime(0, ctx.currentTime);

  cfg.crackleSourceNode = ctx.createBufferSource();
  cfg.crackleSourceNode.buffer = state.buffers.fireCrackle;
  cfg.crackleSourceNode.loop = true;

  cfg.crackleFilterNode = ctx.createBiquadFilter();
  cfg.crackleFilterNode.type = 'highpass';
  cfg.crackleFilterNode.frequency.value = 1800;

  cfg.crackleGainNode = ctx.createGain();
  cfg.crackleGainNode.gain.setValueAtTime(0, ctx.currentTime);

  cfg.mainGainNode = ctx.createGain();
  cfg.mainGainNode.gain.setValueAtTime(0, ctx.currentTime);

  // Assemble
  cfg.roarSourceNode.connect(cfg.roarFilterNode);
  cfg.roarFilterNode.connect(cfg.roarGainNode);
  cfg.roarGainNode.connect(cfg.mainGainNode);

  cfg.crackleSourceNode.connect(cfg.crackleFilterNode);
  cfg.crackleFilterNode.connect(cfg.crackleGainNode);
  cfg.crackleGainNode.connect(cfg.mainGainNode);

  cfg.mainGainNode.connect(state.masterGain);

  cfg.roarSourceNode.start(0);
  cfg.crackleSourceNode.start(0);
}

function updateFireSynth() {
  const cfg = state.sounds.fire;
  if (!state.audioCtx) return;

  const isMuted = document.querySelector('[data-sound="fire"]')?.classList.contains('muted') ?? false;
  const targetVolume = (cfg.active && !isMuted) ? (cfg.volume / 100) : 0;

  rampGain(cfg.mainGainNode, targetVolume);

  if (cfg.type === 'crackly') {
    rampGain(cfg.roarGainNode, 0.45);
    rampGain(cfg.crackleGainNode, 0.70);
  } else if (cfg.type === 'roaring') {
    rampGain(cfg.roarGainNode, 0.85);
    rampGain(cfg.crackleGainNode, 0.30);
  }

  const card = document.getElementById('card-fire');
  if (cfg.active && cfg.volume > 0 && !isMuted) card?.classList.add('mixer-card-active');
  else card?.classList.remove('mixer-card-active');
}

// OCEAN WAVES SYNTH
function setupWavesSynth() {
  const ctx = state.audioCtx;
  const cfg = state.sounds.waves;

  cfg.sourceNode = ctx.createBufferSource();
  cfg.sourceNode.buffer = state.buffers.pinkNoise;
  cfg.sourceNode.loop = true;

  cfg.filterNode = ctx.createBiquadFilter();
  cfg.filterNode.type = 'lowpass';
  cfg.filterNode.frequency.value = 350;

  cfg.lfoNode = ctx.createOscillator();
  cfg.lfoNode.type = 'sine';
  cfg.lfoNode.frequency.value = 0.09;

  cfg.lfoGainNode = ctx.createGain();
  cfg.lfoGainNode.gain.value = 0.38;

  cfg.modulatorGainNode = ctx.createGain();
  cfg.modulatorGainNode.gain.setValueAtTime(0.5, ctx.currentTime);

  cfg.gainNode = ctx.createGain();
  cfg.gainNode.gain.setValueAtTime(0, ctx.currentTime);

  // Connections
  cfg.lfoNode.connect(cfg.lfoGainNode);
  cfg.lfoGainNode.connect(cfg.modulatorGainNode.gain);

  cfg.sourceNode.connect(cfg.filterNode);
  cfg.filterNode.connect(cfg.modulatorGainNode);
  cfg.modulatorGainNode.connect(cfg.gainNode);
  cfg.gainNode.connect(state.masterGain);

  cfg.sourceNode.start(0);
  cfg.lfoNode.start(0);
}

function updateWavesSynth() {
  const cfg = state.sounds.waves;
  if (!state.audioCtx) return;

  const isMuted = document.querySelector('[data-sound="waves"]')?.classList.contains('muted') ?? false;
  const targetVolume = (cfg.active && !isMuted) ? (cfg.volume / 100) : 0;

  rampGain(cfg.gainNode, targetVolume * 1.3);

  if (cfg.type === 'slow') {
    cfg.lfoNode.frequency.setTargetAtTime(0.07, state.audioCtx.currentTime, 1);
    cfg.lfoGainNode.gain.setTargetAtTime(0.42, state.audioCtx.currentTime, 1);
    cfg.filterNode.frequency.setTargetAtTime(320, state.audioCtx.currentTime, 1);
  } else if (cfg.type === 'normal') {
    cfg.lfoNode.frequency.setTargetAtTime(0.13, state.audioCtx.currentTime, 1);
    cfg.lfoGainNode.gain.setTargetAtTime(0.35, state.audioCtx.currentTime, 1);
    cfg.filterNode.frequency.setTargetAtTime(450, state.audioCtx.currentTime, 1);
  }

  const card = document.getElementById('card-waves');
  if (cfg.active && cfg.volume > 0 && !isMuted) card?.classList.add('mixer-card-active');
  else card?.classList.remove('mixer-card-active');
}

// GENERATIVE AMBIENT MUSIC SYNTH
function setupMusicSynth() {
  const ctx = state.audioCtx;
  const cfg = state.sounds.music;

  cfg.gainNode = ctx.createGain();
  cfg.gainNode.gain.setValueAtTime(0, ctx.currentTime);
  
  cfg.delayNode = ctx.createDelay(1.5);
  cfg.delayNode.delayTime.value = 0.65;
  
  cfg.feedbackNode = ctx.createGain();
  cfg.feedbackNode.gain.value = 0.40;

  cfg.delayNode.connect(cfg.feedbackNode);
  cfg.feedbackNode.connect(cfg.delayNode);

  cfg.gainNode.connect(state.masterGain);
  cfg.gainNode.connect(cfg.delayNode);
  cfg.delayNode.connect(state.masterGain);

  startMusicSequencer();
}

function playChord(frequencies, type = 'dreamy') {
  const ctx = state.audioCtx;
  const cfg = state.sounds.music;
  if (!ctx || !cfg.active) return;

  const isMuted = document.querySelector('[data-sound="music"]')?.classList.contains('muted') ?? false;
  if (isMuted || cfg.volume === 0) return;

  const now = ctx.currentTime;
  const noteDuration = type === 'dreamy' ? 9.5 : 7.0;
  const attack = type === 'dreamy' ? 3.5 : 2.5;
  const release = type === 'dreamy' ? 4.5 : 3.0;

  const currentOscGroup = [];

  frequencies.forEach(freq => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    const detuneOsc = ctx.createOscillator();
    detuneOsc.type = 'triangle';
    detuneOsc.frequency.setValueAtTime(freq + (Math.random() * 1.6 - 0.8), now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'dreamy' ? 340 : 450, now);

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0, now);
    noteGain.gain.linearRampToValueAtTime(0.045, now + attack); 
    noteGain.gain.setValueAtTime(0.045, now + noteDuration - release);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + noteDuration);

    osc.connect(filter);
    detuneOsc.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(cfg.gainNode);

    osc.start(now);
    detuneOsc.start(now);

    osc.stop(now + noteDuration);
    detuneOsc.stop(now + noteDuration);

    currentOscGroup.push(osc, detuneOsc);
  });

  cfg.activeOscillators.push(...currentOscGroup);
  
  setTimeout(() => {
    cfg.activeOscillators = cfg.activeOscillators.filter(item => !currentOscGroup.includes(item));
  }, (noteDuration + 1) * 1000);
}

function triggerZenBell() {
  const ctx = state.audioCtx;
  const cfg = state.sounds.music;
  if (!ctx || !cfg.active) return;

  const isMuted = document.querySelector('[data-sound="music"]')?.classList.contains('muted') ?? false;
  if (isMuted || cfg.volume === 0) return;

  const now = ctx.currentTime;
  const pentatonicScale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
  const baseFreq = pentatonicScale[Math.floor(Math.random() * pentatonicScale.length)];

  const bellRatios = [1.0, 2.0, 3.0, 4.2, 5.4, 6.8];
  const bellGains = [0.35, 0.15, 0.08, 0.04, 0.02, 0.01];

  const group = [];
  const bellGainNode = ctx.createGain();
  bellGainNode.gain.setValueAtTime(0, now);
  bellGainNode.gain.linearRampToValueAtTime(0.12, now + 0.01);
  bellGainNode.gain.setTargetAtTime(0.001, now + 0.05, 1.8);

  bellGainNode.connect(cfg.gainNode);

  bellRatios.forEach((ratio, index) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * ratio, now);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(bellGains[index], now);

    osc.connect(oscGain);
    oscGain.connect(bellGainNode);

    osc.start(now);
    osc.stop(now + 8);
    group.push(osc);
  });

  cfg.activeOscillators.push(...group);
  setTimeout(() => {
    cfg.activeOscillators = cfg.activeOscillators.filter(item => !group.includes(item));
  }, 9000);
}

function startMusicSequencer() {
  const cfg = state.sounds.music;
  
  const chordBook = [
    [130.81, 164.81, 196.00, 246.94, 293.66], // Cmaj9
    [174.61, 220.00, 261.63, 329.63, 392.00], // Fmaj9
    [110.00, 146.83, 196.00, 246.94, 329.63], // A7sus4
    [146.83, 174.61, 220.00, 261.63, 349.23]  // Dm9
  ];

  let chordIndex = 0;
  let counter = 0;

  cfg.sequencerIntervalId = setInterval(() => {
    if (!state.isPlaying || !cfg.active) return;

    if (cfg.type === 'dreamy') {
      if (counter % 8 === 0) {
        playChord(chordBook[chordIndex], 'dreamy');
        chordIndex = (chordIndex + 1) % chordBook.length;
      }
    } else if (cfg.type === 'zen') {
      if (counter % 6 === 0 && Math.random() > 0.35) {
        triggerZenBell();
      }
    }

    counter++;
  }, 1000);
}

function updateMusicSynth() {
  const cfg = state.sounds.music;
  if (!state.audioCtx) return;

  const isMuted = document.querySelector('[data-sound="music"]')?.classList.contains('muted') ?? false;
  const targetVolume = (cfg.active && !isMuted) ? (cfg.volume / 100) : 0;

  rampGain(cfg.gainNode, targetVolume * 1.5);

  if (!cfg.active || cfg.volume === 0 || isMuted) {
    cfg.activeOscillators.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    cfg.activeOscillators = [];
  }

  const card = document.getElementById('card-music');
  if (cfg.active && cfg.volume > 0 && !isMuted) card?.classList.add('mixer-card-active');
  else card?.classList.remove('mixer-card-active');
}

function applySoundLevels() {
  if (window.USE_REAL_AUDIO) return; // audio.js handles channel volumes
  Object.keys(state.sounds).forEach(key => {
    const config = state.sounds[key];
    const slider = document.getElementById(`slider-${key}`);
    if (slider) {
      config.volume = parseFloat(slider.value);
      config.active = config.volume > 0;
    }
  });

  updateRainSynth();
  updateWindSynth();
  updateThunderSynth();
  updateFireSynth();
  updateWavesSynth();
  updateMusicSynth();
}


// --- 3. CANVAS RAINDROP ANIMATION (WINDOW SIMULATOR) ---

let rainAnimationId = null;

function setupRainCanvas() {
  const canvas = document.getElementById('rainCanvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  const fallingDrops = [];
  const staticDrops = [];

  class FallingDrop {
    constructor() {
      this.reset();
      this.y = Math.random() * canvas.height;
    }

    reset() {
      this.x = Math.random() * canvas.width;
      this.y = -20;
      this.speed = 15 + Math.random() * 12;
      this.len = 10 + Math.random() * 15;
      this.opacity = 0.08 + Math.random() * 0.15;
    }

    update() {
      const windSpeed = state.sounds.wind.active ? (state.sounds.wind.volume / 100) * 12 : 2;
      this.x += windSpeed * 0.4;
      this.y += this.speed;

      if (this.y > canvas.height || this.x > canvas.width) {
        this.reset();
      }
    }

    draw() {
      ctx.beginPath();
      const windSpeed = state.sounds.wind.active ? (state.sounds.wind.volume / 100) * 12 : 2;
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + windSpeed * 0.1, this.y + this.len);
      ctx.strokeStyle = `rgba(174, 217, 224, ${this.opacity})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  class StaticDrop {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.r = 1.5 + Math.random() * 2;
      this.speedY = 0;
      this.trail = [];
      this.opacity = 0.15 + Math.random() * 0.3;
      this.humidityCollectionRate = 0.001 + Math.random() * 0.002;
    }

    update() {
      if (state.sounds.rain.active && state.sounds.rain.volume > 0) {
        this.r += this.humidityCollectionRate * (state.sounds.rain.volume / 60);
      }

      if (this.r > 5.5 && this.speedY === 0) {
        this.speedY = 0.5 + Math.random() * 1.5;
      }

      if (this.speedY > 0) {
        this.y += this.speedY;
        this.speedY += 0.03;
        
        if (Math.random() > 0.4) {
          this.trail.push({ x: this.x, y: this.y, r: this.r * 0.35, opacity: this.opacity * 0.7 });
          if (this.trail.length > 15) this.trail.shift();
        }

        staticDrops.forEach(other => {
          if (other !== this && other.speedY === 0) {
            const dist = Math.hypot(other.x - this.x, other.y - this.y);
            if (dist < this.r + other.r) {
              this.r += other.r * 0.4;
              other.r = 0;
              this.speedY += 0.2;
            }
          }
        });
      }

      if (this.y > canvas.height || this.r === 0) {
        this.x = Math.random() * canvas.width;
        this.y = -10;
        this.r = 1.0 + Math.random() * 2.5;
        this.speedY = 0;
        this.trail = [];
      }
    }

    draw() {
      if (this.r <= 0) return;

      this.trail.forEach(t => {
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${t.opacity})`;
        ctx.fill();
      });

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity * 0.5})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(this.x + this.r * 0.1, this.y + this.r * 0.1, this.r * 0.95, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 0, 0, ${this.opacity * 0.55})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(this.x - this.r * 0.35, this.y - this.r * 0.35, this.r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity * 1.8})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < 90; i++) fallingDrops.push(new FallingDrop());
  for (let i = 0; i < 75; i++) staticDrops.push(new StaticDrop());

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const rainLevel = state.sounds.rain.active ? state.sounds.rain.volume : 0;
    const activeFallingCount = Math.floor((rainLevel / 100) * 110);
    const activeStaticCount = Math.floor((rainLevel / 100) * 70) + 15;

    for (let i = 0; i < activeFallingCount; i++) {
      fallingDrops[i].update();
      fallingDrops[i].draw();
    }

    for (let i = 0; i < activeStaticCount; i++) {
      if (staticDrops[i]) {
        staticDrops[i].update();
        staticDrops[i].draw();
      }
    }

    rainAnimationId = requestAnimationFrame(loop);
  }

  if (rainAnimationId) cancelAnimationFrame(rainAnimationId);
  loop();
}


// --- 4. AUDIO WAVE VISUALIZER ---

let visualizerId = null;

function setupVisualizer() {
  const canvas = document.getElementById('visualizerCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  const bufferLength = state.analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    visualizerId = requestAnimationFrame(draw);
    if (!state.isPlaying) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    state.analyser.getByteTimeDomainData(dataArray);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    
    const rootStyle = getComputedStyle(document.documentElement);
    const activeColor = rootStyle.getPropertyValue('--visualizer-color').trim() || 'rgba(255, 255, 255, 0.6)';
    
    ctx.strokeStyle = activeColor;

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }

  if (visualizerId) cancelAnimationFrame(visualizerId);
  draw();
}


// --- 5. TIMER CONTROLS & ACTIONS ---

function startSleepTimer(minutes) {
  stopSleepTimer();

  state.timer.duration = minutes * 60;
  state.timer.timeLeft = state.timer.duration;
  state.timer.isActive = true;
  state.timer.isFadingOut = false;

  updateTimerUI();

  const toggleBtn = document.getElementById('timerToggle');
  if (toggleBtn) toggleBtn.innerText = "Stop";
  document.getElementById('timerCancel').classList.remove('hidden');

  state.timer.intervalId = setInterval(() => {
    if (!state.isPlaying) return;
    
    state.timer.timeLeft--;

    if (state.timer.timeLeft <= 15 && state.timer.timeLeft > 0 && !state.timer.isFadingOut) {
      state.timer.isFadingOut = true;
      state.masterGain.gain.setValueAtTime(state.masterGain.gain.value, state.audioCtx.currentTime);
      state.masterGain.gain.exponentialRampToValueAtTime(0.0001, state.audioCtx.currentTime + state.timer.timeLeft);
    }

    if (state.timer.timeLeft <= 0) {
      stopSleepTimer();
      pauseEngine();
      setTimeout(() => {
        // Restore volume logic on next boot
        const masterVal = parseFloat(document.getElementById('masterVolumeSlider').value) / 100;
        if (state.masterGain) state.masterGain.gain.setValueAtTime(masterVal, state.audioCtx.currentTime);
      }, 500);
    } else {
      updateTimerUI();
    }
  }, 1000);
}

function stopSleepTimer() {
  if (state.timer.intervalId) {
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
  }
  
  state.timer.isActive = false;
  state.timer.isFadingOut = false;
  state.timer.timeLeft = 0;

  document.getElementById('timerText').innerText = "Off";
  const toggleBtn = document.getElementById('timerToggle');
  if (toggleBtn) toggleBtn.innerText = "Set";
  document.getElementById('timerCancel').classList.add('hidden');
  document.getElementById('timerProgress').style.strokeDashoffset = 277;

  document.querySelectorAll('.timer-preset-btn').forEach(btn => btn.classList.remove('active'));
}

function updateTimerUI() {
  const m = Math.floor(state.timer.timeLeft / 60);
  const s = state.timer.timeLeft % 60;
  
  const displayMin = m < 10 ? '0' + m : m;
  const displaySec = s < 10 ? '0' + s : s;
  
  document.getElementById('timerText').innerText = `${displayMin}:${displaySec}`;

  const progressPercent = state.timer.timeLeft / state.timer.duration;
  const offset = 277 * (1 - progressPercent);
  document.getElementById('timerProgress').style.strokeDashoffset = offset;
}


// --- 6. PRESET SOUNDSCAPES LIBRARY ---

const presets = {
  'cozy-cabin': {
    rain: { volume: 55, type: 'soft' },
    wind: { volume: 20, type: 'light' },
    thunder: { volume: 0, type: 'rare' },
    fire: { volume: 75, type: 'crackly' },
    waves: { volume: 0, type: 'slow' },
    music: { volume: 0, type: 'dreamy' }
  },
  'heavy-storm': {
    rain: { volume: 85, type: 'heavy' },
    wind: { volume: 60, type: 'howling' },
    thunder: { volume: 70, type: 'frequent' },
    fire: { volume: 0, type: 'crackly' },
    waves: { volume: 0, type: 'slow' },
    music: { volume: 0, type: 'dreamy' }
  },
  'ocean-breeze': {
    rain: { volume: 0, type: 'soft' },
    wind: { volume: 25, type: 'light' },
    thunder: { volume: 0, type: 'rare' },
    fire: { volume: 0, type: 'crackly' },
    waves: { volume: 80, type: 'slow' },
    music: { volume: 30, type: 'dreamy' }
  },
  'zen-garden': {
    rain: { volume: 30, type: 'soft' },
    wind: { volume: 15, type: 'light' },
    thunder: { volume: 0, type: 'rare' },
    fire: { volume: 0, type: 'crackly' },
    waves: { volume: 0, type: 'slow' },
    music: { volume: 55, type: 'zen' }
  },
  'campfire-night': {
    rain: { volume: 0, type: 'soft' },
    wind: { volume: 20, type: 'light' },
    thunder: { volume: 0, type: 'rare' },
    fire: { volume: 85, type: 'crackly' },
    waves: { volume: 0, type: 'slow' },
    music: { volume: 20, type: 'dreamy' }
  },
  'pure-rain': {
    rain: { volume: 80, type: 'medium' },
    wind: { volume: 0, type: 'light' },
    thunder: { volume: 0, type: 'rare' },
    fire: { volume: 0, type: 'crackly' },
    waves: { volume: 0, type: 'slow' },
    music: { volume: 0, type: 'dreamy' }
  }
};

function loadPreset(presetKey) {
  const preset = presets[presetKey];
  if (!preset) return;

  state.activePreset = presetKey;

  // Highlight active preset button
  document.querySelectorAll('.preset-option-btn').forEach(btn => {
    if (btn.getAttribute('data-preset') === presetKey) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  Object.keys(preset).forEach(key => {
    const presetConfig = preset[key];
    const stateConfig = state.sounds[key];
    
    stateConfig.volume = presetConfig.volume;
    stateConfig.active = presetConfig.volume > 0;
    stateConfig.type = presetConfig.type;

    const slider = document.getElementById(`slider-${key}`);
    if (slider) slider.value = presetConfig.volume;

    const modesContainer = document.querySelector(`.sound-modes[data-sound="${key}"]`);
    if (modesContainer) {
      modesContainer.querySelectorAll('.mode-btn').forEach(btn => {
        if (btn.getAttribute('data-value') === presetConfig.type) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  });

  if (state.audioCtx) {
    applySoundLevels();
  }
  
  const setLabel = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };
  setLabel('rain-type-label',
    state.sounds.rain.type.charAt(0).toUpperCase() + state.sounds.rain.type.slice(1) + ' Rain');
  setLabel('wind-speed-label',
    state.sounds.wind.type === 'light' ? 'Gentle Breeze' : 'Howling Gale');
  setLabel('thunder-freq-label',
    state.sounds.thunder.type.charAt(0).toUpperCase() + state.sounds.thunder.type.slice(1));
  setLabel('music-mood-label',
    state.sounds.music.type === 'dreamy' ? 'Sleep Chords' : 'Zen Bells');
}


// --- 7. PLAY / PAUSE LOGIC ---

function playEngine() {
  if (window.USE_REAL_AUDIO) return; // audio.js handles playback
  if (!state.audioCtx) {
    initAudioEngine();
  }

  state.audioCtx.resume().then(() => {
    state.isPlaying = true;
    
    const masterVolume = parseFloat(document.getElementById('masterVolumeSlider').value) / 100;
    rampGain(state.masterGain, masterVolume, 0.4);

    applySoundLevels();

    document.getElementById('playTrigger').classList.add('playing');
    document.getElementById('mainPlayIcon').textContent = "pause";
  });
}

function pauseEngine() {
  if (window.USE_REAL_AUDIO) return; // audio.js handles playback
  if (!state.audioCtx) return;

  state.masterGain.gain.setValueAtTime(state.masterGain.gain.value, state.audioCtx.currentTime);
  state.masterGain.gain.linearRampToValueAtTime(0.0001, state.audioCtx.currentTime + 0.35);

  setTimeout(() => {
    if (state.isPlaying === false) return;
    state.audioCtx.suspend().then(() => {
      state.isPlaying = false;
      updateMusicSynth();

      document.getElementById('playTrigger').classList.remove('playing');
      document.getElementById('mainPlayIcon').textContent = "play_arrow";
    });
  }, 360);
}

function togglePlayback() {
  if (state.isPlaying) {
    pauseEngine();
  } else {
    playEngine();
  }
}


// --- 8. DOM BINDINGS & CONTROLLER HANDLERS ---

document.addEventListener('DOMContentLoaded', () => {
  setupRainCanvas();


  // Drawer Toggle Logic
  const settingsDrawer = document.getElementById('settingsDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const drawerToggle = document.getElementById('drawerToggle');
  const drawerClose = document.getElementById('drawerClose');

  function openDrawer() {
    settingsDrawer.classList.add('active');
    drawerOverlay.classList.add('active');
  }

  function closeDrawer() {
    settingsDrawer.classList.remove('active');
    drawerOverlay.classList.remove('active');
  }

  drawerToggle.addEventListener('click', openDrawer);
  drawerClose.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);

// Master Volume controls
  const masterSlider = document.getElementById('masterVolumeSlider');
  const masterVolumeIcon = document.getElementById('masterVolumeIcon');
  const masterMuteBtn = document.getElementById('masterMuteBtn');

  masterSlider.addEventListener('input', () => {
    if (!state.audioCtx) initAudioEngine();
    
    const val = parseFloat(masterSlider.value) / 100;
    
    if (state.isPlaying) {
      rampGain(state.masterGain, val, 0.1);
    }
    
    if (val === 0) {
      masterVolumeIcon.textContent = 'volume_off';
      state.isMasterMuted = true;
    } else {
      masterVolumeIcon.textContent = val < 0.4 ? 'volume_down' : 'volume_up';
      state.isMasterMuted = false;
    }
  });

  masterMuteBtn.addEventListener('click', () => {
    if (!state.audioCtx) initAudioEngine();

    if (state.isMasterMuted) {
      // Unmute
      state.isMasterMuted = false;
      masterSlider.value = state.preMuteVolume;
      if (state.isPlaying) {
        rampGain(state.masterGain, state.preMuteVolume / 100, 0.15);
      }
      masterVolumeIcon.textContent = (state.preMuteVolume / 100) < 0.4 ? 'volume_down' : 'volume_up';
    } else {
      // Mute
      state.isMasterMuted = true;
      state.preMuteVolume = parseFloat(masterSlider.value) || 80;
      masterSlider.value = 0;
      if (state.isPlaying) {
        rampGain(state.masterGain, 0, 0.15);
      }
      masterVolumeIcon.textContent = 'volume_off';
    }
  });

  // Presets Triggering
  document.querySelectorAll('.preset-option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selected = e.target.getAttribute('data-preset');
      loadPreset(selected);
      
      const quotes = state.quotes;
      document.getElementById('footerQuote').innerText = quotes[Math.floor(Math.random() * quotes.length)];
    });
  });

  // Theme Switches
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = e.target.closest('.theme-btn');
      activeBtn.classList.add('active');

      const theme = activeBtn.getAttribute('data-theme');
      state.activeTheme = theme;
      document.body.setAttribute('data-theme-active', theme);
    });
  });

  // Mixer Sliders
  Object.keys(state.sounds).forEach(key => {
    const slider = document.getElementById(`slider-${key}`);
    if (slider) {
      slider.addEventListener('input', () => {
        if (!state.audioCtx) initAudioEngine();
        
        const volume = parseFloat(slider.value);
        state.sounds[key].volume = volume;
        state.sounds[key].active = volume > 0;

        const muteBtn = document.querySelector(`.card-mute[data-sound="${key}"]`);
        if (muteBtn && muteBtn.classList.contains('muted')) {
          toggleSoundMute(key, muteBtn);
        }

        applySoundLevels();
      });
    }

    const modeContainer = document.querySelector(`.sound-modes[data-sound="${key}"]`);
    if (modeContainer) {
      modeContainer.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          modeContainer.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          const mode = btn.getAttribute('data-value');
          state.sounds[key].type = mode;

          if (key === 'rain') {
            document.getElementById('rain-type-label').innerText = 
              mode.charAt(0).toUpperCase() + mode.slice(1) + ' Rain';
          } else if (key === 'wind') {
            document.getElementById('wind-speed-label').innerText = 
              mode === 'light' ? 'Gentle Breeze' : 'Howling Gale';
          } else if (key === 'thunder') {
            document.getElementById('thunder-freq-label').innerText = 
              mode.charAt(0).toUpperCase() + mode.slice(1);
          } else if (key === 'music') {
            document.getElementById('music-mood-label').innerText = 
              mode === 'dreamy' ? 'Sleep Chords' : 'Zen Bells';
          }

          if (state.audioCtx) {
            applySoundLevels();
          }
        });
      });
    }

    const muteBtn = document.querySelector(`.card-mute[data-sound="${key}"]`);
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        toggleSoundMute(key, muteBtn);
      });
    }
  });

  function toggleSoundMute(key, muteBtn) {
    if (!state.audioCtx) initAudioEngine();

    const isCurrentlyMuted = muteBtn.classList.contains('muted');
    const iconSpan = muteBtn.querySelector('.material-symbols-outlined');
    
    if (isCurrentlyMuted) {
      // Unmute
      muteBtn.classList.remove('muted');
      iconSpan.textContent = 'volume_up';
      iconSpan.classList.remove('text-red-500');
      
      const slider = document.getElementById(`slider-${key}`);
      if (slider && parseFloat(slider.value) === 0) {
        slider.value = 40;
        state.sounds[key].volume = 40;
        state.sounds[key].active = true;
      }
    } else {
      // Mute
      muteBtn.classList.add('muted');
      iconSpan.textContent = 'volume_off';
      iconSpan.classList.add('text-red-500');
    }

    applySoundLevels();
  }

  // Thunder strike button
  const strikeBtn = document.getElementById('triggerThunder');
  if (strikeBtn) {
    strikeBtn.addEventListener('click', () => {
      if (!state.audioCtx) initAudioEngine();
      
      const thunderConfig = state.sounds.thunder;
      if (thunderConfig.volume === 0) {
        document.getElementById('slider-thunder').value = 50;
        thunderConfig.volume = 50;
        thunderConfig.active = true;
        updateThunderSynth();
      }
      triggerThunderStrike();
    });
  }

  // Play button click
  document.getElementById('playTrigger').addEventListener('click', () => {
    togglePlayback();
  });

  // Timer custom modal
  const timerToggle = document.getElementById('timerToggle');
  const timerCancel = document.getElementById('timerCancel');
  const customModal = document.getElementById('customTimerModal');
  const modalCancel = document.getElementById('modalCancel');
  const modalSave = document.getElementById('modalSave');
  const minutesInput = document.getElementById('customMinutesInput');

  if (timerToggle) {
    timerToggle.addEventListener('click', () => {
      if (state.timer.isActive) {
        stopSleepTimer();
      } else {
        customModal.classList.remove('hidden');
      }
    });
  }

  if (timerCancel) timerCancel.addEventListener('click', stopSleepTimer);
  if (modalCancel) modalCancel.addEventListener('click', () => customModal.classList.add('hidden'));

  if (modalSave) {
    modalSave.addEventListener('click', () => {
      const mins = parseInt(minutesInput.value);
      if (mins > 0) {
        customModal.classList.add('hidden');
        if (!state.isPlaying) playEngine();
        startSleepTimer(mins);
      }
    });
  }

  // Timer presets
  document.querySelectorAll('.timer-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.timer-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const minutes = parseInt(btn.getAttribute('data-time'));
      if (!state.isPlaying) playEngine();
      startSleepTimer(minutes);
    });
  });

  // Screen Dimming Toggle
  const sleepToggle = document.getElementById('sleepModeToggle');
  const dimOverlay = document.getElementById('dimOverlay');

  sleepToggle.addEventListener('click', () => {
    dimOverlay.classList.remove('hidden');
    setTimeout(() => {
      dimOverlay.classList.add('active');
    }, 50);
  });

  dimOverlay.addEventListener('click', () => {
    dimOverlay.classList.remove('active');
    setTimeout(() => {
      dimOverlay.classList.add('hidden');
    }, 500);
  });

  document.addEventListener('keydown', (e) => {
    if (dimOverlay.classList.contains('active') && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) {
      dimOverlay.classList.remove('active');
      setTimeout(() => {
        dimOverlay.classList.add('hidden');
      }, 500);
    }
  });

  // Load default preset Cozy Cabin
  loadPreset('cozy-cabin');
});
