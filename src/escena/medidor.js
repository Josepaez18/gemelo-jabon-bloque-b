// Dispensador en la pared (con ventana de nivel, LED y HC-SR04) y medidor flotante
// encima del baño: tubo de vidrio con jabón líquido animado, marca de 30 %, avisos y etiqueta.
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { geometriaBano } from '../modelo/edificio.js';
import { NOMBRE_ESTADO } from '../modelo/receptor.js';

const ALTO = 1.15;
const RADIO = 0.26;
const BASE = 0.08;

const vertexLiquido = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vVista;
  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vVista = -mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentLiquido = /* glsl */ `
  uniform float uNivel;
  uniform float uAlto;
  uniform vec3 uColor;
  uniform float uBrillo;
  uniform float uOpacidad;
  uniform float uTiempo;
  uniform vec2 uInclinacion;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vVista;
  void main() {
    float h = uNivel * uAlto;
    float ola = 0.009 * sin(vLocal.x * 22.0 + uTiempo * 2.6) + 0.007 * sin(vLocal.z * 19.0 - uTiempo * 2.1)
      + uInclinacion.x * vLocal.x + uInclinacion.y * vLocal.z;
    float sup = h + ola;
    if (h < 0.003 || vLocal.y > sup) discard;
    vec3 col;
    if (gl_FrontFacing) {
      float t = clamp(vLocal.y / max(h, 0.01), 0.0, 1.0);
      col = uColor * mix(0.5, 1.0, t);
      vec3 n = normalize(vNormal);
      vec3 v = normalize(vVista);
      float fr = pow(1.0 - abs(dot(n, v)), 2.5);
      col += uColor * fr * 0.9 + vec3(fr * 0.1);
      col += vec3(0.22) * smoothstep(0.5, 0.85, n.x);
      col += uColor * smoothstep(sup - 0.05, sup, vLocal.y) * 0.7;
      // Burbujas que suben.
      float a = atan(vLocal.z, vLocal.x);
      vec2 q = vec2(a * 2.6, vLocal.y * 9.0 - uTiempo * 0.55);
      vec2 celda = floor(q);
      vec2 f = fract(q) - 0.5;
      float r = fract(sin(dot(celda, vec2(12.9898, 78.233))) * 43758.5453);
      float b = smoothstep(0.17, 0.1, length(f + (r - 0.5) * 0.4)) * step(0.7, r) * step(vLocal.y, sup - 0.04);
      col += vec3(b * 0.4);
    } else {
      col = uColor * 1.2 + vec3(0.07); // superficie del líquido vista desde arriba
    }
    gl_FragColor = vec4(col * uBrillo, uOpacidad);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const vertexAura = /* glsl */ `
  varying float vAlto;
  void main() {
    vAlto = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentAura = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFuerza;
  varying float vAlto;
  void main() {
    float a = pow(1.0 - vAlto, 1.6) * uFuerza;
    gl_FragColor = vec4(uColor * 1.1, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const geo = {
  tubo: new THREE.CylinderGeometry(RADIO, RADIO, ALTO, 40, 1, true),
  domo: new THREE.SphereGeometry(RADIO, 40, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  liquido: new THREE.CylinderGeometry(RADIO - 0.03, RADIO - 0.03, ALTO, 40, 1, true).translate(0, ALTO / 2, 0),
  base: new THREE.CylinderGeometry(RADIO + 0.07, RADIO + 0.11, BASE, 40),
  aro: new THREE.TorusGeometry(RADIO + 0.006, 0.02, 8, 40).rotateX(Math.PI / 2),
  anillo: new THREE.TorusGeometry(RADIO + 0.09, 0.016, 8, 48).rotateX(Math.PI / 2),
  umbral: new THREE.TorusGeometry(RADIO + 0.02, 0.018, 8, 40).rotateX(Math.PI / 2),
  pulso: new THREE.RingGeometry(RADIO + 0.05, RADIO + 0.12, 40).rotateX(-Math.PI / 2),
  aura: new THREE.CylinderGeometry(RADIO + 0.13, RADIO + 0.13, ALTO + 0.15, 40, 1, true).translate(0, (ALTO + 0.15) / 2, 0),
  arco: new THREE.TorusGeometry(RADIO + 0.12, 0.018, 6, 20, Math.PI * 0.42).rotateX(Math.PI / 2),
  cuerpo: new RoundedBoxGeometry(0.12, 0.28, 0.22, 2, 0.025),
  ventana: new THREE.BoxGeometry(0.008, 0.17, 0.1),
  nivel: new THREE.BoxGeometry(0.01, 0.16, 0.088).translate(0, 0.08, 0),
  led: new THREE.SphereGeometry(0.02, 10, 8),
  placa: new THREE.BoxGeometry(0.1, 0.012, 0.18),
  ojo: new THREE.CylinderGeometry(0.02, 0.02, 0.028, 12),
};

export class Medidor {
  constructor(info, compartidos) {
    this.info = info;
    this.id = info.id;
    const g = geometriaBano(info.genero);
    const s = g.lado;
    this.grupo = new THREE.Group();
    this.grupo.name = `medidor-${info.corto}`;

    // Dispensador físico en la pared: ventana con el nivel, LED y el HC-SR04 encima.
    const disp = (this.dispensador = new THREE.Group());
    disp.position.set(g.dispensador.x, g.dispensador.y, g.dispensador.z);
    const cuerpo = new THREE.Mesh(geo.cuerpo, compartidos.cuerpoDispensador);
    cuerpo.castShadow = true;
    const ventana = new THREE.Mesh(geo.ventana, compartidos.ventana);
    ventana.position.set(s * 0.0605, 0.01, 0);
    this.matNivel = new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0x000000, emissiveIntensity: 0.6, roughness: 0.3 });
    this.nivelVentana = new THREE.Mesh(geo.nivel, this.matNivel);
    this.nivelVentana.position.set(s * 0.066, 0.01 - 0.08, 0);
    this.matLed = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.2 });
    const led = new THREE.Mesh(geo.led, this.matLed);
    led.position.set(s * 0.062, -0.105, 0.06);
    const placa = new THREE.Mesh(geo.placa, compartidos.placa);
    placa.position.set(0, 0.146, 0);
    const ojos = [-0.045, 0.045].map((z) => {
      const o = new THREE.Mesh(geo.ojo, compartidos.metal);
      o.position.set(0, 0.166, z);
      return o;
    });
    disp.add(cuerpo, ventana, this.nivelVentana, led, placa, ...ojos);
    this.grupo.add(disp);

    // Medidor flotante.
    const m = (this.medidor = new THREE.Group());
    m.position.set(g.medidor.x, g.medidor.y, g.medidor.z);
    const base = new THREE.Mesh(geo.base, compartidos.baseMedidor);
    base.position.y = BASE / 2;
    base.castShadow = true;
    this.matAnillo = new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0x888888, emissiveIntensity: 1.5, roughness: 0.4 });
    const anillo = (this.anillo = new THREE.Mesh(geo.anillo, this.matAnillo));
    anillo.position.y = BASE;

    this.uLiquido = {
      uNivel: { value: 0 },
      uAlto: { value: ALTO },
      uColor: { value: new THREE.Color(0x888888) },
      uBrillo: { value: 1 },
      uOpacidad: { value: 1 },
      uTiempo: { value: Math.random() * 10 },
      uInclinacion: { value: new THREE.Vector2() },
    };
    this.matLiquido = new THREE.ShaderMaterial({
      uniforms: this.uLiquido,
      vertexShader: vertexLiquido,
      fragmentShader: fragmentLiquido,
      side: THREE.DoubleSide,
    });
    const liquido = new THREE.Mesh(geo.liquido, this.matLiquido);
    liquido.position.y = BASE;
    const tubo = new THREE.Mesh(geo.tubo, compartidos.vidrio);
    tubo.position.y = BASE + ALTO / 2;
    tubo.renderOrder = 2;
    const domo = new THREE.Mesh(geo.domo, compartidos.vidrio);
    domo.position.y = BASE + ALTO;
    domo.renderOrder = 2;
    const aro = new THREE.Mesh(geo.aro, compartidos.baseMedidor);
    aro.position.y = BASE + ALTO;
    const umbral = new THREE.Mesh(geo.umbral, compartidos.umbral);
    umbral.position.y = BASE + ALTO * 0.3;

    this.matPulso = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.pulso = new THREE.Mesh(geo.pulso, this.matPulso);
    this.pulso.position.y = BASE + 0.01;

    // Aura de alerta (bajo o vacío) y arcos de "revisar".
    this.uAura = { uColor: { value: new THREE.Color() }, uFuerza: { value: 0 } };
    this.aura = new THREE.Mesh(
      geo.aura,
      new THREE.ShaderMaterial({
        uniforms: this.uAura,
        vertexShader: vertexAura,
        fragmentShader: fragmentAura,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.aura.visible = false;
    this.aura.renderOrder = 4;
    this.matRevisar = new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x7c3aed, emissiveIntensity: 2 });
    this.revisar = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const a = new THREE.Mesh(geo.arco, this.matRevisar);
      a.rotation.y = (k * Math.PI * 2) / 3;
      this.revisar.add(a);
    }
    this.revisar.position.y = BASE + ALTO * 0.62;
    this.revisar.visible = false;
    m.add(base, anillo, liquido, tubo, domo, aro, umbral, this.pulso, this.aura, this.revisar);
    this.grupo.add(m);

    // Etiqueta HTML.
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'etiqueta-medidor';
    this.el.dataset.id = info.id;
    this.el.setAttribute('aria-label', `Abrir detalle de ${info.nombre}`);
    this.el.innerHTML =
      '<span class="em-punto" aria-hidden="true"></span><span class="em-id"></span><span class="em-valor"></span>' +
      '<span class="em-barra" aria-hidden="true"><i></i></span><span class="em-revisar" hidden>⚠</span>';
    this.elId = this.el.querySelector('.em-id');
    this.elValor = this.el.querySelector('.em-valor');
    this.elBarra = this.el.querySelector('.em-barra i');
    this.elRevisar = this.el.querySelector('.em-revisar');
    this.elId.textContent = info.corto;
    this.etiqueta = new CSS2DObject(this.el);
    this.etiqueta.position.set(0, BASE + ALTO + RADIO + 0.12, 0);
    this.etiqueta.center.set(0.5, 1);
    m.add(this.etiqueta);

    this.estado = 'esperando';
    this.nivelMostrado = 0;
    this.nivelObjetivo = 0;
    this.tPulso = 1;
    this.t = Math.random() * 10;
    this.oleaje = 0;
    this.activo = false;
    this.textoPrevio = '';
    this.brillo = 1;
  }

  // s: estado del receptor (estadoDe). colores: { estado, revisar }; brillo: multiplicador del tema.
  actualizar(s, colores, enVivo, brillo = 1) {
    const color = colores.estado[s.estado];
    this.estado = s.estado;
    this.brillo = brillo;
    this.uLiquido.uColor.value.setHex(color);
    const apagado = s.estado === 'sin_dato' || s.estado === 'esperando';
    this.matLiquido.transparent = apagado;
    this.uLiquido.uOpacidad.value = apagado ? 0.35 : 1;
    this.uLiquido.uBrillo.value = apagado ? 0.8 : brillo;
    this.matNivel.color.setHex(color);
    this.matNivel.emissive.setHex(color);
    this.matLed.color.setHex(color);
    this.matLed.emissive.setHex(s.revisar ? colores.revisar : color);
    this.matAnillo.color.setHex(color);
    this.matAnillo.emissive.setHex(color);
    this.uAura.uColor.value.setHex(color);
    this.matRevisar.color.setHex(colores.revisar);
    this.matRevisar.emissive.setHex(colores.revisar);
    this.revisar.visible = s.revisar;
    const objetivo = s.valor === null ? 0 : s.valor / 100;
    // Una recarga hace que el jabón se agite un poco.
    if (objetivo - this.nivelObjetivo > 0.08) this.oleaje = Math.min(1, this.oleaje + 0.9);
    this.nivelObjetivo = objetivo;

    const valor = s.estado === 'esperando' ? 'esperando' : s.estado === 'sin_dato' ? 'sin dato' : `${s.valor} %`;
    const texto = `${s.estado}|${valor}|${s.revisar}|${enVivo}`;
    if (texto !== this.textoPrevio) {
      this.textoPrevio = texto;
      this.elValor.textContent = valor;
      this.elBarra.style.transform = `scaleX(${(apagado ? 0 : s.valor ?? 0) / 100})`;
      this.elRevisar.hidden = !s.revisar;
      this.el.dataset.estado = s.estado;
      this.el.classList.toggle('revisar', s.revisar);
      this.el.classList.toggle('envivo', enVivo);
      this.el.title = `${this.info.nombre}: ${NOMBRE_ESTADO[s.estado]}${s.revisar ? ' · revisar' : ''}${enVivo ? ' · en vivo (Wokwi)' : ''}`;
    }
  }

  pulsar(aceptado, colores) {
    this.matPulso.color.setHex(aceptado ? colores.estado.normal : colores.estado.vacio);
    this.tPulso = 0;
  }

  // cerca: si la cámara está tan próxima como para distinguir el dispensador de la pared.
  animar(dt, cerca = true) {
    this.dispensador.visible = cerca;
    this.t += dt;
    this.nivelMostrado += (this.nivelObjetivo - this.nivelMostrado) * Math.min(1, dt * 5);
    const u = this.uLiquido;
    u.uNivel.value = Math.max(0, this.nivelMostrado);
    u.uTiempo.value = this.t;
    this.oleaje *= Math.exp(-dt * 1.6);
    u.uInclinacion.value.set(Math.sin(this.t * 7.5), Math.cos(this.t * 6.1)).multiplyScalar(this.oleaje * 0.28);
    this.nivelVentana.scale.y = Math.max(0.001, this.nivelMostrado);

    this.pulso.visible = this.tPulso < 1;
    if (this.tPulso < 1) {
      this.tPulso = Math.min(1, this.tPulso + dt * 1.6);
      const k = this.tPulso;
      this.pulso.scale.setScalar(1 + k * 1.8);
      this.matPulso.opacity = (1 - k) * 0.85;
    }

    // Aura: rápida si está vacío, lenta si está bajo.
    const vacio = this.estado === 'vacio';
    const bajo = this.estado === 'bajo';
    this.aura.visible = vacio || bajo;
    if (this.aura.visible) {
      const f = vacio ? 0.42 + 0.3 * Math.sin(this.t * 6) : 0.2 + 0.1 * Math.sin(this.t * 2.2);
      this.uAura.uFuerza.value = f;
    }
    if (this.revisar.visible) this.revisar.rotation.y = this.t * 1.4;
    const latido = this.activo ? 1 + 0.12 * Math.sin(this.t * 5) : 1;
    this.anillo.scale.setScalar(latido);
    this.matAnillo.emissiveIntensity = (this.activo ? 3 : 1.4) * this.brillo;
  }

  // Punto de salida de los mensajes MQTT (sobre el HC-SR04), en coordenadas del mundo.
  salida(destino) {
    return this.dispensador.localToWorld(destino.set(0, 0.2, 0));
  }

  seleccionado(si) {
    this.activo = si;
    this.el.classList.toggle('activo', si);
  }
}
