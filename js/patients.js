/* ═══════════ V.I.T.A.L · Pacientes virtuales ═══════════
   Modelo clínico oculto: temperatura real, síntomas y nivel de
   riesgo verdadero (verde / amarillo / rojo) que el jugador debe
   descubrir usando el sensor IR y la entrevista por voz. */
"use strict";

const SYMPTOMS = [
  { id: "feverFeel",  label: "Fiebre / escalofríos", q: "¿Ha tenido fiebre o escalofríos?",        w: 1, flavor: "Sí… siento escalofríos." },
  { id: "cough",      label: "Tos",                  q: "¿Tiene tos persistente?",                 w: 1, flavor: "Sí, toso mucho desde ayer." },
  { id: "chestPain",  label: "Dolor en el pecho",    q: "¿Siente dolor u opresión en el pecho?",   w: 3, red: true, flavor: "Sí… me aprieta el pecho." },
  { id: "breath",     label: "Dificultad respiratoria", q: "¿Le cuesta respirar o siente falta de aire?", w: 3, red: true, flavor: "Me falta… el aire…" },
  { id: "headache",   label: "Dolor de cabeza",      q: "¿Tiene un dolor de cabeza intenso?",      w: 1, flavor: "Sí, me late la cabeza." },
  { id: "dizzy",      label: "Mareo / debilidad",    q: "¿Se ha sentido mareado o muy débil?",     w: 1, flavor: "Sí, todo me da vueltas." },
  { id: "vomit",      label: "Náuseas / vómito",     q: "¿Ha vomitado o tiene náuseas?",           w: 1, flavor: "Sí, tengo el estómago revuelto." },
  { id: "soreThroat", label: "Dolor de garganta",    q: "¿Le duele la garganta al tragar?",        w: 1, flavor: "Sí, me arde al tragar." },
  { id: "fatigue",    label: "Cansancio extremo",    q: "¿Siente un cansancio extremo?",           w: 1, flavor: "Sí… no tengo fuerzas." },
  { id: "abdominal",  label: "Dolor abdominal",      q: "¿Tiene un dolor abdominal fuerte?",       w: 2, flavor: "Sí, me duele mucho la barriga." },
];
const SYM_BY_ID = Object.fromEntries(SYMPTOMS.map(s => [s.id, s]));

const NAMES = [
  ["María Fernanda", "F", 34], ["Carlos Andrés", "M", 47], ["Lucía", "F", 22],
  ["Jorge", "M", 61], ["Valentina", "F", 28], ["Santiago", "M", 19],
  ["Camila", "F", 41], ["Andrés Felipe", "M", 55], ["Isabella", "F", 16],
  ["Mateo", "M", 8], ["Sofía", "F", 73], ["Diego", "M", 38],
  ["Paula Andrea", "F", 50], ["Fernando", "M", 66], ["Daniela", "F", 25],
  ["Ricardo", "M", 44], ["Ana María", "F", 58], ["Hugo", "M", 71],
  ["Carmen", "F", 63], ["Óscar", "M", 31], ["Laura", "F", 12],
  ["Emilio", "M", 77], ["Rosa", "F", 69], ["Iván", "M", 26],
];

const SKINS = ["#f6cfae", "#eebd93", "#d99e6a", "#b57a4a", "#8a5a33"];
const HAIRS = ["#2b2118", "#57412a", "#8a5a2b", "#c9c9c9", "#151515", "#7a3b1e"];
const SHIRTS = ["#0ea5e9", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6", "#f472b6", "#64748b"];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;

function tempScore(t) {
  if (t < 36.0) return 2;
  if (t < 36.4) return 1;
  if (t <= 37.4) return 0;
  if (t <= 38.4) return 1;
  if (t <= 39.4) return 2;
  return 3;
}

/** Nivel de riesgo verdadero a partir del estado oculto del paciente. */
function computeRisk(p) {
  let score = tempScore(p.realTemp);
  const reasons = [];
  if (p.realTemp >= 38.5) reasons.push("fiebre alta (" + p.realTemp.toFixed(1) + " °C)");
  else if (p.realTemp >= 37.5) reasons.push("fiebre leve");
  else if (p.realTemp < 36.2) reasons.push("temperatura baja");
  for (const [id, on] of Object.entries(p.symptoms)) {
    if (!on) continue;
    const s = SYM_BY_ID[id];
    score += s.w;
    if (s.red) reasons.push("⚠ " + s.label.toLowerCase());
  }
  let level = "green";
  if (score >= 6 || p.realTemp >= 39.8) level = "red";
  else if (score >= 3) level = "yellow";
  if ((p.symptoms.chestPain || p.symptoms.breath) && p.realTemp >= 38.5) level = "red";
  return { level, score, reasons };
}

/** Genera un paciente con un nivel objetivo (para equilibrar la misión). */
function generatePatient(targetLevel, usedNames = new Set()) {
  let nameObj = pick(NAMES);
  let guard = 0;
  while (usedNames.has(nameObj[0]) && guard++ < 20) nameObj = pick(NAMES);
  usedNames.add(nameObj[0]);

  const p = {
    name: nameObj[0], sex: nameObj[1], age: nameObj[2] + Math.round(rnd(-3, 3)),
    symptoms: {}, measuredTemp: null, askedQuestions: [], answersCount: 0,
    skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS),
    hairStyle: pick(["short", "long", "bun", "bald", "curly"]),
    glasses: chance(0.3), wobble: false,
    voicePitch: nameObj[1] === "F" ? rnd(1.15, 1.35) : rnd(0.78, 0.95),
  };
  if (p.age < 14) p.voicePitch = rnd(1.35, 1.55);
  SYMPTOMS.forEach(s => p.symptoms[s.id] = false);

  const mild = ["cough", "soreThroat", "headache", "fatigue", "feverFeel"];
  const setSym = (ids, prob = 1) => ids.forEach(id => { if (chance(prob)) p.symptoms[id] = true; });

  if (targetLevel === "green") {
    p.realTemp = rnd(36.2, 37.3);
    setSym([pick(mild)], 0.45);
  } else if (targetLevel === "yellow") {
    p.realTemp = rnd(37.5, 38.6);
    setSym(["feverFeel"], 0.9);
    setSym([pick(mild), pick(mild)], 0.75);
    setSym(["dizzy", "vomit", "abdominal"], 0.3);
  } else { // red
    if (chance(0.55)) { // emergencia con señal de alarma
      p.realTemp = rnd(37.8, 39.6);
      p.symptoms[pick(["chestPain", "breath"])] = true;
      setSym(["feverFeel", "fatigue"], 0.8);
      setSym([pick(mild)], 0.6);
    } else { // fiebre muy alta
      p.realTemp = rnd(39.3, 40.6);
      setSym(["feverFeel", "headache", "fatigue"], 0.9);
      setSym(["dizzy", "vomit", pick(mild)], 0.55);
    }
  }
  p.realTemp = Math.round(p.realTemp * 10) / 10;
  // La sensación de fiebre sigue a la temperatura real
  if (p.realTemp >= 37.7) p.symptoms.feverFeel = true;
  if (p.realTemp < 37.2 && chance(0.7)) p.symptoms.feverFeel = false;

  p.risk = computeRisk(p);
  p.expression = p.risk.level === "red" ? "critical" : p.risk.level === "yellow" ? "ill" : "ok";
  return p;
}

/** Respuesta del paciente a una pregunta (verdadera según su estado). */
function patientAnswer(p, symId) {
  const yes = !!p.symptoms[symId];
  const s = SYM_BY_ID[symId];
  if (yes && s.flavor && chance(0.65)) return { yes, text: s.flavor };
  const noPool = ["No, eso no.", "No.", "No, para nada.", "Creo que no."];
  const yesPool = ["Sí.", "Sí, bastante.", "Ajá, sí."];
  return { yes, text: yes ? pick(yesPool) : pick(noPool) };
}

/* ── Avatar SVG generado ─────────────────────────────────── */
function avatarSVG(p) {
  const long = p.hairStyle === "long" || p.hairStyle === "bun";
  const hairBack = long ? `<path d="M60 78 Q48 20 100 16 Q152 20 140 78 L146 150 L54 150 Z" fill="${p.hair}"/>` : "";
  const hairTop = p.hairStyle === "bald" ? "" :
    p.hairStyle === "curly"
      ? `<g fill="${p.hair}"><circle cx="72" cy="42" r="13"/><circle cx="92" cy="32" r="14"/><circle cx="112" cy="32" r="14"/><circle cx="128" cy="44" r="12"/><circle cx="100" cy="26" r="12"/></g>`
      : `<path d="M62 62 Q58 18 100 16 Q142 18 138 62 Q126 34 100 34 Q74 34 62 62Z" fill="${p.hair}"/>`;
  const bun = p.hairStyle === "bun" ? `<circle cx="100" cy="14" r="11" fill="${p.hair}"/>` : "";
  const fever = p.realTemp >= 38;
  return `
  <svg viewBox="0 0 200 210" role="img" aria-label="Paciente ${p.name}">
    ${hairBack}
    <!-- cuerpo -->
    <path d="M100 118 C60 118 44 148 40 205 L160 205 C156 148 140 118 100 118Z" fill="${p.shirt}"/>
    <path d="M88 120 L100 138 L112 120 L106 116 L100 124 L94 116Z" fill="rgba(255,255,255,.75)"/>
    <!-- cuello y cabeza -->
    <rect x="90" y="96" width="20" height="28" rx="7" fill="${p.skin}"/>
    <ellipse cx="100" cy="66" rx="40" ry="44" fill="${p.skin}"/>
    <circle cx="59" cy="68" r="7" fill="${p.skin}"/><circle cx="141" cy="68" r="7" fill="${p.skin}"/>
    ${bun}${hairTop}
    <!-- mejillas -->
    <g class="cheeks" opacity="${fever ? 0.75 : 0.25}">
      <ellipse cx="76" cy="82" rx="9" ry="6" fill="#f87171"/>
      <ellipse cx="124" cy="82" rx="9" ry="6" fill="#f87171"/>
    </g>
    <!-- ojos según expresión -->
    <g class="eyes-ok">
      <circle cx="84" cy="64" r="4.4" fill="#26221f"/><circle cx="116" cy="64" r="4.4" fill="#26221f"/>
      <path d="M76 54 Q84 49 92 54" stroke="#26221f" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M108 54 Q116 49 124 54" stroke="#26221f" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>
    <g class="eyes-ill">
      <path d="M77 64 Q84 69 91 64" stroke="#26221f" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M109 64 Q116 69 123 64" stroke="#26221f" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M76 52 Q84 56 92 52" stroke="#26221f" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M108 52 Q116 56 124 52" stroke="#26221f" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    </g>
    <!-- nariz -->
    <path d="M100 66 L97 78 Q100 81 103 78" stroke="rgba(0,0,0,.35)" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- bocas según expresión -->
    <path class="mouth-ok" d="M88 90 Q100 99 112 90" stroke="#7c4a3a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path class="mouth-ill" d="M89 93 Q100 89 111 93" stroke="#7c4a3a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <g class="mouth-critical">
      <ellipse cx="100" cy="93" rx="8" ry="6" fill="#5b3226"/>
      <path d="M84 88 Q100 78 116 88" stroke="#475569" stroke-width="5" fill="rgba(148,197,255,.35)"/>
    </g>
    <!-- sudor si hay fiebre -->
    <g class="sweat" fill="#7dd3fc">
      <path d="M64 40 q5 8 0 12 q-5 -4 0 -12"/><path d="M138 48 q5 8 0 12 q-5 -4 0 -12"/>
    </g>
    ${p.glasses ? `<g stroke="#334155" stroke-width="2.6" fill="rgba(186,230,253,.14)"><rect x="68" y="54" width="28" height="20" rx="7"/><rect x="104" y="54" width="28" height="20" rx="7"/><path d="M96 62 L104 62"/></g>` : ""}
    <style>
      .eyes-ill,.mouth-ill,.mouth-critical,.sweat{display:none}
      .expr-ill .eyes-ok,.expr-critical .eyes-ok{display:none}
      .expr-ill .eyes-ill,.expr-critical .eyes-ill{display:block}
      .expr-ill .mouth-ok,.expr-critical .mouth-ok{display:none}
      .expr-ill .mouth-ill{display:block}
      .expr-critical .mouth-critical{display:block}
      .fever .sweat{display:block;animation:drip 1.6s ease-in infinite}
      @keyframes drip{0%{transform:translateY(0);opacity:0}25%{opacity:1}100%{transform:translateY(9px);opacity:0}}
    </style>
  </svg>`;
}
