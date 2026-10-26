/* ═══════════ V.I.T.A.L · Motor de audio ═══════════
   Altavoz: síntesis de voz (TTS es-ES) + efectos WebAudio.
   Micrófono MEMS: reconocimiento de voz (Web Speech API) + nivel en vivo. */
"use strict";

const VitalAudio = (() => {
  let ctx = null;
  let enabled = true;
  let lastMessage = "";
  let lastPitch = 1;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /* ── Efectos generados por oscilador ─────────────────────── */
  function tone(freq, t0, dur, type = "sine", gain = 0.12, slideTo = null) {
    if (!enabled) return;
    try {
      const a = ac(), o = a.createOscillator(), g = a.createGain();
      const start = a.currentTime + t0;
      o.type = type; o.frequency.setValueAtTime(freq, start);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g).connect(a.destination);
      o.start(start); o.stop(start + dur + 0.05);
    } catch (e) { /* audio no disponible */ }
  }

  const fx = {
    beep()      { tone(880, 0, 0.09, "sine", 0.08); },
    confirm()   { tone(660, 0, 0.09); tone(990, 0.09, 0.14); },
    error()     { tone(220, 0, 0.16, "square", 0.06); tone(180, 0.14, 0.2, "square", 0.06); },
    scanTick(p) { tone(500 + p * 900, 0, 0.05, "sine", 0.05); },
    measure()   { tone(740, 0, 0.1); tone(1180, 0.1, 0.18); },
    stable()    { tone(523, 0, 0.12); tone(659, 0.11, 0.12); tone(784, 0.22, 0.2); },
    review()    { tone(587, 0, 0.14); tone(587, 0.2, 0.14); },
    alarm()     { for (let i = 0; i < 3; i++) { tone(1175, i * 0.32, 0.15, "triangle", 0.13); tone(880, i * 0.32 + 0.16, 0.15, "triangle", 0.13); } },
    pop()       { tone(420, 0, 0.07, "sine", 0.07, 760); },
    newPatient(){ tone(392, 0, 0.1); tone(523, 0.1, 0.12); tone(659, 0.22, 0.16); },
  };

  /* ── Altavoz: síntesis de voz ───────────────────────────── */
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    return vs.find(v => /^es[-_]/i.test(v.lang) && /google|microsoft|mónica|monica|paulina|lucia|lucía/i.test(v.name))
        || vs.find(v => /^es[-_]/i.test(v.lang))
        || null;
  }
  if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => {};

  function speak(text, { pitch = 1, rate = 1.02, onend = null } = {}) {
    lastMessage = text; lastPitch = pitch;
    if (!enabled || !("speechSynthesis" in window)) { onend && onend(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v ? v.lang : "es-ES";
      u.pitch = pitch; u.rate = rate;
      u.onend = () => onend && onend();
      u.onerror = () => onend && onend();
      speechSynthesis.speak(u);
      // Respaldo por si onend no se dispara
      const ms = Math.min(9000, 1400 + text.length * 95);
      setTimeout(() => onend && onend(), ms);
    } catch (e) { onend && onend(); }
  }

  function repeatLast() { if (lastMessage) speak(lastMessage, { pitch: lastPitch }); }

  /* ── Micrófono MEMS: reconocimiento de voz ──────────────── */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;

  /**
   * Escucha una respuesta. Resuelve con:
   *  'yes' | 'no' | 'unclear' | null (no soportado / error)
   */
  function listenYesNo({ timeout = 6000, onLevel = null } = {}) {
    return new Promise(resolve => {
      if (!SR) { resolve(null); return; }
      stopListen();
      try {
        recognition = new SR();
        recognition.lang = "es-ES";
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;
        listening = true;
        let done = false;
        const finish = val => { if (!done) { done = true; stopListen(); resolve(val); } };

        recognition.onresult = ev => {
          let heard = "";
          for (const r of ev.results) {
            heard += r[0].transcript + " ";
            if (onLevel) onLevel(Math.min(1, 0.3 + r[0].confidence));
          }
          const t = heard.toLowerCase();
          if (/\b(sí|si|claro|afirmativo|correcto|exacto)\b/.test(t)) finish("yes");
          else if (/\b(no|nunca|negativo|para nada)\b/.test(t)) finish("no");
        };
        recognition.onerror = ev => finish(ev.error === "not-allowed" ? null : "unclear");
        recognition.onend = () => { if (!done) { listening = false; finish("unclear"); } };
        recognition.start();
        setTimeout(() => finish("unclear"), timeout);
      } catch (e) { resolve(null); }
    });
  }

  function stopListen() {
    if (recognition) { try { recognition.abort(); } catch (e) {} recognition = null; }
    listening = false;
  }

  return {
    fx, speak, repeatLast, listenYesNo, stopListen,
    get lastMessage() { return lastMessage; },
    get listening() { return listening; },
    get srSupported() { return !!SR; },
    setEnabled(v) { enabled = v; if (!v && "speechSynthesis" in window) speechSynthesis.cancel(); },
    get enabled() { return enabled; },
    unlock() { try { ac(); } catch (e) {} },
  };
})();
