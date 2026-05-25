/* ===============================================================
   Rainy Mood – Real Audio Engine
   Loops six MP3 files from /sounds/ and wires them to the existing
   mixer sliders, master volume, mute, sleep-timer, and play button.
   Procedural Web Audio synthesis in app.js is disabled when this
   file loads (flag: window.USE_REAL_AUDIO = true).
================================================================ */
(function () {
  // Signal to app.js to skip its procedural audio engine.
  window.USE_REAL_AUDIO = true;

  const SOUNDS = {
    rain:    { file: "sounds/boons_freak-rain-sound-188158.mp3",             base: 1.00, defaultOn: true,  defaultVol: 70 },
    thunder: { file: "sounds/soundreality-thunder-sound-375727.mp3",         base: 0.90, defaultOn: false, defaultVol: 0  },
    wind:    { file: "sounds/soundreality-wind-blowing-457954.mp3",          base: 0.70, defaultOn: false, defaultVol: 0  },
    waves:   { file: "sounds/freesound_community-waves-53479.mp3",           base: 0.80, defaultOn: false, defaultVol: 0  },
    fire:    { file: "sounds/soundreality-fire-crackling-528620.mp3",        base: 0.80, defaultOn: false, defaultVol: 0  },
  };

  const channels = {};
  let masterVol = 0.8;
  let masterMuted = false;
  let isPlaying = false;

  function buildAudioElements() {
    Object.keys(SOUNDS).forEach((key) => {
      const cfg = SOUNDS[key];
      const el = new Audio(cfg.file);
      el.loop = true;
      el.preload = "auto";
      el.volume = 0; // start silent; we'll ramp on play
      el.addEventListener("error", () => {
        console.warn(`[audio] missing file: ${cfg.file} — drop it into /sounds/`);
      });
      channels[key] = { el, vol: cfg.defaultVol, on: cfg.defaultOn, base: cfg.base };
    });
  }

  function targetVolumeFor(key) {
    if (!isPlaying || masterMuted) return 0;
    const c = channels[key];
    if (!c || !c.on) return 0;
    return Math.max(0, Math.min(1, (c.vol / 100) * c.base * masterVol));
  }

  // Smooth volume ramp (avoid clicks)
  function rampTo(el, target, ms = 250) {
    if (!el) return;
    const start = el.volume;
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / ms;
      if (t >= 1) { el.volume = target; return; }
      el.volume = start + (target - start) * t;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function applyAll() {
    Object.keys(channels).forEach((key) => {
      const c = channels[key];
      const target = targetVolumeFor(key);
      rampTo(c.el, target, 200);

      // Mirror to existing mixer card UI (active state)
      const card = document.getElementById(`card-${key}`);
      if (card) {
        if (c.on && c.vol > 0 && isPlaying && !masterMuted) card.classList.add("mixer-card-active");
        else card.classList.remove("mixer-card-active");
      }
    });
  }

  function playAll() {
    Object.values(channels).forEach((c) => {
      const p = c.el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    });
    isPlaying = true;
    applyAll();
    setPlayingUI(true);
  }

  function pauseAll() {
    isPlaying = false;
    // Ramp down first to avoid pops, then pause
    Object.values(channels).forEach((c) => rampTo(c.el, 0, 250));
    setTimeout(() => {
      Object.values(channels).forEach((c) => c.el.pause());
    }, 280);
    setPlayingUI(false);
  }

  function setPlayingUI(playing) {
    const trig = document.getElementById("playTrigger");
    const icon = document.getElementById("mainPlayIcon");
    if (trig) trig.classList.toggle("playing", playing);
    if (icon) icon.textContent = playing ? "pause" : "play_arrow";
  }

  function setMute(muted) {
    masterMuted = muted;
    const icon = document.getElementById("masterVolumeIcon");
    if (icon) icon.textContent = muted ? "volume_off" : "volume_up";
    applyAll();
  }

  // --- DOM bindings ---
  function wire() {
    // Main play/pause
    const trig = document.getElementById("playTrigger");
    if (trig) {
      trig.addEventListener("click", () => (isPlaying ? pauseAll() : playAll()));
    }

    // Master volume
    const master = document.getElementById("masterVolumeSlider");
    if (master) {
      masterVol = parseFloat(master.value) / 100;
      master.addEventListener("input", (e) => {
        masterVol = parseFloat(e.target.value) / 100;
        applyAll();
      });
    }

    // Master mute
    const muteBtn = document.getElementById("masterMuteBtn");
    if (muteBtn) muteBtn.addEventListener("click", () => setMute(!masterMuted));

    // Per-channel mixer sliders
    Object.keys(channels).forEach((key) => {
      const slider = document.getElementById(`slider-${key}`);
      if (!slider) return;
      slider.value = channels[key].vol;
      slider.addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        channels[key].vol = v;
        channels[key].on = v > 0;
        applyAll();
      });
    });

    // Preset buttons (Pure Rain / Heavy Storm / Cozy Cabin / Ocean Breeze)
    document.querySelectorAll(".preset-option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = btn.dataset.preset;
        applyPreset(preset);
        document.querySelectorAll(".preset-option-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  function applyPreset(name) {
    const presets = {
      "pure-rain":    { rain: 70, thunder: 0,  wind: 0,  waves: 0,  fire: 0,  music: 0  },
      "heavy-storm":  { rain: 90, thunder: 70, wind: 60, waves: 0,  fire: 0,  music: 0  },
      "cozy-cabin":   { rain: 65, thunder: 30, wind: 25, waves: 0,  fire: 70, music: 20 },
      "ocean-breeze": { rain: 40, thunder: 0,  wind: 35, waves: 75, fire: 0,  music: 25 },
    };
    const p = presets[name];
    if (!p) return;
    Object.keys(p).forEach((key) => {
      const slider = document.getElementById(`slider-${key}`);
      if (slider) slider.value = p[key];
      if (channels[key]) {
        channels[key].vol = p[key];
        channels[key].on = p[key] > 0;
      }
    });
    applyAll();
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildAudioElements();
    wire();
  });
})();
