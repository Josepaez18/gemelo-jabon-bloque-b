# Gemelo digital 3D · Bloque B

Gemelo digital, para el navegador, de un edificio universitario con sensores IoT de nivel de jabón.
Proyecto del curso **Internet de las Cosas** (Ingeniería de Sistemas, Universidad Cooperativa de Colombia).

- Maqueta 3D del Bloque B: 6 pisos, 2 baños por piso y 12 dispensadores (`bano-bloque-b-d1` … `d12`).
- Simulación del consumo, de los ESP32 + HC-SR04 y del personal de aseo, con 3 estrategias.
- Receptor con las mismas reglas R1–R8 de `receptor.py`.
- Modo en vivo: `bano-bloque-b-d2` muestra lo que publica el ESP32 de Wokwi por MQTT.

---

## 1. Instalar

Necesitas **Node.js 18 o superior** (se probó con Node 24).

```bash
npm install
```

## 2. Correr

**En Windows, lo más fácil:** haz doble clic en **`iniciar.bat`**. Instala lo que falte, enciende el gemelo y
abre el navegador. Deja esa ventana abierta mientras lo usas; para apagarlo, ciérrala.

**Desde una terminal**, en la carpeta del proyecto:

```bash
npm run dev      # abre solo http://localhost:5173
```

> **No abras `index.html` con doble clic.** El navegador bloquea los módulos de JavaScript en archivos
> locales y nada arranca: verías el reloj quieto en 06:00:00. Si pasa, la página misma lo avisa.

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm test` | Corre las pruebas (Vitest) |
| `npm run build` | Genera la versión para publicar en `dist/` |
| `npm run preview` | Sirve `dist/` para revisarla |

`npm run dev` también muestra una dirección de red (por ejemplo `http://192.168.1.9:5173`).
Ábrela en el celular, conectado a la misma red Wi-Fi.

### Si no enciende

| Lo que ves | Qué hacer |
|---|---|
| Aviso "abriste index.html con doble clic" | Usa `iniciar.bat` o `npm run dev` |
| `npm` no se reconoce | Instala Node.js desde https://nodejs.org y abre una terminal nueva |
| En PowerShell: "la ejecución de scripts está deshabilitada" | Usa `iniciar.bat`, o escribe `npm.cmd run dev` |
| "Vista simplificada" en lugar de la maqueta 3D | El navegador no pudo iniciar WebGL. Activa la aceleración por hardware (`edge://settings/system` o `chrome://settings/system`) y recarga. Todo lo demás funciona igual |
| `Port 5173 is in use` | Ya hay un gemelo encendido: ciérralo, o usa la dirección que muestre la terminal |
| La maqueta va lenta | La calidad 3D baja sola si el equipo no da abasto y lo recuerda para esa gráfica. Para fijarla, abre `http://localhost:5173/?calidad=media` (o `baja`, `alta`); con `?calidad=auto` vuelve a medir. Con gráfica integrada, conecta el cargador |
| Banda roja "Algo falló: …" abajo | Recarga la página. Si se repite, copia el mensaje |

## 3. Cómo se usa

- **Presentar** (botón azul de la barra): pantalla completa en tema oscuro, pensada para exponer frente a un público.
  - Arranca con una portada y los pisos cayendo en su lugar. Luego sigue un recorrido de cámara de 7 escenas, una por cada paso del Momento 3 (ver la sección siguiente).
  - Los textos de cada paso están en `src/config/presentacion.js`: cámbienlos con sus propias palabras.
  - Alrededor hay un tablero con los 12 dispensadores, los indicadores, los mensajes aceptados y rechazados y los últimos eventos del receptor.
  - La simulación va a ×600 mientras el edificio está abierto y a ×3600 de noche, para que el público vea pasar el día.
  - Si alguien arrastra la maqueta, la cámara espera unos segundos y retoma sola. Un clic en un dispensador (en la maqueta o en el tablero) abre su detalle.
  - Teclas: **◀ ▶** cambian de escena, **Espacio** pausa el recorrido y **Esc** sale. Con el mouse quieto, los controles y el cursor se esconden.
  - Funciona también en modo en vivo: el reloj sigue la hora real.
- **Vista:** *Todos* o un piso (1–6), *Separar pisos* (vista explotada), *Día y noche* y *Vista inicial*.
  Arrastra para girar y usa la rueda o el pellizco para acercar.
  - Al elegir un piso, los de encima se apartan y los de debajo quedan como contexto.
  - *Día y noche:* el sol, el cielo y las luces siguen la hora simulada (en vivo, la hora real). Apagado, la luz queda fija a media mañana.
- **Qué muestra la maqueta:**
  - Sobre cada baño, un tubo con el jabón (el último valor válido) y la marca de 30 %. Si está *bajo* o *vacío*, el tubo tiene un halo que late; si hay que *revisar*, giran unos arcos morados.
  - En la pared, el dispensador con su ventana de nivel, el LED de estado y el HC-SR04 encima.
  - Cada mensaje MQTT viaja como una luz desde el dispensador hasta el nodo **Broker MQTT**: azul si el receptor lo acepta, rojo si lo rechaza.
- **Clic en un baño** (o en su etiqueta): abre el detalle. Ahí ves el último valor válido, el nivel real, el historial, el último JSON y los eventos de ese baño, y puedes activar fallas.
- **Velocidad:** pausa, ×60, ×600, ×3600.
- **Aseo:** la estrategia se elige arriba (con sensores, rondas cada 4 h o rondas 2 veces al día).
- **Pestañas:**
  - *Resumen:* indicadores y *Comparar 7 días*.
  - *Aseo:* la lista del receptor.
  - *Registro:* los eventos del receptor.
  - *Supuestos:* los valores de la configuración.
- **Fallas por dispensador** (en el detalle):

  | Falla | Qué hace | Lo detecta |
  |---|---|---|
  | Sensor dañado | reporta 0 % | R8 |
  | Espuma | la lectura sube unos 12 puntos | R7 |
  | Obstrucción | lectura imposible, ~116 % | R6 |
  | Sin energía | deja de enviar | "sin dato" |
  | Aviso falso | firmado con `clave-inventada` | R3 |

### Momento 3: dónde está cada paso

Cada escena de **Presentar** es un paso. Para las capturas del PDF, pausen con **Espacio** en cada una.

| Paso | Escena | Qué se ve | Para mostrarlo a mano, fuera de la presentación |
|---|---|---|---|
| 1. La idea | Vuelta al edificio | Problema, quién lo usa y qué se mide, sin nombrar aparatos | — |
| 2. El dato | Primer plano de d2 | Aparato (ESP32-C3 + HC-SR04), valor, hora y el JSON de 7 campos tal como llega; dice si es simulado o de Wokwi | Detalle de un baño → *Último mensaje auténtico* |
| 3. El viaje del dato | El broker | ESP32 → Wi-Fi → broker MQTT → gemelo, con el tema. Muestra lo corregido del Momento 2 si está escrito en `src/config/presentacion.js` | Pestaña *Registro*; botón *En vivo* con Wokwi |
| 4. Qué hacemos con el dato | Un piso desde arriba | Dónde se guarda, el límite de 30 %, las 8 reglas y el estado seguro («sin dato», nunca 0 %) | Pestaña *Supuestos* |
| 5. La decisión | El personal de aseo | La lista de aseo del momento y lo que está haciendo aseo | Pestaña *Aseo* |
| 6. Cuando algo falla | Primer plano de d3 | Prueba real: se activa la obstrucción, el sensor marca ~116 %, R6 lo rechaza (mensaje rojo) y aseo sigue usando el último valor válido. La falla se apaga al salir de la escena | Detalle de un baño → *Fallas simuladas* (también *Sin energía* para la conexión caída) |
| 7. Seguridad y límites | Frente del edificio | Qué protege (firma, R5, solo escucha), qué no puede hoy y qué mejorarían | — |

**Lo que el gemelo no puede poner por ustedes:** qué corrigieron respecto al Momento 2 y el enlace al proyecto de Wokwi o al repositorio. Escríbanlos en `src/config/presentacion.js` (`correccionesMomento2` y `enlace`) y aparecen solos en los pasos 3 y 7.

## 4. Conectar con Wokwi (modo en vivo)

1. Abre tu proyecto de Wokwi (ESP32-C3 + HC-SR04). Debe publicar en `broker.hivemq.com`, en el tema
   `ucc7788/jabon/bano-bloque-b-d2`, el JSON de 7 campos firmado con `clave-prueba-bano-bloque-b-d2`.
2. Inicia la simulación en Wokwi.
3. En el gemelo, pulsa **En vivo**. El gemelo se conecta a `wss://broker.hivemq.com:8884/mqtt` y se
   suscribe a `ucc7788/jabon/#`. **Solo escucha: nunca publica.**
4. Desde ese momento:
   - `bano-bloque-b-d2` (piso 1, hombres) deja de simularse y muestra lo que manda el ESP32, validado con R1–R8.
   - El reloj pasa a la **hora real** y los indicadores vuelven a cero. Los otros 11 baños siguen simulados, a ×1.
   - Para d2 rigen los tiempos de la demo: **sin dato a los 45 s** y **confirmación de recarga de 2 min**.
   - Se ignoran los mensajes de `bano-bloque-a-d1`.
5. Para simular una recarga: en el detalle de d2, pulsa **Confirmar recarga** y *después* acerca el objeto
   en el HC-SR04 de Wokwi (4 cm = lleno). Si subes el nivel sin confirmar, R7 lo rechaza.
   **Marcar revisado** quita el estado "revisar".

**Cosas a revisar si no llega nada:**

- **Hora:** R5 rechaza mensajes con más de 60 s de adelanto o más de 15 min de antigüedad. El ESP32 debe
  tomar la hora por NTP con zona `-05:00`, y el reloj del computador debe estar en hora.
- **Latido:** "sin dato" llega a los 45 s, así que el ESP32 debe enviar al menos un latido cada 15 s en
  la demo. Si tu sketch usa el latido normal de 5 min, sube `receptor.envivo.sinDatoS` en
  `src/config/supuestos.js`.
- **Red:** la tarjeta *Modo en vivo* (pestaña Resumen) muestra el estado de la conexión, los mensajes
  recibidos e ignorados, y el último JSON con su resultado.

## 5. Cambiar los supuestos

Todo está en **`src/config/supuestos.js`**: guarda el archivo y la página se recarga sola con `npm run dev`.
La pestaña *Supuestos* muestra los valores en uso.

| Bloque | Qué controla |
|---|---|
| `jabon` | ml por uso (0,9), capacidad (1000 ml), nivel inicial |
| `afluencia` | usos por hora en la hora pico, perfil por hora, factor por piso (el piso 1 es el más concurrido) |
| `horario` | 6:00–22:00, domingo cerrado, sábado con factor 0,3 |
| `dispositivo` | 4 cm / 20 cm, tolerancia de 3 puntos, cambio mínimo de 2, latidos de 5 min / 30 s, ruido |
| `fallas` | cuánto sube la espuma, la lectura con obstrucción, cada cuánto llega el aviso falso |
| `receptor` | umbrales, límites de R5/R7/R8, sin dato (3 latidos), confirmación de recarga y tiempos en vivo |
| `aseo` | personas, velocidad, ascensor, duración de recarga y revisión, horas de las rondas |
| `envivo` | URL del broker, suscripción, id en vivo, ids ignorados |
| `modeloGlb` | ruta opcional a un `.glb` dentro de `public/` |

## 6. Estructura del código

```
src/
├─ config/supuestos.js   ← todos los supuestos
├─ modelo/               ← simulación y receptor, sin DOM (se prueba con Vitest)
│  ├─ hmac.js            SHA-256 y HMAC-SHA256 síncronos
│  ├─ contrato.js        JSON de 7 campos, firma, momento con -05:00
│  ├─ sensor.js          distancia → nivel (round de Arduino, tolerancia de 3 puntos)
│  ├─ dispositivo.js     ESP32 simulado: cuándo envía y fallas
│  ├─ receptor.js        R1–R8, estados, sin dato, lista para aseo, textos del registro
│  ├─ afluencia.js       usos según hora, día y piso
│  ├─ edificio.js        planta, ids y rutas por pasillo y ascensor
│  ├─ aseo.js            3 estrategias
│  ├─ simulacion.js      reloj, pasos de 10 s, indicadores
│  └─ comparar.js        7 días × 3 estrategias
├─ escena/               ← Three.js
│  ├─ escena.js          cámara, vistas, clic, intro y el cuadro de cada frame
│  ├─ edificio3d.js      pisos: losas, fachada de vidrio, columnas, baños y aulas
│  ├─ entorno.js         plataforma, plaza, árboles, faroles y la base con rejilla
│  ├─ cielo.js           sol, luna, cielo y estrellas según la hora
│  ├─ medidor.js         dispensador y tubo de jabón (shader de líquido)
│  ├─ paquetes.js        mensajes MQTT en vuelo y el nodo del broker
│  ├─ personas.js        usuarios de los baños y personal de aseo
│  ├─ postproceso.js     oclusión ambiental, bloom y calidad adaptable
│  ├─ texturas.js        baldosas, madera y adoquines dibujados en canvas
│  └─ paleta.js, glb.js  colores de cada tema y cargador .glb
├─ interfaz/             ← DOM: paneles, detalle, gráficas, comparación (en un Web Worker), vista 2D sin WebGL
│  └─ presentacion.js    modo presentación: los 7 pasos del Momento 3 (textos en config/presentacion.js, estilos en src/presentacion.css)
├─ envivo/mqtt.js        ← mqtt.js, solo suscripción
└─ main.js
test/                    ← pruebas
```

La escena y la interfaz solo **leen** el estado del modelo. El modelo no sabe que existen.

## 7. Receptor: reglas y textos

| Regla | Comprueba |
|---|---|
| R1 | JSON legible |
| R2 | los 7 campos; `valor` y `version` enteros (no `null`, no `25.0`) |
| R3 | id registrado, tema `ucc7788/jabon/<id>`, firma HMAC correcta |
| R4 | `variable = nivel_jabon`, `unidad = %`, `version = 1` |
| R5 | ISO con zona, ≤ 60 s en el futuro, ≤ 15 min de antigüedad, posterior al último auténtico |
| R6 | 0 ≤ valor ≤ 100 |
| R7 | no sube más de 5 puntos sobre el mínimo desde la última recarga, salvo recarga confirmada |
| R8 | no cae a 0 de golpe si el último válido era 10 % o más |

- **Si falla R1, R2 o R3:** no se atribuye a ningún dispensador y no cuenta como señal de vida.
- **Si falla de R4 a R8:** el dispensador sigue vivo, pasa a "revisar" y para aseo vale el último valor válido.

**Estados:**

- normal: 30 % o más
- bajo: de 5 a 29 %
- vacío: menos de 5 %
- sin dato: 3 latidos sin ningún mensaje auténtico. Nunca se toma como 0 %.

Los textos del registro están juntos en `TEXTOS`, al comienzo de `src/modelo/receptor.js`. Por ejemplo:

```
RECHAZADO bano-bloque-b-d2: R7 sube solo: 40 -> 46 sin recarga confirmada (mínimo desde la última recarga: 40)
RECHAZADO ucc7788/jabon/bano-bloque-b-d2: R3 firma no coincide
```

> Este proyecto se escribió sin tener `receptor.py` a mano: los textos siguen el ejemplo
> `"RECHAZADO bano-bloque-b-d2: R7 sube solo: ..."`. Si quieres que coincidan letra por letra,
> ajústalos en `TEXTOS`.

## 8. Decisiones que no venían en la especificación

- **Sin dato en simulación:** 3 veces el latido esperado según el último valor auténtico (15 min, o 90 s si
  está por debajo de 30 %). En vivo, 45 s fijos para d2.
- **Ritmo del latido:** el dispositivo decide si late cada 5 min o cada 30 s según el **último valor que
  envió**, que es el mismo que conoce el receptor. Así ninguno de los dos se adelanta al otro.
- **Confirmación de recarga en simulación:** 10 min (`receptor.confirmacionRecargaS`). Termina cuando el
  nivel, después de subir, vuelve a bajar, o cuando se vence.
- **Aseo:**
  - Una persona, de 6:00 a 22:00.
  - En todas las estrategias recarga solo si el nivel real está por debajo de 30 % y siempre confirma la
    recarga en el receptor.
  - Con sensores atiende primero *recargar* (vacíos primero), luego *revisar* y luego *sin dato*, y no
    vuelve al mismo baño antes de 60 min.
  - Al visitar un baño lo marca como revisado.
- **Horas sin jabón:** tiempo con un dispensador vacío mientras el edificio está abierto, sumado entre los 12 baños.
- **Comparar 7 días:** empieza el lunes a las 00:00, sin fallas y con la semilla actual. Los usos salen de un
  flujo aleatorio aparte, así que son idénticos en las 3 estrategias.
- **Personas animadas:** son representativas. Salen de los usos simulados, pero hay un tope de figuras en
  pantalla para que la escena siga fluida a ×3600.
- **HMAC:** SHA-256 y HMAC escritos en JavaScript (síncronos), en vez de `crypto.subtle` (asíncrono). Así la
  simulación da siempre el mismo resultado. Las pruebas lo comparan contra `node:crypto`.

## 9. (Opcional) Modelo .glb de Blender o SketchUp

En la pestaña *Supuestos* → **Modelo del edificio (.glb)**, carga tu archivo. También puedes ponerlo en
`public/modelos/edificio.glb` y definir `modeloGlb: '/modelos/edificio.glb'` en los supuestos.

- **Unidades:** metros, con el origen en el centro de la planta y el piso 1 en `y = 0`.
- **Pisos:** si los nodos se llaman `piso-1` … `piso-6`, funcionan la vista por piso y la vista explotada.
- **Posiciones:** los medidores, las personas y aseo usan las coordenadas de `src/modelo/edificio.js`.
  Ajústalas si tu planta es distinta.

## 10. Qué cubren las pruebas

`npm test` corre 42 pruebas:

- El vector de firma obligatorio (`270e0a5d…842269f`) y la comparación con `node:crypto`.
- El formato del momento con `-05:00`.
- R1–R8: en cada regla, al menos un caso que pasa y uno que falla.
- La subida aceptada con recarga confirmada, el fin de la confirmación y su vencimiento (10 min / 2 min).
- Estados y lista para aseo.
- "Sin dato":
  - a los 15 min con latido normal, y a los 90 s por debajo de 30 %;
  - R1–R3 no cuentan como señal de vida y R4–R8 sí;
  - en vivo, a los 45 s.
- Sensor (tolerancia de 3 puntos) y dispositivo (cuándo envía, sin energía, aviso falso).
- Comparar 7 días: los mismos usos totales en las 3 estrategias, y el mismo resultado con la misma semilla.
- Simulación:
  - aseo recarga y confirma sin disparar R7;
  - el domingo no hay usos;
  - cada falla dispara su regla;
  - el modo en vivo deja de simular d2.
