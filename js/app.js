/* ═══════════ V.I.T.A.L · Lógica principal ═══════════
   Orquesta la escena MR, el dispositivo, los pacientes, el entorno
   virtual dinámico, la cámara real (merged reality), la voz y los gestos. */
"use strict";

/* ── Utilidades ──────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LEVELS = {
  green:  { name: "Estable",  icon: "🟢" },
  yellow: { name: "Revisión", icon: "🟡" },
  red:    { name: "Alerta",   icon: "🔴" },
};
const levelDist = (a, b) => Math.abs(["green", "yellow", "red"].indexOf(a) - ["green", "yellow", "red"].indexOf(b));

/* ── Estado global ───────────────────────────────────────── */
const S = {
  mode: "mission",              // mission | lab
  phase: "idle",                // idle|attend|result|selfscan|selfask|selfdone
  patient: null,
  usedNames: new Set(),
  score: 0, streak: 0, bestStreak: 0, correct: 0,
  patientIndex: 0, totalPatients: 8, missionActive: false,
  timer: null, timeLeft: 0, timeTotal: 0,
  scanning: false, scanProgress: 0, pointerDown: false, pointer: { x: 0, y: 0 },
  awaitingAnswer: null,         // resolve fn cuando el dispositivo pregunta al usuario
  env: { temp: 22, noise: 20 },
  cameraOn: false, thermal: false,
  eventTimers: [],
  self: null,                   // datos de autoevaluación
  askedThisPatient: 0,
};

const LOG_ICONS = { info: "ℹ️", ok: "✅", warn: "⚠️", bad: "🚨", sys: "🖥️" };
function log(msg, type = "info") {
  const el = $("log");
  const div = document.createElement("div");
  if (type !== "info") div.className = type;
  div.innerHTML = `<b>${new Date().toLocaleTimeString("es", { hour12: false })}</b> ${LOG_ICONS[type] || ""} ${msg}`;
  el.prepend(div);
  while (el.children.length > 60) el.lastChild.remove();
}

/* ═══════════ ENTORNO VIRTUAL ═══════════ */
function ambientOffset() { return clamp((S.env.temp - 26) * 0.02, -0.10, 0.35); }

function measureTemperature(realTemp) {
  const noise = (Math.random() - 0.5) * 2 * (0.10 + (1 - Device.precision / 100) * 0.25);
  return Math.round((realTemp + Device.drift + ambientOffset() + noise) * 10) / 10;
}

function refreshEnvUI() {
  $("env-temp-read").textContent = S.env.temp.toFixed(1) + " °C";
  $("env-noise-read").textContent = Math.round(S.env.noise) + " %";
  $("env-drift-read").textContent = (Device.drift >= 0 ? "+" : "") + Device.drift.toFixed(1) + " °C";
  $("env-temp-val").textContent = S.env.temp + " °C";
  $("env-noise-val").textContent = S.env.noise + " %";
  $("heat-haze").classList.toggle("on", S.env.temp >= 32);
  $("noise-viz").hidden = S.env.noise < 65;
}
setInterval(refreshEnvUI, 1200);

function setEnv(temp, noise, announce) {
  if (temp !== null) { S.env.temp = clamp(temp, 10, 42); $("env-temp").value = S.env.temp; }
  if (noise !== null) { S.env.noise = clamp(noise, 0, 100); $("env-noise").value = S.env.noise; }
  refreshEnvUI();
  if (announce) log(announce, "warn");
}

/** Eventos dinámicos del entorno (también se disparan solos en misión). */
function triggerEnvEvent(kind, silent = false) {
  const banner = $("event-banner");
  const show = (txt, info = false, ms = 4200) => {
    banner.textContent = txt; banner.hidden = false;
    banner.classList.toggle("info", info);
    setTimeout(() => banner.hidden = true, ms);
  };
  switch (kind) {
    case "heat":
      setEnv(37, null);
      show("🥵 ¡Ola de calor en la sala! La temperatura ambiente sube a 37 °C: las lecturas IR pueden salir elevadas. Considera calibrar.");
      if (!silent) { Device.say("Atención", "Ola de calor en la sala. Las lecturas pueden verse afectadas.", { voice: true }); }
      log("Evento: ola de calor (ambiente 37 °C).", "warn");
      S.eventTimers.push(setTimeout(() => { setEnv(24, null); log("La sala vuelve a su temperatura normal."); }, 26000));
      break;
    case "noise":
      setEnv(null, 90);
      show("📢 Sala muy ruidosa: el micrófono MEMS puede no captar bien las respuestas del paciente.");
      if (!silent) Device.say("Atención", "Mucho ruido ambiental. Puede que debas repetir preguntas.", {});
      log("Evento: sala ruidosa (ruido 90 %).", "warn");
      S.eventTimers.push(setTimeout(() => { setEnv(null, 25); log("El ruido ambiental se normaliza."); }, 22000));
      break;
    case "drift":
      Device.addDrift(0.7);
      show("🧲 Interferencia electromagnética: la deriva del sensor IR aumenta (+0.7 °C). ¡Calibra el sensor!", false);
      if (!silent) Device.say("Atención", "Interferencia en el sensor. Se recomienda calibrar.", {});
      log("Evento: interferencia → deriva +0.7 °C. Precisión al " + Device.precision + " %.", "warn");
      break;
    case "calm":
      setEnv(22, 20); Device.addDrift(-Device.drift);
      show("🌙 Condiciones normalizadas: ambiente 22 °C, ruido 20 %, deriva corregida.", true, 3000);
      log("Entorno normalizado manualmente.");
      break;
    case "anxious":
      if (S.patient) {
        S.patient.wobble = true;
        $("patient-wrap").classList.add("wobble");
        show("😟 El paciente está ansioso y se mueve: mantener el escaneo será más difícil.");
        log("El paciente se mueve (escaneo más difícil).", "warn");
        S.eventTimers.push(setTimeout(() => {
          if (S.patient) { S.patient.wobble = false; $("patient-wrap").classList.remove("wobble"); }
        }, 20000));
      }
      break;
  }
  refreshEnvUI();
}

function scheduleRandomEvent() {
  if (!S.missionActive) return;
  const delay = 26000 + Math.random() * 26000;
  S.eventTimers.push(setTimeout(() => {
    if (S.missionActive && S.phase === "attend") {
      triggerEnvEvent(["heat", "noise", "drift", "anxious"][Math.floor(Math.random() * 4)]);
    }
    scheduleRandomEvent();
  }, delay));
}

/* ═══════════ PACIENTES ═══════════ */
function showPatient(p) {
  S.patient = p;
  const wrap = $("patient-wrap");
  wrap.hidden = false;
  if (!S.cameraOn) $("face-guide").hidden = true;
  $("scene-empty").style.display = "none";
  $("patient-avatar").innerHTML = avatarSVG(p);
  $("patient-avatar").className = "patient-avatar expr-" + p.expression + (p.realTemp >= 38 ? " fever" : "");
  wrap.classList.toggle("wobble", !!p.wobble);
  hideBubble();
  updateHolo();
}
function hidePatient() {
  $("patient-wrap").hidden = true;
  if (!S.cameraOn) $("scene-empty").style.display = "";
  S.patient = null;
}
function updateHolo() {
  const p = S.patient; if (!p) return;
  $("holo-name").textContent = `👤 ${p.name} · ${p.age} años`;
  $("holo-temp").textContent = p.measuredTemp !== null && p.measuredTemp !== undefined
    ? `🌡️ ${p.measuredTemp.toFixed(1)} °C (medido)` : "🌡️ Sin medir";
  $("holo-answers").textContent = `💬 ${p.answersCount} respuestas`;
}
function bubble(text, ms = 3400) {
  const b = $("patient-bubble");
  b.innerHTML = text; b.hidden = false;
  clearTimeout(bubble._t);
  bubble._t = setTimeout(hideBubble, ms);
}
function hideBubble() { $("patient-bubble").hidden = true; }
function floatScore(text, xPct, bad = false) {
  const f = document.createElement("div");
  f.className = "float-score" + (bad ? " bad" : "");
  f.textContent = text;
  f.style.left = xPct + "%"; f.style.top = "38%";
  $("float-layer").appendChild(f);
  setTimeout(() => f.remove(), 1600);
}

/* ═══════════ ESCANEO IR (sensor + gestos) ═══════════ */
function currentScanTargetRect() {
  if (S.phase === "selfscan") {
    const o = document.querySelector(".face-oval");
    return o ? o.getBoundingClientRect() : null;
  }
  if (S.patient) return $("forehead-target").getBoundingClientRect();
  return null;
}

function startScan() {
  VitalAudio.unlock();
  if (S.scanning) { stopScan(); return; }
  if (Device.calibrating) return;
  if (S.phase === "selfscan") { /* objetivo: el usuario */ }
  else if (!S.patient) {
    Device.say("Sin paciente", "No hay nadie frente al sensor. Comienza una misión o genera un paciente.", {});
    log("Escaneo cancelado: no hay paciente en la escena.", "warn");
    return;
  }
  if (S.phase !== "attend" && S.mode === "mission") {
    log("El escaneo solo está disponible mientras atiendes a un paciente.", "warn");
    return;
  }
  S.scanning = true; S.scanProgress = 0;
  $("scene").classList.add("scanning");
  $("reticle").hidden = false; $("scan-beam").hidden = false;
  Device.setSensorActive(true); Device.setWaveMode("scan");
  Device.oled({ top: "SENSOR IR ACTIVO", main: "Apunta a la frente…", sub: "Mantén pulsado sobre la zona señalada" });
  Device.setStatus("Escaneando…", "busy");
  VitalAudio.fx.beep();
  log("Sensor IR armado. Mantén la retícula sobre la frente del objetivo.");
}

function stopScan() {
  S.scanning = false; S.scanProgress = 0;
  $("scene").classList.remove("scanning");
  $("reticle").hidden = true; $("scan-beam").hidden = true;
  Device.setSensorActive(false);
  if (Device.calibrating !== true) Device.setWaveMode("idle");
}

function finishScan() {
  stopScan();
  Device.drainBattery(3);
  VitalAudio.fx.measure();

  if (S.phase === "selfscan" && S.self) {
    const measured = sampleSelfTemperature();
    S.self.measuredTemp = measured;
    Device.oled({ top: "TU TEMPERATURA", main: `🌡️ ${measured.toFixed(1)} °C`, sub: "Medición frontal completada" });
    Device.say("Tu temperatura", `${measured.toFixed(1)} grados. Ahora responderás unas preguntas.`, {});
    log(`Autoevaluación: temperatura medida ${measured.toFixed(1)} °C.`, "ok");
    setTimeout(startSelfInterview, 1800);
    return;
  }

  const p = S.patient; if (!p) return;
  p.measuredTemp = measureTemperature(p.realTemp);
  Device.oled({ top: "TEMPERATURA MEDIDA", main: `🌡️ ${p.measuredTemp.toFixed(1)} °C`, sub: Device.precision < 70 ? "⚠ Precisión baja: considera calibrar el sensor" : "Medición IR completada" });
  Device.say("Temperatura medida", `${p.measuredTemp.toFixed(1)} grados Celsius.`, {});
  Device.setStatus("Medición completada");
  log(`Temperatura medida de ${p.name}: <b>${p.measuredTemp.toFixed(1)} °C</b> (real ${p.realTemp.toFixed(1)} °C · deriva ${Device.drift >= 0 ? "+" : ""}${Device.drift.toFixed(1)}).`);
  updateHolo();
  armTriage(true);
  if (S.mode === "lab") labAutoAssess();
}

/* Movimiento de la retícula y progreso de escaneo */
(function initScanPointer() {
  const scene = $("scene");
  const move = e => {
    S.pointer = { x: e.clientX, y: e.clientY };
    if (!S.scanning) return;
    const r = scene.getBoundingClientRect();
    const ret = $("reticle"), beam = $("scan-beam");
    ret.style.left = (e.clientX - r.left) + "px"; ret.style.top = (e.clientY - r.top) + "px";
    beam.style.left = (e.clientX - r.left) + "px"; beam.style.top = (e.clientY - r.top) + "px";
  };
  scene.addEventListener("pointermove", move);
  scene.addEventListener("pointerdown", e => { S.pointerDown = true; move(e); });
  window.addEventListener("pointerup", () => { S.pointerDown = false; });

  setInterval(() => {
    if (!S.scanning) return;
    const rect = currentScanTargetRect();
    let onTarget = false;
    if (rect) {
      const pad = S.patient && S.patient.wobble ? 6 : 16;
      onTarget = S.pointer.x >= rect.left - pad && S.pointer.x <= rect.right + pad &&
                 S.pointer.y >= rect.top - pad && S.pointer.y <= rect.bottom + pad;
    }
    if (S.pointerDown && onTarget) {
      const rate = S.patient && S.patient.wobble ? 3.4 : 5.2;
      S.scanProgress = clamp(S.scanProgress + rate, 0, 100);
      if (Math.round(S.scanProgress) % 20 < rate) VitalAudio.fx.scanTick(S.scanProgress / 100);
      if (S.scanProgress >= 100) { finishScan(); return; }
    } else {
      S.scanProgress = clamp(S.scanProgress - 4, 0, 100);
    }
    $("reticle-progress").style.setProperty("--p", S.scanProgress / 100);
  }, 60);
})();

/* ═══════════ ENTREVISTA ═══════════ */
function buildQuestionChips() {
  const wrap = $("question-chips");
  wrap.innerHTML = "";
  SYMPTOMS.forEach(s => {
    const b = document.createElement("button");
    b.className = "q-chip"; b.dataset.qid = s.id;
    b.textContent = s.label;
    b.title = s.q;
    b.addEventListener("click", () => askQuestion(s.id));
    wrap.appendChild(b);
  });
}
function refreshChips() {
  const p = S.patient;
  document.querySelectorAll(".q-chip").forEach(ch => {
    const asked = p ? p.askedQuestions.includes(ch.dataset.qid) : false;
    ch.classList.toggle("asked", asked);
    let dis = !p || asked || S.phase !== "attend";
    if (S.mode === "mission" && S.askedThisPatient >= 3) dis = true;
    ch.disabled = dis;
  });
}

function askQuestion(qid) {
  const p = S.patient;
  if (!p || p.askedQuestions.includes(qid)) return;
  if (S.mode === "mission" && S.phase !== "attend") return;
  if (S.mode === "mission" && S.askedThisPatient >= 3) {
    Device.say("Límite alcanzado", "Ya hiciste 3 preguntas. Es hora de decidir el triaje.", {});
    return;
  }
  const s = SYM_BY_ID[qid];

  // El ruido ambiental puede arruinar la respuesta (micrófono MEMS)
  if (S.env.noise > 65 && Math.random() < 0.45) {
    Device.oled({ top: "ENTREVISTA", main: s.q, sub: "Responda: Sí o No" });
    Device.say(s.q, "Responda: sí o no.", {});
    setTimeout(() => {
      bubble("¿Perdón? 😖 Hay mucho ruido, no le escuché…");
      VitalAudio.speak("¿Perdón? Hay mucho ruido, no le escuché.", { pitch: p.voicePitch });
      log("El ruido ambiental impidió escuchar la respuesta. La pregunta no se consumió.", "warn");
    }, 1400);
    return;
  }

  p.askedQuestions.push(qid);
  if (S.mode === "mission") S.askedThisPatient++;
  Device.drainBattery(1);
  Device.oled({ top: "ENTREVISTA · " + p.name.split(" ")[0].toUpperCase(), main: s.q, sub: "Responda: Sí o No" });
  Device.setWaveMode("voice");
  Device.say(s.q, "Responda: sí o no.", { voice: false });
  VitalAudio.speak(s.q, { pitch: 1 });

  setTimeout(() => {
    const ans = patientAnswer(p, qid);
    p.answersCount++;
    bubble(`<b>${ans.yes ? "SÍ" : "NO"}</b> · ${ans.text}`, 3600);
    Device.setWaveMode("voice");
    VitalAudio.speak(ans.text, { pitch: p.voicePitch, onend: () => Device.setWaveMode("idle") });
    Device.oled({ sub: `${p.name.split(" ")[0]} respondió: ${ans.yes ? "SÍ" : "NO"}` });
    log(`Pregunta «${s.label}» → ${p.name} responde <b>${ans.yes ? "SÍ" : "NO"}</b>.`);
    updateHolo(); refreshChips();
    if (p.answersCount >= 1) armTriage(true);
    if (S.mode === "lab") labAutoAssess();
  }, 1500);
  refreshChips();
}

/* ═══════════ TRIAJE / DECISIÓN ═══════════ */
function armTriage(on) {
  document.querySelectorAll(".triage-btn").forEach(b => b.classList.toggle("armed", on));
  Device.suggestLEDs(on && (S.mode === "lab" || (S.patient && S.patient.measuredTemp !== null)));
}

function decide(level) {
  VitalAudio.unlock();
  if (S.mode === "lab") { labDecide(level); return; }
  if (!S.missionActive || !S.patient) {
    Device.setLED(level);
    log(`LED ${LEVELS[level].name} encendido manualmente.`);
    return;
  }
  if (S.phase !== "attend") return; // mostrando resultado: ignorar
  const p = S.patient;
  if (p.measuredTemp === null || p.measuredTemp === undefined) {
    Device.say("Falta la temperatura", "Primero mide la temperatura con el sensor infrarrojo.", {});
    VitalAudio.fx.error();
    return;
  }
  resolveDecision(level);
}

function resolveDecision(level) {
  const p = S.patient;
  S.phase = "result";
  stopTimer(); stopScan();
  const truth = p.risk.level;
  const dist = levelDist(level, truth);
  const timeBonus = Math.round(50 * (S.timeLeft / S.timeTotal));
  let pts = 0, verdict;

  if (dist === 0) {
    pts = 100 + timeBonus + S.streak * 10;
    S.streak++; S.correct++;
    verdict = "¡Correcto!";
    VitalAudio.fx.stable(); if (truth === "red") VitalAudio.fx.alarm();
  } else if (dist === 1) {
    pts = 25; S.streak = 0;
    verdict = "Parcialmente correcto";
    VitalAudio.fx.review();
  } else {
    pts = truth === "red" || level === "red" ? -60 : -100;
    S.streak = 0;
    verdict = "¡Error peligroso!";
    VitalAudio.fx.alarm(); VitalAudio.fx.error();
  }
  S.bestStreak = Math.max(S.bestStreak, S.streak);
  S.score = Math.max(0, S.score + pts);
  Device.setLED(truth, { blink: truth === "red" });
  const reasons = p.risk.reasons.length ? p.risk.reasons.join(", ") : "sin signos de alarma";
  Device.oled({
    top: "RESULTADO DEL TRIAJE",
    main: `${LEVELS[truth].icon} Era: ${LEVELS[truth].name}`,
    sub: `Temp. real ${p.realTemp.toFixed(1)} °C · ${reasons}`
  });
  Device.say(verdict,
    `${p.name} estaba en estado ${LEVELS[truth].name}. Temperatura real ${p.realTemp.toFixed(1)} grados. ${pts >= 0 ? "Ganaste " + pts + " puntos." : "Perdiste " + Math.abs(pts) + " puntos."}`, {});
  log(`${verdict} Tu decisión: ${LEVELS[level].name} · Real: ${LEVELS[truth].name} (temp ${p.realTemp.toFixed(1)} °C, ${reasons}). <b>${pts >= 0 ? "+" : ""}${pts} pts</b>`,
    dist === 0 ? "ok" : dist === 1 ? "warn" : "bad");
  floatScore((pts >= 0 ? "+" : "") + pts, 46 + Math.random() * 8, pts < 0);
  updateHUD(); refreshChips();
  setTimeout(nextPatient, 4200);
}

/* ═══════════ MISIÓN ═══════════ */
function updateHUD() {
  $("score").textContent = S.score;
  $("streak").textContent = "×" + S.streak;
  $("patient-count").textContent = S.missionActive ? `${Math.min(S.patientIndex + 1, S.totalPatients)}/${S.totalPatients}` : "–/" + S.totalPatients;
  $("level").textContent = 1 + Math.floor(S.patientIndex / 3);
}

function startMission() {
  VitalAudio.unlock();
  S.mode = "mission"; setModeUI();
  S.score = 0; S.streak = 0; S.bestStreak = 0; S.correct = 0;
  S.patientIndex = 0; S.usedNames = new Set(); S.missionActive = true;
  S.eventTimers.forEach(clearTimeout); S.eventTimers = [];
  scheduleRandomEvent();
  log("🎯 Misión iniciada: atiende a " + S.totalPatients + " pacientes.", "sys");
  Device.say("Misión de triaje iniciada", "Atiende a cada paciente: mide su temperatura, entrevístalo y clasifícalo con los LED.", {});
  nextPatient(true);
}

function nextPatient(first = false) {
  if (!S.missionActive) return;
  if (!first) S.patientIndex++;
  if (S.patientIndex >= S.totalPatients) { endMission(); return; }

  const pattern = ["green", "yellow", "green", "yellow", "red", "yellow", "red", Math.random() < 0.5 ? "green" : "yellow"];
  const p = generatePatient(pattern[S.patientIndex % pattern.length], S.usedNames);
  S.askedThisPatient = 0;
  S.phase = "attend";
  showPatient(p);
  Device.setLED(null); armTriage(false); refreshChips();
  Device.oled({ top: `PACIENTE ${S.patientIndex + 1}/${S.totalPatients}`, main: `👤 ${p.name}`, sub: `${p.age} años · Mide su temperatura para comenzar` });
  Device.setStatus("Paciente en sala", "busy");
  VitalAudio.fx.newPatient();
  VitalAudio.speak(`Nuevo paciente: ${p.name}, ${p.age} años.`, { pitch: 1 });
  bubble(`Hola… soy ${p.name.split(" ")[0]}. No me siento muy bien.`, 3200);
  log(`Llega ${p.name} (${p.age} años). Escanea su temperatura y haz hasta 3 preguntas.`);
  $("mission-state").textContent = `Paciente ${S.patientIndex + 1}: ${p.name}. Escanea 🌡️, entrevista 💬 y decide el triaje 🚦.`;

  const lvl = 1 + Math.floor(S.patientIndex / 3);
  S.timeTotal = S.timeLeft = Math.max(45, 85 - (lvl - 1) * 15);
  startTimer();
  updateHUD();
}

function startTimer() {
  stopTimer();
  const bar = $("timer-bar");
  S.timer = setInterval(() => {
    S.timeLeft -= 0.25;
    const pct = clamp(S.timeLeft / S.timeTotal * 100, 0, 100);
    bar.style.width = pct + "%";
    bar.classList.toggle("warn", pct < 28);
    if (S.timeLeft <= 0) {
      stopTimer();
      if (S.phase === "attend" && S.patient) {
        const truth = S.patient.risk.level;
        const penalty = truth === "red" ? -100 : -40;
        S.score = Math.max(0, S.score + penalty); S.streak = 0;
        if (truth === "red") VitalAudio.fx.alarm();
        Device.say("Tiempo agotado", `El paciente se fue sin atención. Estaba en estado ${LEVELS[truth].name}.`, {});
        log(`⏱️ Tiempo agotado: ${S.patient.name} se marchó (estado real: ${LEVELS[truth].name}). ${penalty} pts.`, "bad");
        floatScore(penalty, 48, true);
        S.phase = "result"; updateHUD();
        setTimeout(nextPatient, 2600);
      }
    }
  }, 250);
}
function stopTimer() { if (S.timer) clearInterval(S.timer); S.timer = null; }

function endMission() {
  S.missionActive = false; S.phase = "idle";
  hidePatient(); stopTimer();
  S.eventTimers.forEach(clearTimeout); S.eventTimers = [];
  Device.setLED(null); Device.setStatus("Misión completada");
  const ranks = [
    [7, "🏆 Especialista V.I.T.A.L — ¡Triaje impecable!"],
    [5, "🥈 Técnico avanzado de triaje"],
    [3, "🥉 Técnico en formación"],
    [0, "📚 Sigue practicando en el Laboratorio"],
  ];
  const rank = ranks.find(r => S.correct >= r[0])[1];
  $("end-score").textContent = S.score;
  $("end-correct").textContent = `${S.correct}/${S.totalPatients}`;
  $("end-streak").textContent = "×" + S.bestStreak;
  $("end-rank").textContent = rank;
  $("end-modal").hidden = false;
  Device.say("Fin de la misión", `Puntuación final ${S.score}. Acertaste ${S.correct} de ${S.totalPatients} pacientes.`, {});
  log(`🏁 Misión terminada. Puntuación ${S.score} · Aciertos ${S.correct}/${S.totalPatients}.`, "sys");
  $("mission-state").textContent = "Misión completada. Pulsa «Comenzar misión» para jugar de nuevo.";
  updateHUD();
}

/* ═══════════ LABORATORIO ═══════════ */
function labPatientFromControls() {
  const p = S.patient || generatePatient("yellow", S.usedNames);
  p.realTemp = parseFloat($("lab-temp").value);
  SYMPTOMS.forEach(s => p.symptoms[s.id] = document.querySelector(`.sym-toggle[data-sym="${s.id}"]`)?.classList.contains("on") || false);
  if (p.realTemp >= 37.7) p.symptoms.feverFeel = p.symptoms.feverFeel || document.querySelector(`.sym-toggle[data-sym="feverFeel"]`)?.classList.contains("on");
  p.measuredTemp = null;
  p.risk = computeRisk(p);
  p.expression = p.risk.level === "red" ? "critical" : p.risk.level === "yellow" ? "ill" : "ok";
  return p;
}
function syncLabControls(p) {
  $("lab-temp").value = p.realTemp;
  $("lab-temp-val").textContent = p.realTemp.toFixed(1) + " °C";
  document.querySelectorAll(".sym-toggle").forEach(t =>
    t.classList.toggle("on", !!p.symptoms[t.dataset.sym]));
}
function enterLab() {
  stopTimer(); S.missionActive = false; S.phase = "attend";
  const p = generatePatient(["green", "yellow", "red"][Math.floor(Math.random() * 3)], S.usedNames);
  showPatient(p); syncLabControls(p);
  Device.setLED(null); refreshChips();
  Device.oled({ top: "LABORATORIO", main: "Paciente virtual listo", sub: "Define sus constantes y observa al dispositivo" });
  Device.setStatus("Modo laboratorio");
  $("mission-state").textContent = "Laboratorio: ajusta la temperatura real y los síntomas, luego escanea y entrevista. El dispositivo evaluará automáticamente con sus LED.";
  log("🧪 Laboratorio activo: paciente virtual generado.", "sys");
}
/** En el laboratorio el dispositivo evalúa solo, con los datos medidos. */
function labAutoAssess() {
  const p = S.patient; if (!p || p.measuredTemp === null || p.measuredTemp === undefined) return;
  const reported = {};
  p.askedQuestions.forEach(id => reported[id] = p.symptoms[id]);
  let score = tempScore(p.measuredTemp);
  Object.entries(reported).forEach(([id, yes]) => { if (yes) score += SYM_BY_ID[id].w; });
  let lvl = score >= 6 || p.measuredTemp >= 39.8 ? "red" : score >= 3 ? "yellow" : "green";
  if ((reported.chestPain || reported.breath) && p.measuredTemp >= 38.5) lvl = "red";
  Device.setLED(lvl, { blink: lvl === "red" });
  Device.setStatus("Evaluación: " + LEVELS[lvl].name, lvl === "red" ? "alert" : "");
  log(`🤖 Evaluación automática del dispositivo (con datos medidos): ${LEVELS[lvl].icon} ${LEVELS[lvl].name}. Estado real del paciente: ${LEVELS[p.risk.level].name}.`);
}
function labDecide(level) {
  if (!S.patient) { Device.setLED(level); return; }
  const truth = S.patient.risk.level;
  Device.setLED(truth, { blink: truth === "red" });
  const ok = level === truth;
  Device.say(ok ? "¡Correcto!" : "Revisa el caso",
    `El estado real es ${LEVELS[truth].name}. Temperatura real ${S.patient.realTemp.toFixed(1)} grados.`, {});
  log(`Laboratorio: tu decisión ${LEVELS[level].name} · real ${LEVELS[truth].name} → ${ok ? "✅" : "❌"}`, ok ? "ok" : "warn");
}

/* ═══════════ AUTOEVALUACIÓN MR (tú eres el paciente) ═══════════ */
function startSelfCheck() {
  if (S.mode !== "lab") setMode("lab");
  stopScan();
  S.self = { measuredTemp: null, symptoms: {} };
  S.phase = "selfscan";
  hidePatient();
  $("scene-empty").style.display = "none";
  $("face-guide").hidden = false; // la guía sirve también como referencia sin cámara
  if (!S.cameraOn) {
    log("Autoevaluación sin cámara: se simulará la medición IR. Activa 📷 Cámara MR para medir tu frente real.", "warn");
  }
  Device.setLED(null);
  Device.oled({ top: "AUTOEVALUACIÓN MR", main: "Coloca tu rostro en la guía", sub: "Pulsa «Escanear temperatura» y mantén la retícula en tu frente" });
  Device.say("Autoevaluación iniciada", "Coloca tu rostro dentro de la guía y pulsa escanear temperatura.", {});
  log("🪞 Autoevaluación MR: escanea tu frente para medir tu temperatura.", "sys");
}

function sampleSelfTemperature() {
  const video = $("cam");
  if (S.cameraOn && video.readyState >= 2) {
    const cv = $("motion-canvas"), g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(video, 0, 0, cv.width, cv.height);
    // Región de la frente (centro-superior del óvalo guía)
    const img = g.getImageData(34, 10, 28, 14).data;
    let sum = 0, n = 0;
    for (let i = 0; i < img.length; i += 4) { sum += (img[i] + img[i + 1] + img[i + 2]) / 3; n++; }
    const bright = sum / n / 255; // 0..1
    return Math.round(clamp(35.9 + bright * 2.1 + ambientOffset() * 0.5, 35.6, 38.6) * 10) / 10;
  }
  return Math.round((36.3 + Math.random() * 0.9 + ambientOffset()) * 10) / 10;
}

async function startSelfInterview() {
  S.phase = "selfask";
  const qs = ["feverFeel", "cough", "breath", "dizzy"];
  for (const qid of qs) {
    const s = SYM_BY_ID[qid];
    Device.oled({ top: "V.I.T.A.L TE PREGUNTA", main: s.q, sub: "Responde: Sí o No (voz, gesto, botones o desliza en la OLED)" });
    Device.say(s.q, "Responda: sí o no.", {});
    Device.setStatus("Esperando tu respuesta…", "busy");
    const ans = await waitForUserAnswer();
    S.self.symptoms[qid] = ans === "yes";
    VitalAudio.fx.confirm();
    log(`Autoevaluación · «${s.label}» → respondiste <b>${ans === "yes" ? "SÍ" : "NO"}</b>.`);
  }
  // Veredicto del dispositivo
  const pseudo = { realTemp: S.self.measuredTemp, symptoms: { ...S.self.symptoms } };
  SYMPTOMS.forEach(s => { if (!(s.id in pseudo.symptoms)) pseudo.symptoms[s.id] = false; });
  const risk = computeRisk(pseudo);
  Device.setLED(risk.level, { blink: risk.level === "red" });
  Device.oled({
    top: "TU RESULTADO",
    main: `${LEVELS[risk.level].icon} ${LEVELS[risk.level].name} · ${S.self.measuredTemp.toFixed(1)} °C`,
    sub: risk.level === "green" ? "Sin signos de alarma. ¡Cuídate!" :
         risk.level === "yellow" ? "Conviene una revisión médica presencial." :
         "Busca atención médica urgente."
  });
  Device.say("Resultado de tu autoevaluación",
    `Temperatura ${S.self.measuredTemp.toFixed(1)} grados. Estado: ${LEVELS[risk.level].name}. ` +
    (risk.level === "green" ? "No se detectan signos de alarma." : "Te recomendamos valoración médica presencial."), {});
  if (risk.level === "red") VitalAudio.fx.alarm(); else VitalAudio.fx.stable();
  Device.setStatus("Autoevaluación completa", risk.level === "red" ? "alert" : "");
  log(`🪞 Autoevaluación completada: ${LEVELS[risk.level].icon} ${LEVELS[risk.level].name} (${S.self.measuredTemp.toFixed(1)} °C). Recuerda: es una simulación educativa.`, "ok");
  S.phase = "attend";
  enterLabRefreshOnly();
}
function enterLabRefreshOnly() { if (S.mode === "lab" && !S.patient) enterLab(); }

/* ── Esperar respuesta del usuario (voz / gestos / botones / deslizamiento) ── */
function waitForUserAnswer() {
  return new Promise(resolve => {
    $("answer-row").hidden = false;
    $("face-guide").classList.add("armed");
    Device.setListening(true);
    let done = false;
    const finish = v => {
      if (done) return; done = true;
      S.awaitingAnswer = null;
      $("answer-row").hidden = true;
      $("face-guide").classList.remove("armed");
      Device.setListening(false);
      VitalAudio.stopListen();
      resolve(v);
    };
    S.awaitingAnswer = finish;

    // Voz (micrófono MEMS real)
    if (VitalAudio.srSupported && VitalAudio.enabled) {
      const lvl = setInterval(() => Device.setMicLevel(0.25 + Math.random() * 0.6), 160);
      VitalAudio.listenYesNo({ timeout: 9000 }).then(r => {
        clearInterval(lvl);
        if (r === "yes" || r === "no") { log(`🎙️ Respuesta por voz detectada: ${r === "yes" ? "SÍ" : "NO"}`); finish(r); }
        else if (!done) log("🎙️ No se entendió la respuesta por voz; usa botones, gestos o desliza en la OLED.", "warn");
      });
    } else {
      log("🎙️ Reconocimiento de voz no disponible en este navegador: usa botones, gestos MR o desliza ←/→ en la pantalla OLED.", "warn");
    }
    setTimeout(() => { if (!done) { log("Sin respuesta: se asume NO por seguridad clínica básica."); finish("no"); } }, 30000);
  });
}
/* Canales alternativos de respuesta */
$("btn-yes").addEventListener("click", () => S.awaitingAnswer && S.awaitingAnswer("yes"));
$("btn-no").addEventListener("click", () => S.awaitingAnswer && S.awaitingAnswer("no"));

/* ═══════════ CÁMARA MR + GESTOS ═══════════ */
let motionPrev = null, motionCooldown = 0, motionRun = 0;
async function toggleCamera() {
  const video = $("cam");
  if (S.cameraOn) {
    video.srcObject && video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null; S.cameraOn = false;
    $("scene").classList.remove("camera-on");
    $("face-guide").hidden = S.phase !== "selfscan";
    $("btn-camera").classList.remove("on");
    $("scene-mode-label").textContent = "Sala virtual";
    log("Cámara MR desactivada. Se muestra la sala virtual.");
    if (!S.patient) $("scene-empty").style.display = "";
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    video.srcObject = stream; S.cameraOn = true;
    $("scene").classList.add("camera-on");
    $("face-guide").hidden = false;
    $("btn-camera").classList.add("on");
    $("scene-mode-label").textContent = "📷 Tu entorno real + dispositivo virtual (MR)";
    $("scene-empty").style.display = "none";
    log("📷 Cámara MR activa: tu entorno real se fusiona con la unidad V.I.T.A.L. En la autoevaluación, mueve la mano a la derecha para decir SÍ y a la izquierda para NO.", "ok");
    Device.say("Cámara activada", "Realidad mixta en marcha. Tu entorno y el dispositivo ahora comparten escena.", {});
    const runId = ++motionRun;
    requestAnimationFrame(() => motionLoop(runId));
  } catch (e) {
    log("No se pudo acceder a la cámara (" + e.name + "). La MR con cámara requiere permiso y HTTPS.", "bad");
    Device.say("Sin cámara", "No se pudo activar la cámara. Seguimos en la sala virtual.", {});
  }
}

function motionLoop(runId) {
  if (!S.cameraOn || runId !== motionRun) return;
  const video = $("cam"), cv = $("motion-canvas");
  if (video.readyState >= 2) {
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(video, 0, 0, cv.width, cv.height);
    const cur = g.getImageData(0, 0, cv.width, cv.height).data;
    if (motionPrev && S.awaitingAnswer && performance.now() > motionCooldown) {
      let left = 0, right = 0;
      const mid = cv.width / 2;
      for (let y = 0; y < cv.height; y += 2) {
        for (let x = 0; x < cv.width; x += 2) {
          const i = (y * cv.width + x) * 4;
          const d = Math.abs(cur[i] - motionPrev[i]) + Math.abs(cur[i + 1] - motionPrev[i + 1]);
          if (d > 60) { if (x < mid) left++; else right++; }
        }
      }
      const TH = 260;
      if (right > TH || left > TH) {
        const yes = right >= left;
        motionCooldown = performance.now() + 1600;
        const zone = document.querySelector(yes ? ".zone-yes" : ".zone-no");
        zone.classList.add("flash"); setTimeout(() => zone.classList.remove("flash"), 600);
        log(`👋 Gesto detectado con la cámara: mano a la ${yes ? "derecha → SÍ" : "izquierda → NO"}.`);
        S.awaitingAnswer(yes ? "yes" : "no");
      }
    }
    motionPrev = cur;
  }
  requestAnimationFrame(() => motionLoop(runId));
}

/* ═══════════ COMANDOS DE VOZ DEL DISPOSITIVO ═══════════ */
function voiceCommand() {
  VitalAudio.unlock();
  if (S.awaitingAnswer) return; // ya está escuchando sí/no
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    Device.say("Voz no disponible", "Este navegador no soporta reconocimiento de voz. Usa los botones y gestos.", {});
    log("Reconocimiento de voz no soportado en este navegador.", "warn");
    return;
  }
  Device.setListening(true);
  Device.oled({ top: "ESCUCHANDO…", main: "Di un comando", sub: "«Escanear» · «Calibrar» · «Verde» · «Amarillo» · «Rojo»" });
  log("🎙️ Micrófono MEMS escuchando un comando de voz…");
  const rec = new SR();
  rec.lang = "es-ES"; rec.interimResults = false; rec.maxAlternatives = 2;
  rec.onresult = ev => {
    const t = ev.results[0][0].transcript.toLowerCase();
    log(`🎙️ Comando escuchado: «${t}»`);
    Device.setListening(false);
    if (/escan|temperatur|medir/.test(t)) startScan();
    else if (/calibr/.test(t)) $("btn-calibrate").click();
    else if (/verde|estable/.test(t)) decide("green");
    else if (/amarill|revisi/.test(t)) decide("yellow");
    else if (/rojo|alerta|urgente/.test(t)) decide("red");
    else { Device.say("No entendí el comando", "Prueba: escanear, calibrar, verde, amarillo o rojo.", {}); }
  };
  rec.onerror = () => { Device.setListening(false); log("No se pudo captar el comando de voz.", "warn"); };
  rec.onend = () => Device.setListening(false);
  try { rec.start(); } catch (e) { Device.setListening(false); }
}

/* ═══════════ MODOS Y CABLEADO DE UI ═══════════ */
function setMode(mode) {
  S.mode = mode; setModeUI();
  if (mode === "lab") enterLab();
  else {
    hidePatient(); S.phase = "idle"; stopTimer();
    if (!S.cameraOn) $("scene-empty").style.display = "";
    $("mission-state").textContent = "Pulsa «Comenzar misión» para recibir pacientes.";
    Device.oled({ top: "V.I.T.A.L OS", main: "Modo Misión Triaje", sub: "Pulsa «Comenzar misión» cuando estés listo" });
    Device.setLED(null); refreshChips();
    log("🎯 Modo Misión Triaje seleccionado.");
  }
}
function setModeUI() {
  $("tab-mission").classList.toggle("active", S.mode === "mission");
  $("tab-lab").classList.toggle("active", S.mode === "lab");
  $("lab-block").hidden = S.mode !== "lab";
  $("hud").style.opacity = S.mode === "mission" ? "1" : ".55";
}

function bindUI() {
  $("tab-mission").addEventListener("click", () => setMode("mission"));
  $("tab-lab").addEventListener("click", () => setMode("lab"));
  $("btn-start-mission").addEventListener("click", startMission);
  $("btn-restart").addEventListener("click", () => { $("end-modal").hidden = true; startMission(); });
  $("btn-close-end").addEventListener("click", () => $("end-modal").hidden = true);

  // Dispositivo
  $("ir-sensor").addEventListener("click", startScan);
  $("btn-scan").addEventListener("click", startScan);
  $("speaker").addEventListener("click", () => {
    VitalAudio.unlock();
    $("speaker").classList.add("speaking");
    VitalAudio.repeatLast();
    setTimeout(() => $("speaker").classList.remove("speaking"), 1200);
    log("🔊 Altavoz: repitiendo el último mensaje.");
  });
  $("mic").addEventListener("click", voiceCommand);
  $("btn-listen").addEventListener("click", voiceCommand);
  $("btn-calibrate").addEventListener("click", () => {
    if (S.scanning) stopScan();
    Device.calibrate(() => { log("🧭 Sensor IR calibrado: deriva corregida.", "ok"); refreshEnvUI(); });
  });

  // Decisión
  document.querySelectorAll(".triage-btn").forEach(b =>
    b.addEventListener("click", () => decide(b.dataset.triage)));

  // Entorno
  $("env-temp").addEventListener("input", e => { S.env.temp = +e.target.value; refreshEnvUI(); });
  $("env-noise").addEventListener("input", e => { S.env.noise = +e.target.value; refreshEnvUI(); });
  document.querySelectorAll("[data-env-event]").forEach(b =>
    b.addEventListener("click", () => triggerEnvEvent(b.dataset.envEvent)));

  // Laboratorio
  $("lab-temp").addEventListener("input", e => {
    $("lab-temp-val").textContent = (+e.target.value).toFixed(1) + " °C";
    if (S.patient) { const p = labPatientFromControls(); p.risk = computeRisk(p); showPatient(p); }
  });
  const symWrap = $("lab-symptoms");
  SYMPTOMS.forEach(s => {
    const b = document.createElement("button");
    b.className = "sym-toggle"; b.dataset.sym = s.id; b.textContent = s.label;
    b.addEventListener("click", () => {
      b.classList.toggle("on");
      if (S.patient) { const p = labPatientFromControls(); showPatient(p); Device.setLED(null); }
    });
    symWrap.appendChild(b);
  });
  $("btn-lab-new").addEventListener("click", () => {
    const p = generatePatient(["green", "yellow", "red"][Math.floor(Math.random() * 3)], S.usedNames);
    showPatient(p); syncLabControls(p); Device.setLED(null); refreshChips();
    log(`🧪 Nuevo paciente de laboratorio: ${p.name} (estado real oculto: ${LEVELS[p.risk.level].name}).`);
  });
  $("btn-selfcheck").addEventListener("click", startSelfCheck);

  // Barra superior
  $("btn-camera").addEventListener("click", toggleCamera);
  $("btn-thermal").addEventListener("click", e => {
    S.thermal = !S.thermal;
    $("scene").classList.toggle("thermal", S.thermal);
    e.currentTarget.classList.toggle("on", S.thermal);
    log(S.thermal ? "🌡️ Vista térmica del sensor IR activada." : "Vista térmica desactivada.");
  });
  $("btn-sound").addEventListener("click", e => {
    const on = !VitalAudio.enabled;
    VitalAudio.setEnabled(on);
    e.currentTarget.textContent = on ? "🔊 Sonido" : "🔇 Silencio";
    e.currentTarget.classList.toggle("on", on);
    log("Sonido " + (on ? "activado." : "silenciado."));
  });
  $("btn-labels").addEventListener("click", e => {
    const stage = $("device-stage");
    stage.classList.toggle("no-labels");
    e.currentTarget.classList.toggle("on", !stage.classList.contains("no-labels"));
  });
  $("btn-help").addEventListener("click", () => $("help-modal").hidden = false);
  $("btn-close-help").addEventListener("click", () => $("help-modal").hidden = true);
  $("help-modal").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });

  // Atajos de teclado
  window.addEventListener("keydown", e => {
    if (e.key === "1") decide("green");
    if (e.key === "2") decide("yellow");
    if (e.key === "3") decide("red");
    if (e.key.toLowerCase() === "e") startScan();
    if (e.key === "Escape" && S.scanning) stopScan();
  });
}

/* ═══════════ INICIO ═══════════ */
Device.init({
  onLedClick: level => decide(level),
  onSwipe: dir => {
    if (S.awaitingAnswer) {
      log(`👆 Deslizamiento en la OLED: ${dir === "yes" ? "→ SÍ" : "← NO"}`);
      S.awaitingAnswer(dir);
    }
  },
});
buildQuestionChips();
bindUI();
setModeUI();
refreshChips();
refreshEnvUI();
Device.oled({ top: "V.I.T.A.L OS v2.1", main: "Sistema listo", sub: "Elige Misión Triaje o Laboratorio para comenzar" });
log("Sistema V.I.T.A.L iniciado. Todos los sensores operativos.", "sys");
log(VitalAudio.srSupported
  ? "🎙️ Reconocimiento de voz disponible: podrás responder y dar comandos por voz."
  : "🎙️ Este navegador no soporta reconocimiento de voz; usa botones, gestos MR y deslizamientos.", "sys");
setTimeout(() => { if (!S.missionActive && S.mode === "mission") $("help-modal").hidden = false; }, 600);
