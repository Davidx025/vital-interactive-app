# V.I.T.A.L — Juego interactivo de Realidad Mixta (Merged Reality)

Juego e interfaz interactiva de **realidad mixta** que simula el funcionamiento del
dispositivo de monitoreo de salud **V.I.T.A.L** del plano adjunto
(`assets/vital-reference.jpg`). El dispositivo virtual se fusiona con una sala
clínica virtual o con **tu entorno real a través de la cámara**, y responde en
tiempo real a tu **voz**, tus **gestos** y a las **condiciones dinámicas del entorno**.

## ▶️ Cómo ejecutar

Es una app web sin dependencias ni build. Basta un servidor estático:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

> La cámara y el reconocimiento de voz requieren HTTPS o `localhost`
> (en Chrome/Edge). Sin ellos, todo lo demás funciona con botones y gestos táctiles.

## 🩺 El dispositivo (réplica interactiva del plano)

| Componente | Interacción |
|---|---|
| **Sensor de temperatura infrarrojo** | Clic en el sensor o en «Escanear»: aparece una retícula; mantén pulsado sobre la frente del paciente (o la tuya) para medir. Sufre **deriva** y se ve afectado por el calor ambiental: hay que **calibrarlo**. |
| **Pantalla OLED** | Muestra preguntas («¿Tienes fiebre? Responda: Sí o No», como en el plano), la temperatura medida y la **forma de onda de audio en vivo**. Desliza ←/→ sobre ella para responder No/Sí. Se inclina en 3D con el puntero. |
| **Micrófono MEMS** | Responde **por voz** («sí»/«no») y da **comandos hablados**: «escanear», «calibrar», «verde», «amarillo», «rojo» (Web Speech API, es-ES). El ruido ambiental puede arruinar las respuestas. |
| **Altavoz** | El dispositivo y los pacientes **hablan** (síntesis de voz es-ES, con tono distinto por paciente). Clic en el altavoz repite el último mensaje. Tonos WebAudio para aciertos, alarmas y escaneos. |
| **LEDs Verde/Amarillo/Rojo** | Estable / Revisión / Alerta. Son **clicables**: con ellos (o con los botones de triaje, las teclas 1-2-3 o la voz) tomas la decisión clínica. |

## 🎮 Modos de juego

### 🎯 Misión Triaje
Atiende a **8 pacientes virtuales** generados con un modelo clínico oculto
(temperatura real, 10 síntomas posibles, nivel de riesgo verdadero). Por paciente:
1. **Escanea** su temperatura con el sensor IR (minijuego de puntería; los pacientes ansiosos se mueven).
2. **Entrevístalo**: elige hasta 3 preguntas; el paciente responde por el altavoz con su propia voz.
3. **Decide el triaje** antes de que se agote el tiempo: 🟢 Estable · 🟡 Revisión · 🔴 Alerta.

Puntuación con bonus por rapidez y racha; clasificar una 🔴 como 🟢 (o al revés)
es un *error peligroso* con alarma. **Eventos aleatorios del entorno** (ola de
calor 🥵, sala ruidosa 📢, interferencia del sensor 🧲, paciente ansioso 😟)
alteran las mediciones en tiempo real y obligan a adaptarse.

### 🧪 Laboratorio Libre
Paciente virtual configurable (temperatura real con deslizador y síntomas
activables) para observar cómo reacciona el dispositivo: aquí la unidad
**evalúa automáticamente** con sus LED a partir de los datos medidos.
Incluye la **Autoevaluación MR**: con la cámara activada, el sensor mide tu
frente (muestreo de imagen), el dispositivo te entrevista y respondes con
**voz, botones, deslizamiento en la OLED o gestos de mano frente a la cámara**
(derecha = SÍ, izquierda = NO, por detección de movimiento). Vista térmica
simulada del sensor incluida.

## 🌍 Entorno virtual dinámico
Deslizadores de **temperatura ambiente** y **ruido** más eventos instantáneos:
el calor eleva las lecturas IR, el ruido dificulta la entrevista por el
micrófono MEMS y la deriva del sensor crece con el tiempo (la precisión se
muestra junto a la batería del dispositivo).

## 🛠️ Tecnología
HTML + CSS + JavaScript vanilla (sin build ni dependencias):
Web Speech API (reconocimiento y síntesis en español), WebAudio, getUserMedia,
Canvas (forma de onda OLED y detección de movimiento), SVG generado por código
(avatares de pacientes con expresiones según su estado).

## ⚠️ Aviso
Simulación con fines **educativos y de divulgación**. No es un dispositivo
médico ni sustituye la valoración de profesionales de la salud.
