// Escena 3D del gemelo: maqueta del Bloque B, medidores, personas, aseo y mensajes MQTT.
// Solo lee el estado de la simulación; nunca lo modifica.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { estaAbierto, horaLocal } from '../modelo/afluencia.js';
import { ALTO_PISO, DISPENSADORES, PISOS, PLANTA, recinto } from '../modelo/edificio.js';
import { Cielo } from './cielo.js';
import { TECHO, construirPiso, crearMateriales, pintarMateriales } from './edificio3d.js';
import { Entorno } from './entorno.js';
import { cargarModelo, nodosPorPiso } from './glb.js';
import { Medidor } from './medidor.js';
import { COLOR_ESTADO, COLOR_REVISAR, PALETAS } from './paleta.js';
import { Broker, Paquetes } from './paquetes.js';
import { FiguraAseo, Personas } from './personas.js';
import { Postproceso, calidadGuardada, calidadPedida } from './postproceso.js';
import { crearTexturas } from './texturas.js';

const SEPARACION = 4.5; // metros extra entre pisos en la vista explotada
const ELEVAR = 36; // metros que suben los pisos de encima al enfocar uno
const ESCALA_REDUCIDA = 0.85;
const DISPENSADOR_VISIBLE_M2 = 42 * 42; // más lejos, el dispensador de la pared es un punto: no se dibuja
const ETIQUETAS_RECINTO = {
  aseo: 'Cuarto de aseo',
  mujeres: 'Baño de mujeres',
  hombres: 'Baño de hombres',
  ascensor: 'Ascensor',
  escalera: 'Escalera',
  sala: 'Sala de profesores',
};

function suavizar(k) {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

function salida(k) {
  return 1 - Math.pow(1 - k, 3);
}

// Volumen del baño seleccionado: paredes que se desvanecen hacia arriba y piso iluminado.
const vertexResalte = /* glsl */ `
  uniform float uAlto;
  varying vec3 vN;
  varying float vY;
  void main() {
    vN = normal;
    vY = position.y / uAlto + 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentResalte = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFuerza;
  varying vec3 vN;
  varying float vY;
  void main() {
    if (vN.y > 0.5) discard;
    float a = vN.y < -0.5 ? 0.55 : pow(1.0 - vY, 2.2);
    gl_FragColor = vec4(uColor, a * uFuerza);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Barrido de "escaneo": un plano que recorre el edificio de abajo arriba, con borde brillante y rejilla.
const vertexEscaner = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vMundo;
  void main() {
    vUv = uv;
    vec4 m = modelMatrix * vec4(position, 1.0);
    vMundo = m.xz;
    gl_Position = projectionMatrix * viewMatrix * m;
  }
`;
const fragmentEscaner = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFuerza;
  uniform vec2 uTamano;
  varying vec2 vUv;
  varying vec2 vMundo;
  void main() {
    vec2 d = min(vUv, 1.0 - vUv) * uTamano; // metros hasta el borde
    float borde = 1.0 - smoothstep(0.0, 0.45, min(d.x, d.y));
    vec2 q = abs(fract(vMundo / 2.0) - 0.5) / fwidth(vMundo / 2.0);
    float rejilla = 1.0 - min(min(q.x, q.y), 1.0);
    float a = borde * 0.85 + rejilla * 0.22 + 0.05;
    gl_FragColor = vec4(uColor * 1.3, a * uFuerza);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Escena {
  constructor(contenedor, { alSeleccionar } = {}) {
    this.contenedor = contenedor;
    this.alSeleccionar = alSeleccionar;
    this.tema = 'claro';
    this.paleta = PALETAS.claro;
    this.piso = null;
    this.separar = false;
    this.explosion = 0;
    this.seleccion = null;
    this.hover = null;
    this.transicion = null;
    this.ciclo = true;
    this.t = 0;
    this.ultimoCuadro = performance.now();
    this.auto = null;
    this.ultimaInteraccion = -Infinity;
    this.cuentaSombra = 0;
    this.cadaSombra = 1;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }) /* el antialias lo pone el post-procesado */);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false; // se actualiza a mano, no en cada cuadro (ver cadaSombra)
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.domElement.className = 'lienzo-3d';
    contenedor.appendChild(r.domElement);

    this.css = new CSS2DRenderer();
    this.css.domElement.className = 'capa-etiquetas';
    contenedor.appendChild(this.css.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camara = new THREE.PerspectiveCamera(38, 1, 0.5, 2000);
    this.controles = new OrbitControls(this.camara, r.domElement);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.08;
    this.controles.maxPolarAngle = Math.PI * 0.48;
    this.controles.minDistance = 6;
    this.controles.maxDistance = 260;
    this.controles.addEventListener('start', () => {
      this.transicion = null;
      this.ultimaInteraccion = performance.now();
    });
    this.controles.addEventListener('end', () => (this.ultimaInteraccion = performance.now()));

    this.texturas = crearTexturas(r);
    this.cielo = new Cielo(this.scene);
    this.entorno = new Entorno(this.scene, this.paleta, this.texturas);
    this.crearMateriales();
    this.crearPisos();
    this.personas = new Personas(this.scene);
    this.figuras = [];
    this.crearCabina();
    this.broker = new Broker(this.scene);
    this.paquetes = new Paquetes(this.scene, this.broker);
    this.crearEscaner();
    this.vTmp = new THREE.Vector3();
    this.vBroker = new THREE.Vector3();

    const nivel = calidadPedida();
    const inicial = nivel ?? calidadGuardada(r) ?? 'alta';
    this.calidadRenderer(inicial);
    this.post = new Postproceso(r, this.scene, this.camara, {
      nivel,
      inicial,
      alCambiar: (n) => {
        this.calidadRenderer(n);
        this.redimensionar();
      },
    });

    this.setTema('claro');
    this.escucharPuntero();
    this.redimensionar();
    this.observador = new ResizeObserver(() => this.redimensionar());
    this.observador.observe(contenedor);
    this.vistaInicial(true);
    this.iniciarIntro();
  }

  calidadRenderer(nivel) {
    // El sol se mueve despacio: en equipos justos la sombra no necesita repintarse en cada cuadro.
    this.cadaSombra = nivel === 'alta' ? 1 : nivel === 'media' ? 2 : 3;
    const tope = nivel === 'alta' ? 2 : 1;
    // Por debajo de alta la maqueta se dibuja un poco más pequeña y se estira; el texto sigue nítido.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tope) * (nivel === 'alta' ? 1 : ESCALA_REDUCIDA));
    document.documentElement.classList.toggle('calidad-reducida', nivel !== 'alta');
    const lado = nivel === 'baja' ? 1024 : 2048;
    const sombra = this.cielo.sol.shadow;
    if (sombra.mapSize.x !== lado) {
      sombra.mapSize.set(lado, lado);
      sombra.map?.dispose();
      sombra.map = null;
    }
  }

  crearMateriales() {
    const p = this.paleta;
    this.mats = crearMateriales(p, this.texturas);
    this.compartidos = {
      vidrio: new THREE.MeshPhysicalMaterial({
        color: 0xffffff, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.8,
      }),
      baseMedidor: new THREE.MeshStandardMaterial({ color: 0x3b4352, roughness: 0.35, metalness: 0.6 }),
      umbral: new THREE.MeshStandardMaterial({ color: 0x111827, emissive: 0x000000, roughness: 0.4 }),
      cuerpoDispensador: new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.35 }),
      ventana: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.1, metalness: 0.2 }),
      placa: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 }),
      metal: this.mats.metal,
    };
    this.matInvisible = new THREE.MeshBasicMaterial({ visible: false });
    this.matContorno = new THREE.LineBasicMaterial({ color: p.seleccion, transparent: true, opacity: 0.9 });
    const resalte = (fuerza) =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(p.seleccion) }, uFuerza: { value: fuerza }, uAlto: { value: TECHO - 0.1 } },
        vertexShader: vertexResalte,
        fragmentShader: fragmentResalte,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    this.matSeleccion = resalte(0.32);
    this.matHover = resalte(0.14);
  }

  crearPisos() {
    this.raizPisos = new THREE.Group();
    this.scene.add(this.raizPisos);
    this.pisos = [];
    this.medidores = new Map();
    this.selectores = [];
    this.resaltes = new Map();
    let tipo = null;
    for (let n = 1; n <= PISOS; n++) {
      const grupo = new THREE.Group();
      grupo.name = `piso-${n}`;
      let estatico;
      if (n === 1) estatico = construirPiso(1, this.mats);
      else {
        tipo ??= construirPiso(2, this.mats);
        estatico = tipo.clone();
      }
      grupo.add(estatico);

      const contornos = {};
      for (const info of DISPENSADORES.filter((d) => d.piso === n)) {
        const rc = recinto(info.genero);
        const caja = new THREE.BoxGeometry(rc.x1 - rc.x0, 3.1, rc.z1 - rc.z0);
        const selector = new THREE.Mesh(caja, this.matInvisible);
        selector.position.set((rc.x0 + rc.x1) / 2, 1.55, (rc.z0 + rc.z1) / 2);
        selector.userData = { id: info.id, piso: n };
        grupo.add(selector);
        this.selectores.push(selector);

        const alto = TECHO - 0.1;
        const volumen = new THREE.Mesh(new THREE.BoxGeometry(rc.x1 - rc.x0 - 0.2, alto, rc.z1 - rc.z0 - 0.2), this.matHover);
        volumen.position.set((rc.x0 + rc.x1) / 2, alto / 2 + 0.02, (rc.z0 + rc.z1) / 2);
        volumen.visible = false;
        volumen.renderOrder = 4;
        volumen.userData.sinAO = true;
        grupo.add(volumen);
        this.resaltes.set(info.id, { volumen, piso: n });

        const contorno = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(rc.x1 - rc.x0, alto, rc.z1 - rc.z0)), this.matContorno);
        contorno.position.copy(volumen.position);
        contorno.visible = false;
        grupo.add(contorno);
        contornos[info.id] = contorno;

        const m = new Medidor(info, this.compartidos);
        grupo.add(m.grupo);
        this.medidores.set(info.id, m);
      }

      const el = document.createElement('div');
      el.className = 'etiqueta-piso';
      el.innerHTML = `<span>Piso</span>${n}`;
      const etiqueta = new CSS2DObject(el);
      etiqueta.position.set(PLANTA.xMax + 0.7, 0.4, PLANTA.zMin - 0.7);
      etiqueta.center.set(0, 0.5);
      grupo.add(etiqueta);

      const recintos = new THREE.Group();
      recintos.visible = false;
      for (const rc of PLANTA.recintos) {
        const texto = ETIQUETAS_RECINTO[rc.clave] ?? (rc.clave.startsWith('aula') ? `Aula ${n}0${rc.clave.slice(-1)}` : null);
        if (!texto) continue;
        const e = document.createElement('div');
        e.className = 'etiqueta-recinto';
        e.textContent = texto;
        const o = new CSS2DObject(e);
        o.position.set((rc.x0 + rc.x1) / 2, 0.1, rc.z0 > 0 ? rc.z1 - 0.8 : rc.z0 + 0.9);
        recintos.add(o);
      }
      grupo.add(recintos);

      this.raizPisos.add(grupo);
      this.pisos.push({ n, grupo, estatico, contornos, recintos, etiqueta, elevar: 0, caida: 0 });
    }
  }

  crearCabina() {
    const cabina = (this.cabina = new THREE.Group());
    const caja = new THREE.BoxGeometry(3.1, 2.3, 2.9);
    this.matCabina = new THREE.MeshPhysicalMaterial({ color: 0xcfe3f5, transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0.1, depthWrite: false, envMapIntensity: 1.5 });
    const vidrio = new THREE.Mesh(caja, this.matCabina);
    vidrio.renderOrder = 3;
    const marco = new THREE.LineSegments(new THREE.EdgesGeometry(caja), new THREE.LineBasicMaterial({ color: 0x8c96a3 }));
    this.matLuzCabina = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 1.6 });
    const luz = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 1.8), this.matLuzCabina);
    luz.position.y = 1.13;
    const piso = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.05, 2.85), this.mats.metal);
    piso.position.y = -1.13;
    piso.receiveShadow = true;
    cabina.add(vidrio, marco, luz, piso);
    cabina.position.set(-2.2, 1.17, -2.7);
    this.pisoCabina = 1;
    this.scene.add(cabina);
  }

  crearEscaner() {
    const ancho = PLANTA.xMax - PLANTA.xMin + 1.4;
    const fondo = PLANTA.zMax - PLANTA.zMin + 1.4;
    this.uEscaner = {
      uColor: { value: new THREE.Color() },
      uFuerza: { value: 0 },
      uTamano: { value: new THREE.Vector2(ancho, fondo) },
    };
    const malla = new THREE.Mesh(
      new THREE.PlaneGeometry(ancho, fondo).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: this.uEscaner,
        vertexShader: vertexEscaner,
        fragmentShader: fragmentEscaner,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    malla.renderOrder = 6;
    malla.visible = false;
    malla.userData.sinAO = true;
    this.scene.add(malla);
    this.escaner = { malla, cada: 16, fuerza: 0.45, t: 6 };
  }

  // Segundos entre pasadas del escáner (0 lo apaga) y su intensidad.
  setEscaner(cada, fuerza = this.escaner.fuerza) {
    this.escaner.cada = cada;
    this.escaner.fuerza = fuerza;
  }

  animarEscaner(segundos) {
    const e = this.escaner;
    const DURA = 3.4;
    e.t += segundos;
    if (!e.cada || this.intro) {
      e.malla.visible = false;
      return;
    }
    if (e.t > e.cada) e.t = 0;
    const k = e.t / DURA;
    e.malla.visible = k < 1;
    if (!e.malla.visible) return;
    const arriba = this.yPiso(this.piso ?? PISOS) + TECHO + 0.4;
    const s = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    e.malla.position.y = -0.2 + (arriba + 0.2) * s;
    this.uEscaner.uFuerza.value = Math.sin(Math.PI * k) * e.fuerza;
  }

  // --- Cámara automática (modo presentación) -------------------------------------

  // fn(segundos) → { pos, target, rapidez? }. Si alguien mueve la maqueta, la cámara espera unos segundos.
  setAuto(fn) {
    this.auto = fn;
    if (fn) this.transicion = null;
  }

  posicionMedidor(id, destino = new THREE.Vector3()) {
    return this.medidores.get(id).medidor.getWorldPosition(destino);
  }

  posicionBroker(destino = new THREE.Vector3()) {
    return destino.copy(this.broker.grupo.position);
  }

  posicionAseo(i, destino = new THREE.Vector3()) {
    const f = this.figuras[i];
    return f ? f.grupo.getWorldPosition(destino) : null;
  }

  // --- Tema --------------------------------------------------------------------

  setTema(tema) {
    this.tema = tema;
    const p = (this.paleta = PALETAS[tema]);
    pintarMateriales(this.mats, p);
    this.entorno.setTema(p);
    const oscuro = tema === 'oscuro';
    this.matContorno.color.setHex(p.seleccion);
    for (const m of [this.matSeleccion, this.matHover]) m.uniforms.uColor.value.setHex(p.seleccion);
    this.mats.vidrio.opacity = oscuro ? 0.13 : 0.16;
    this.compartidos.vidrio.opacity = oscuro ? 0.16 : 0.22;
    this.compartidos.umbral.color.setHex(oscuro ? 0xf8fafc : 0x111827);
    this.compartidos.umbral.emissive.setHex(oscuro ? 0x888888 : 0x000000);
    this.compartidos.baseMedidor.color.setHex(oscuro ? 0x9aa5b4 : 0x3b4352);
    this.post?.setBloom(p.brillo.bloom, p.brillo.umbralBloom);
    this.post?.setVineta(oscuro ? 0.38 : 0.2);
    this.broker.setColor(p.acento, oscuro ? 1.6 : 1);
    this.uEscaner.uColor.value.setHex(p.acento);
    this.colores = { estado: COLOR_ESTADO[tema], revisar: COLOR_REVISAR[tema] };
  }

  // Ciclo de día y noche según la hora simulada (o un día fijo a media mañana).
  setCiclo(si) {
    this.ciclo = si;
  }

  // --- Vistas -------------------------------------------------------------------

  yBase(n) {
    return (n - 1) * (ALTO_PISO + SEPARACION * this.explosion);
  }

  yPiso(n) {
    const p = this.pisos[n - 1];
    return this.yBase(n) + p.elevar + p.caida;
  }

  // Piso con el que se interactúa: etiquetas, personas y clic.
  pisoVisible(n) {
    return this.piso === null || this.piso === n;
  }

  // Al enfocar un piso, los de debajo siguen dibujados como contexto; los de encima se apartan.
  pisoDibujado(n) {
    return this.piso === null || n <= this.piso;
  }

  // mover: false deja la cámara donde está (la mueve el modo presentación).
  setVista({ piso = this.piso, separar = this.separar, mover = true } = {}) {
    this.piso = piso;
    this.separar = separar;
    for (const p of this.pisos) {
      p.recintos.visible = piso !== null && p.n === piso;
      this.etiquetasPiso(p);
    }
    this.encuadrar(mover);
  }

  etiquetasPiso(p) {
    const activo = this.pisoVisible(p.n);
    p.etiqueta.visible = activo;
    for (const m of this.medidores.values()) if (m.info.piso === p.n) m.etiqueta.visible = activo;
  }

  vistaInicial(inmediato = false) {
    this.piso = null;
    this.separar = false;
    for (const p of this.pisos) {
      p.recintos.visible = false;
      this.etiquetasPiso(p);
      if (inmediato) p.elevar = 0;
    }
    if (inmediato) this.explosion = 0;
    this.encuadrar(true, inmediato);
  }

  // Los pisos caen en su lugar uno tras otro y la cámara se acerca girando.
  iniciarIntro() {
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducido) return;
    // Va con el reloj real, no con los cuadros: en un equipo lento dura lo mismo.
    this.intro = { inicio: null, t: 0 };
    for (const p of this.pisos) p.caida = 30;
    const { centro, pos } = this.encuadre();
    const desde = pos.clone().sub(centro).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.9).multiplyScalar(1.35).add(centro);
    desde.y += 14;
    this.camara.position.copy(desde);
    this.controles.target.copy(centro);
    this.transicion = { k: 0, dur: 3.2, real: true, p0: desde, p1: pos, t0: centro.clone(), t1: centro };
  }

  avanzarIntro() {
    const it = this.intro;
    if (!it) return;
    // El reloj arranca en el primer cuadro, cuando ya se compilaron los shaders.
    it.inicio ??= performance.now();
    it.t = (performance.now() - it.inicio) / 1000;
    let fin = true;
    for (const p of this.pisos) {
      const k = Math.min(1, Math.max(0, (it.t - 0.25 - (p.n - 1) * 0.16) / 0.85));
      p.caida = (1 - salida(k)) * 30;
      p.grupo.userData.entro = k > 0;
      if (k < 1) fin = false;
    }
    if (fin) this.intro = null;
  }

  // Calcula dónde poner la cámara para ver lo que está visible.
  encuadre() {
    const ex = this.separar ? 1 : 0;
    const paso = ALTO_PISO + SEPARACION * ex;
    const aspecto = Math.max(0.3, this.camara.aspect);
    const fov = THREE.MathUtils.degToRad(this.camara.fov);
    const fovH = 2 * Math.atan(Math.tan(fov / 2) * aspecto);
    const ang = Math.min(fov, fovH) / 2;
    if (this.piso !== null) {
      const y = (this.piso - 1) * paso;
      const centro = new THREE.Vector3(0, y + 0.6, 0.5);
      const radio = 17.2;
      const dist = radio / Math.sin(ang);
      const dir = new THREE.Vector3(0.18, 1.0, -0.72).normalize();
      return { centro, pos: centro.clone().addScaledVector(dir, dist * 0.8) };
    }
    const alto = PISOS * ALTO_PISO + (PISOS - 1) * SEPARACION * ex;
    // El encuadre incluye el broker de arriba y deja aire abajo para la leyenda.
    const centro = new THREE.Vector3(0, alto / 2 + 1.5, 0);
    const radio = Math.hypot(16, 7, alto / 2 + 6);
    const dist = radio / Math.sin(ang);
    // Desde el lado de los baños: los medidores asoman sobre el antepecho en todos los pisos.
    const dir = new THREE.Vector3(0.62, 0.42, -1.0).normalize();
    return { centro, pos: centro.clone().addScaledVector(dir, dist) };
  }

  encuadrar(mover = true, inmediato = false) {
    if (!mover) return;
    const { centro, pos } = this.encuadre();
    if (inmediato) {
      this.camara.position.copy(pos);
      this.controles.target.copy(centro);
      this.controles.update();
      this.transicion = null;
      return;
    }
    this.transicion = {
      k: 0,
      dur: 0.9,
      p0: this.camara.position.clone(),
      p1: pos,
      t0: this.controles.target.clone(),
      t1: centro,
    };
  }

  seleccionar(id) {
    if (this.seleccion) {
      this.medidores.get(this.seleccion)?.seleccionado(false);
      for (const p of this.pisos) if (p.contornos[this.seleccion]) p.contornos[this.seleccion].visible = false;
    }
    this.seleccion = id;
    if (id) {
      this.medidores.get(id)?.seleccionado(true);
      for (const p of this.pisos) if (p.contornos[id]) p.contornos[id].visible = true;
    }
  }

  // --- Puntero ------------------------------------------------------------------

  escucharPuntero() {
    const lienzo = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const v = new THREE.Vector2();
    let inicio = null;
    const elegir = (ev) => {
      const r = lienzo.getBoundingClientRect();
      v.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, this.camara);
      const visibles = this.selectores.filter((s) => this.pisoVisible(s.userData.piso));
      return ray.intersectObjects(visibles, false)[0]?.object.userData.id ?? null;
    };
    lienzo.addEventListener('pointerdown', (ev) => (inicio = { x: ev.clientX, y: ev.clientY, t: performance.now() }));
    lienzo.addEventListener('pointerup', (ev) => {
      if (!inicio) return;
      const mov = Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y);
      const rapido = performance.now() - inicio.t < 600;
      inicio = null;
      if (mov < 6 && rapido) {
        const id = elegir(ev);
        if (id) this.alSeleccionar?.(id);
      }
    });
    let pendiente = false;
    lienzo.addEventListener('pointermove', (ev) => {
      if (pendiente || ev.pointerType !== 'mouse' || ev.buttons) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        this.hover = elegir(ev);
        lienzo.style.cursor = this.hover ? 'pointer' : '';
      });
    });
    lienzo.addEventListener('pointerleave', () => (this.hover = null));
    this.css.domElement.addEventListener('click', (ev) => {
      const b = ev.target.closest('.etiqueta-medidor');
      if (b) this.alSeleccionar?.(b.dataset.id);
    });
    this.css.domElement.addEventListener('pointerover', (ev) => {
      const b = ev.target.closest('.etiqueta-medidor');
      this.hover = b ? b.dataset.id : null;
    });
  }

  redimensionar() {
    const w = Math.max(1, this.contenedor.clientWidth);
    const h = Math.max(1, this.contenedor.clientHeight);
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.css.setSize(w, h);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  // --- Modelo .glb opcional --------------------------------------------------------

  async cargarGlb(fuente) {
    const gltf = await cargarModelo(fuente);
    const raiz = gltf.scene;
    raiz.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.modeloGlb?.removeFromParent();
    for (const p of this.pisos) p.glb?.removeFromParent();
    const porPiso = nodosPorPiso(raiz, PISOS);
    if (porPiso.size) {
      raiz.updateMatrixWorld(true);
      for (const p of this.pisos) {
        const nodo = porPiso.get(p.n);
        p.estatico.visible = !nodo;
        if (nodo) {
          // Se monta con el piso en su altura real, así el modelo conserva su posición.
          p.grupo.position.y = (p.n - 1) * ALTO_PISO;
          p.grupo.updateMatrixWorld(true);
          p.grupo.attach(nodo);
          p.glb = nodo;
        }
      }
      return { pisos: porPiso.size, separable: true };
    }
    for (const p of this.pisos) p.estatico.visible = false;
    this.modeloGlb = raiz;
    this.scene.add(raiz);
    return { pisos: 0, separable: false };
  }

  // --- Cada cuadro --------------------------------------------------------------------

  // sim: Simulacion; dt: segundos reales; velocidad: multiplicador; eventos: { usos, mensajes }.
  cuadro(sim, dt, velocidad, eventos) {
    const ahoraReal = performance.now();
    const msReal = ahoraReal - this.ultimoCuadro;
    this.post.medir(msReal);
    this.ultimoCuadro = ahoraReal;
    this.t += dt;
    this.avanzarIntro();

    // Pisos: vista explotada, pisos apartados al enfocar uno e intro.
    const objetivo = this.separar ? 1 : 0;
    this.explosion += (objetivo - this.explosion) * Math.min(1, dt * 5);
    if (Math.abs(objetivo - this.explosion) < 1e-3) this.explosion = objetivo;
    const kElevar = Math.min(1, dt * 4.5);
    for (const p of this.pisos) {
      const meta = this.pisoDibujado(p.n) ? 0 : ELEVAR + (p.n - (this.piso ?? 0)) * 3;
      p.elevar += (meta - p.elevar) * kElevar;
      if (Math.abs(meta - p.elevar) < 0.01) p.elevar = meta;
      p.grupo.position.y = this.yPiso(p.n);
      p.grupo.visible = p.elevar < ELEVAR * 0.6 && p.grupo.userData.entro !== false;
    }

    // Luz del día según la hora simulada.
    const hora = horaLocal(sim.tVisual).horaDecimal;
    const luz = this.cielo.actualizar(hora, this.ciclo, this.paleta, this.camara);
    this.entorno.actualizar(luz, this.camara, this.scene.fog);
    const abierto = estaAbierto(sim.tVisual);
    this.mats.vidrio.emissiveIntensity = luz.noche * (abierto ? 0.6 : 0.05);
    this.mats.acento.emissiveIntensity = this.paleta.brillo.acento * (1 + luz.noche * 0.8);
    this.matLuzCabina.emissiveIntensity = abierto ? (this.tema === 'oscuro' ? 0.55 : 0.3) : 0.1;

    const ahora = sim.ahora;
    const brillo = this.paleta.brillo.medidor;
    for (const [id, m] of this.medidores) {
      m.actualizar(sim.receptor.estadoDe(id, ahora), this.colores, id === sim.idEnVivo, brillo);
      m.animar(dt, this.camara.position.distanceToSquared(m.medidor.getWorldPosition(this.vTmp)) < DISPENSADOR_VISIBLE_M2);
    }

    if (eventos) {
      if (velocidad > 0) for (const u of eventos.usos) this.personas.generar(u);
      for (const msg of eventos.mensajes) {
        const id = msg.id ?? msg.tema?.split('/').pop();
        const m = this.medidores.get(id);
        if (!m) continue;
        m.pulsar(msg.aceptado, this.colores);
        if (this.pisos[m.info.piso - 1].grupo.visible && !this.intro) this.paquetes.lanzar(m.salida(this.vTmp), msg.aceptado);
      }
    }
    const velPersonas = velocidad <= 0 ? 0 : Math.min(3.2, 1.3 * Math.max(1, velocidad / 20));
    this.personas.actualizar(dt, velPersonas, (n) => this.yPiso(n), (n) => this.pisoVisible(n));

    const personal = sim.aseo.personal;
    while (this.figuras.length < personal.length) this.figuras.push(new FiguraAseo(this.scene, personal[this.figuras.length].nombre));
    personal.forEach((p, i) => {
      const pos = sim.aseo.posicion(p, sim.tVisual);
      const pisoF = pos.pisoF;
      const n = Math.min(PISOS, Math.max(1, Math.round(pisoF)));
      const y = (pisoF - 1) * (ALTO_PISO + SEPARACION * this.explosion) + this.pisos[n - 1].elevar + this.pisos[n - 1].caida;
      const visible = this.pisoVisible(n) && !this.intro;
      this.figuras[i].actualizar(pos, `${p.nombre}: ${p.texto}`, y, visible, dt);
      if (pos.tipo === 'ascensor') this.pisoCabina = pisoF;
    });
    const nc = Math.min(PISOS, Math.max(1, Math.round(this.pisoCabina)));
    this.cabina.position.y = (this.pisoCabina - 1) * (ALTO_PISO + SEPARACION * this.explosion) + this.pisos[nc - 1].elevar + 1.17;
    this.cabina.visible = this.pisoVisible(nc) && !this.intro;

    // Broker encima del edificio; con un piso enfocado, delante de la fachada para no tapar las aulas.
    if (this.piso === null) this.vBroker.set(0, this.yBase(PISOS) + TECHO + 4, -0.5);
    else this.vBroker.set(0, this.yBase(this.piso) + TECHO + 3, PLANTA.zMax + 4);
    this.broker.grupo.visible = !this.intro;
    this.broker.actualizar(dt, this.vBroker);
    this.paquetes.actualizar(dt, !this.intro);

    // Baño seleccionado o bajo el puntero.
    const latido = 0.85 + 0.15 * Math.sin(this.t * 3);
    this.matSeleccion.uniforms.uFuerza.value = 0.32 * latido;
    for (const [id, r] of this.resaltes) {
      const sel = id === this.seleccion;
      r.volumen.visible = (sel || id === this.hover) && this.pisoVisible(r.piso);
      r.volumen.material = sel ? this.matSeleccion : this.matHover;
    }

    if (this.transicion) {
      const t = this.transicion;
      t.k = Math.min(1, t.k + (t.real ? Math.min(0.5, msReal / 1000) : dt) / t.dur);
      const e = suavizar(t.k);
      this.camara.position.lerpVectors(t.p0, t.p1, e);
      this.controles.target.lerpVectors(t.t0, t.t1, e);
      if (t.k >= 1) this.transicion = null;
    }
    const segundosReales = Math.min(0.1, msReal / 1000);
    if (this.auto && !this.transicion && ahoraReal - this.ultimaInteraccion > 7000) {
      const d = this.auto(ahoraReal / 1000);
      if (d) {
        const k = 1 - Math.exp(-segundosReales * (d.rapidez ?? 1.1));
        this.camara.position.lerp(d.pos, k);
        this.controles.target.lerp(d.target, k);
      }
    }
    this.animarEscaner(segundosReales);
    this.controles.update();
    this.cuentaSombra = (this.cuentaSombra + 1) % this.cadaSombra;
    this.renderer.shadowMap.needsUpdate = this.cuentaSombra === 0;
    this.post.render(dt);
    this.css.render(this.scene, this.camara);
  }

  limpiarPersonas() {
    this.personas.limpiar();
    this.paquetes.limpiar();
  }
}
