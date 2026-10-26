/* ═══════════ V.I.T.A.L · Controlador del dispositivo ═══════════
   Replica interactiva del hardware: sensor IR, pantalla OLED (canvas),
   columna LED, altavoz y micrófono MEMS, batería y deriva del sensor. */
"use strict";

const Device = (() => {
  const $ = id => document.getElementById(id);
  const els = {};
  let waveMode = "idle";       // idle | voice | mic | scan | flat
  let micLevel = 0;
  let waveData = new Array(36).fill(0.12);
  let ledState = null;
  let battery = 100;
  let drift = 0;               // °C de error sistemático del sensor
  let calibrating = false;
  let handlers = { onTriage: () => {}, onSwipe: () => {}, onLedClick: () => {} };

  function init(h) {
    Object.assign(handlers, h);
    ["device","oled","oled-main","oled-sub","oled-top","oled-wave","oled-batt","oled-clock",
     "led-green","led-yellow","led-red","ir-sensor","speaker","mic","device-status",
     "battery-bar","precision-bar"].forEach(id => els[id] = $(id));

    // Reloj del dispositivo
    const tickClock = () => {
      const d = new Date();
      els["oled-clock"].textContent =
        String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    };
    tickClock(); setInterval(tickClock, 15000);

    // LEDs clicables = decisión de triaje
    ["green", "yellow", "red"].forEach(c => {
      els["led-" + c].addEventListener("click", () => handlers.onLedClick(c));
    });

    // Deslizar en la OLED: ← No · → Sí (gesto táctil / ratón)
    let startX = null;
    const oled = els.oled;
    oled.addEventListener("pointerdown", e => { startX = e.clientX; });
    oled.addEventListener("pointerup", e => {
      if (startX === null) return;
      const dx = e.clientX - startX; startX = null;
      if (Math.abs(dx) > 42) handlers.onSwipe(dx > 0 ? "yes" : "no");
    });

    // Inclinación 3D del dispositivo al mover el puntero (parallax MR)
    const stage = $("device-stage");
    stage.addEventListener("pointermove", e => {
      const r = els.device.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      els.device.style.setProperty("--tiltY", (x * 7) + "deg");
      els.device.style.setProperty("--tiltX", (-y * 5) + "deg");
    });
    stage.addEventListener("pointerleave", () => {
      els.device.style.setProperty("--tiltX", "0deg");
      els.device.style.setProperty("--tiltY", "0deg");
    });

    requestAnimationFrame(drawWave);
    setInterval(() => { // deriva lenta + recarga pasiva
      drift = Math.max(-1.5, Math.min(1.5, drift + (Math.random() * 0.014 - 0.004)));
      if (battery < 100) battery = Math.min(100, battery + 0.12);
      renderMeters();
    }, 4000);
    renderMeters();
  }

  /* ── Pantalla OLED ───────────────────────────────────────── */
  function oled({ top, main, sub } = {}) {
    if (top !== undefined) els["oled-top"].textContent = top;
    if (main !== undefined) els["oled-main"].textContent = main;
    if (sub !== undefined) els["oled-sub"].textContent = sub;
  }
  function setWaveMode(m) { waveMode = m; }
  function setMicLevel(v) { micLevel = Math.max(0, Math.min(1, v)); }

  function drawWave() {
    const cv = els["oled-wave"]; if (!cv) { requestAnimationFrame(drawWave); return; }
    const g = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const t = performance.now() / 1000;
    const n = waveData.length, bw = W / n;

    for (let i = 0; i < n; i++) {
      let target;
      const centerBoost = 1 - Math.abs(i - n / 2) / (n / 1.4);
      if (waveMode === "voice") {
        target = (0.18 + 0.62 * Math.abs(Math.sin(t * 6.3 + i * 0.55)) * (0.4 + Math.random() * 0.6)) * centerBoost;
      } else if (waveMode === "mic") {
        target = Math.max(0.05, micLevel * (0.45 + 0.55 * Math.sin(i * 1.7 + t * 9) ** 2) * (0.5 + centerBoost * 0.7));
        micLevel *= 0.94;
      } else if (waveMode === "scan") {
        target = 0.12 + 0.1 * Math.sin(t * 14 + i);
      } else if (waveMode === "flat") {
        target = 0.045;
      } else { // idle: respiración suave
        target = 0.09 + 0.05 * Math.sin(t * 1.8 + i * 0.4) * centerBoost;
      }
      waveData[i] += (target - waveData[i]) * 0.35;
      const h = Math.max(2, waveData[i] * (H - 8));
      const grad = g.createLinearGradient(0, H - h, 0, H);
      grad.addColorStop(0, "#7dd3fc"); grad.addColorStop(1, "#2563eb");
      g.fillStyle = grad;
      g.fillRect(i * bw + 1.5, H - h, bw - 3, h);
    }
    // ejes como en la imagen de referencia
    g.strokeStyle = "rgba(147,197,253,.65)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(2, 4); g.lineTo(2, H - 2); g.lineTo(W - 2, H - 2); g.stroke();
    requestAnimationFrame(drawWave);
  }

  /* ── LEDs ────────────────────────────────────────────────── */
  function setLED(state, { blink = false } = {}) {
    ledState = state;
    ["green", "yellow", "red"].forEach(c => {
      const el = els["led-" + c];
      el.classList.toggle("on-" + c, state === c);
      el.classList.toggle("blink", state === c && blink);
    });
  }
  function suggestLEDs(on = true) {
    ["green", "yellow", "red"].forEach(c => els["led-" + c].classList.toggle("suggest", on));
  }
  function getLED() { return ledState; }

  /* ── Altavoz / voz del dispositivo ───────────────────────── */
  function say(main, sub, { voice = true, pitch = 1, top = "V.I.T.A.L OS" } = {}) {
    oled({ top, main, sub: sub ?? "" });
    els.speaker.classList.add("speaking");
    setWaveMode("voice");
    const spoken = sub ? `${main}. ${sub}` : main;
    if (voice) {
      VitalAudio.speak(spoken, { pitch, onend: stopSpeaking });
      // respaldo visual por si el navegador bloquea TTS
      setTimeout(stopSpeaking, 2600 + spoken.length * 40);
    } else setTimeout(stopSpeaking, 900);
  }
  function stopSpeaking() {
    els.speaker.classList.remove("speaking");
    if (waveMode === "voice") setWaveMode("idle");
  }
  function setListening(on) {
    els.mic.classList.toggle("listening", on);
    if (on) setWaveMode("mic"); else if (waveMode === "mic") setWaveMode("idle");
  }
  function setSensorActive(on) { els["ir-sensor"].classList.toggle("active", on); }

  /* ── Estado, batería y calibración ───────────────────────── */
  function setStatus(text, cls = "") {
    els["device-status"].textContent = "● " + text;
    els["device-status"].className = "device-status " + cls;
  }
  function precision() { return Math.max(8, Math.round(100 - Math.abs(drift) * 95)); }
  function renderMeters() {
    els["oled-batt"].textContent = "🔋 " + Math.round(battery) + "%";
    els["battery-bar"].style.width = battery + "%";
    els["battery-bar"].classList.toggle("low", battery < 30);
    const p = precision();
    els["precision-bar"].style.width = p + "%";
    els["precision-bar"].classList.toggle("low", p < 70);
    els.oled.classList.toggle("low-batt", battery < 18);
  }
  function drainBattery(n) { battery = Math.max(2, battery - n); renderMeters(); }
  function addDrift(n) { drift = Math.max(-1.5, Math.min(1.5, drift + n)); renderMeters(); }

  function calibrate(done) {
    if (calibrating) return;
    calibrating = true;
    setStatus("Calibrando sensor…", "busy");
    oled({ top: "CALIBRACIÓN", main: "Calibrando sensor IR…", sub: "No muevas el dispositivo" });
    setWaveMode("scan");
    let p = 0;
    const iv = setInterval(() => {
      p += 20; VitalAudio.fx.scanTick(p / 100);
      oled({ sub: "Ajuste óptico " + p + " %" });
      if (p >= 100) {
        clearInterval(iv);
        drift = 0; calibrating = false;
        oled({ main: "✓ Sensor calibrado", sub: "Deriva corregida a ±0.0 °C" });
        setStatus("Sensor calibrado"); VitalAudio.fx.confirm();
        setWaveMode("idle"); renderMeters();
        done && done();
      }
    }, 260);
  }

  return {
    init, oled, say, stopSpeaking, setWaveMode, setMicLevel,
    setLED, suggestLEDs, getLED, setListening, setSensorActive,
    setStatus, calibrate, drainBattery, addDrift, renderMeters,
    get drift() { return drift; },
    get battery() { return battery; },
    get precision() { return precision(); },
    get calibrating() { return calibrating; },
  };
})();
