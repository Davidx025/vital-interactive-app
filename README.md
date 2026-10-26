# 🩺 V.I.T.A.L — Juego interactivo de Realidad Mixta (Merged Reality)

Juego e interfaz interactiva de **realidad mixta** que simula el funcionamiento del
dispositivo de monitoreo de salud **V.I.T.A.L**: sensor de temperatura infrarrojo,
pantalla OLED, micrófono MEMS, altavoz y LEDs de estado
(🟢 Estable · 🟡 Revisión · 🔴 Alerta).

> **100 % autónoma:** toda la aplicación (HTML + CSS + JavaScript + la imagen del
> plano del dispositivo) vive en **un único archivo `index.html`** (~240 KB).
> No requiere servidor, ni build, ni npm, ni dependencias externas.

---

## 🚀 Publicar en GitHub Pages (paso a paso)

1. **Sube el repositorio a GitHub** (si aún no lo está):
   ```bash
   git add .
   git commit -m "V.I.T.A.L SPA autónoma"
   git push origin main
   ```
2. En GitHub, entra a tu repositorio → pestaña **⚙️ Settings**.
3. En el menú lateral, sección **Code and automation**, haz clic en **Pages**.
4. En **Build and deployment → Source**, selecciona **Deploy from a branch**.
5. Elige la rama **`main`** y la carpeta **`/(root)`** y pulsa **Save**.
6. Espera 1–2 minutos y recarga esa misma página: aparecerá tu URL pública:
   ```
   https://<tu-usuario>.github.io/<nombre-del-repo>/
   ```
7. Abre la URL… ¡y a jugar! 🎮

> ✅ **Importante:** GitHub Pages sirve por **HTTPS**, que es justo lo que
> necesitan la cámara web (`getUserMedia`) y el reconocimiento de voz
> (Web Speech API) para funcionar. En local con `file://` algunos navegadores
> bloquean cámara/micrófono; el resto del juego funciona igual.

### Uso local sin servidor
Descarga `index.html` y haz **doble clic** para abrirlo en el navegador.
Para usar cámara y voz en local, sirve la carpeta con cualquier servidor
estático, por ejemplo:
```bash
python3 -m http.server 8000   # → http://localhost:8000
```
(`localhost` también es un contexto seguro válido para cámara y micrófono).

---

## 📁 Estructura del proyecto

```
.
├── index.html   ← TODA la aplicación (HTML + CSS + JS + imagen, sin externos)
└── README.md
```

No hay carpetas `css/`, `js/` ni `assets/`: el CSS está en una etiqueta
`<style>`, los cuatro módulos JS (audio, dispositivo, pacientes y lógica del
juego) en etiquetas `<script>` al final del body, y la fotografía del plano
del dispositivo está incrustada en base64.

## 📷 Realidad Mixta en el navegador
Al pulsar **📷 Cámara MR**, tu cámara en vivo (`navigator.mediaDevices.getUserMedia`)
pasa a ser el fondo de la escena y la interfaz del dispositivo se **superpone**
sobre tu rostro/entorno:
- **HUD V.I.T.A.L** sobre el vídeo: LEDs de estado en vivo, temperatura medida
  y barra tipo OLED con la pregunta actual.
- **Guía facial** con zonas de gesto: mano a la **derecha = SÍ**, a la
  **izquierda = NO** (detección de movimiento por canvas).
- **Vista térmica** simulada del sensor IR e **indicador térmico flotante**
  que sigue a la retícula mostrando la temperatura en tiempo real.

## 🌍 Selector de entornos (sobre el panel «Entorno Mixto»)
| Entorno | Descripción |
|---|---|
| 📷 **Cámara Real (MR Passthrough)** | Vídeo de tu webcam en vivo con el dispositivo superpuesto. |
| 🏥 **Sala de Hospital** | Unidad de triaje renderizada en SVG: monitor de signos con ECG animado, cama, portasueros, panel de gases y señalética. |
| ⛺ **Carpa de Atención Médica** | Triaje de campaña en SVG: interior de carpa, camilla, cajas de suministros, bombona de O₂ y lámpara. El polvo y el calor añaden **+0,1 °C de deriva** al sensor IR. |

## 🥽 WebXR básico (gafas VR/MR)
El botón **🥽 Entrar en VR/MR** usa la **WebXR API**: detecta sesiones
`immersive-ar` / `immersive-vr` y proyecta en el visor una escena 3D WebGL
con el entorno elegido y un **panel V.I.T.A.L flotante con tus datos en vivo**
(temperatura, LED de estado, pregunta actual y paciente). Sin visor
disponible, abre una **vista previa 3D en pantalla** controlable por arrastre.

## 🧑‍🤝‍🧑 Avatares sincronizados con la ficha clínica
Cada paciente se genera con un catálogo demográfico estricto: el avatar
**siempre** coincide con el nombre, el sexo y el rango de edad de su ficha
(niños, jóvenes, adultos y adultos mayores). Nada de ancianas con barba ni
niños calvos: pelo y canas, peinados, barba/bigote, arrugas, gafas y voz se
derivan del sexo y la edad, y la expresión refleja su diagnóstico.

## 🩺 El dispositivo (réplica interactiva del plano)

| Componente | Interacción |
|---|---|
| **Sensor infrarrojo** | Clic en el sensor o en «Escanear»: retícula + indicador flotante con la temperatura **en vivo**; mantén pulsado sobre la frente del paciente (o la tuya). Sufre **deriva** y le afecta el calor ambiental: hay que **calibrarlo**. |
| **Pantalla OLED** | Visualizador de ondas de voz animado (canvas) y flujo de preguntas de triaje («¿Tienes fiebre? Responda: Sí o No»). Desliza ←/→ sobre ella para responder No/Sí. |
| **Micrófono MEMS** | Reconocimiento de voz (Web Speech API, es-ES): responde «sí»/«no» y da comandos hablados («escanear», «calibrar», «verde», «amarillo», «rojo»). |
| **Altavoz** | Síntesis de voz (TTS es-ES) que formula preguntas, narra resultados y emite alertas; tonos WebAudio de confirmación y alarma. Clic en el altavoz repite el último mensaje. |
| **LEDs de estado** | 🟢 Estable · 🟡 Revisión · 🔴 Alerta, animados (brillo, parpadeo en alerta) y **clicables** para decidir el triaje. |

## 🎮 Modos de juego

### 🎯 Misión Triaje
Atiende a **8 pacientes virtuales** con un modelo clínico oculto (temperatura
real, 10 síntomas, riesgo verdadero): escanea su temperatura, entrevístalos
(hasta 3 preguntas) y clasifícalos antes de que se acabe el tiempo.
Puntuación con bonus por rapidez y racha, y **eventos aleatorios del entorno**
(🥵 ola de calor, 📢 sala ruidosa, 🧲 interferencia del sensor, 😟 paciente
ansioso) que alteran las mediciones en tiempo real.

### 🧪 Laboratorio Libre + Autoevaluación MR
Paciente configurable (temperatura y síntomas) donde el dispositivo evalúa
automáticamente con sus LED, y **Autoevaluación MR**: la cámara mide tu frente,
el dispositivo te entrevista y respondes por voz, botones, gestos o deslizando
en la OLED.

## 🌍 Entorno virtual dinámico
Deslizadores de temperatura ambiente y ruido: el calor eleva las lecturas IR,
el ruido dificulta la entrevista por el micrófono MEMS y la deriva del sensor
crece con el tiempo (precisión y batería visibles junto al dispositivo).

## 🛠️ Tecnología
HTML + CSS + JavaScript **vanilla en un solo archivo**: Web Speech API
(reconocimiento y síntesis en español), WebAudio, `getUserMedia`, Canvas
(visualizador OLED, escaneo y detección de movimiento), SVG generado por
código (avatares demográficos y fondos de hospital/carpa) y **WebXR + WebGL**
para la proyección en visores VR/MR. **Cero dependencias.**

## 🔧 Problemas frecuentes
- **La cámara no se activa:** concede el permiso y usa la URL de GitHub Pages
  (HTTPS) o `http://localhost`. En `file://`, Chrome puede bloquearla.
- **No me escucha:** el reconocimiento de voz funciona en Chrome/Edge; en
  otros navegadores usa botones, gestos MR o desliza en la pantalla OLED.
- **La medición sale rara:** revisa la deriva del sensor y la temperatura
  ambiente; pulsa **🧭 Calibrar sensor**.

## ⚠️ Aviso
Simulación con fines **educativos y de divulgación**. No es un dispositivo
médico ni sustituye la valoración de profesionales de la salud.
