// Entorno de la maqueta: base con rejilla que se pierde en el horizonte, plataforma circular
// con plaza, caminos, setos, árboles, bancas y faroles que se encienden de noche.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ESCALA_TEXTURA, azar, uvMundo } from './texturas.js';

const RADIO = 54; // radio de la plataforma
const Y_CESPED = -0.25;
const PLAZA = { x0: -24, x1: 24, z0: -12, z1: 14 };
const ANILLO = 39; // radio del camino peatonal circular

const vertexBase = /* glsl */ `
  varying vec3 vMundo;
  void main() {
    vec4 m = modelMatrix * vec4(position, 1.0);
    vMundo = m.xyz;
    gl_Position = projectionMatrix * viewMatrix * m;
  }
`;

const fragmentBase = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLinea;
  uniform vec3 uHorizonte;
  uniform vec3 uCamara;
  uniform float uLuz;
  uniform float uCerca;
  uniform float uLejos;
  varying vec3 vMundo;
  float linea(vec2 p, float paso, float ancho) {
    vec2 q = p / paso;
    vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
    return 1.0 - min(min(g.x, g.y) / ancho, 1.0);
  }
  void main() {
    float d = length(vMundo.xz);
    float l = max(linea(vMundo.xz, 4.0, 1.0) * 0.28, linea(vMundo.xz, 20.0, 1.3) * 0.7);
    l *= 1.0 - smoothstep(70.0, 320.0, d);
    vec3 col = mix(uColor, uLinea, l) * uLuz;
    float niebla = smoothstep(uCerca, uLejos, distance(vMundo, uCamara));
    gl_FragColor = vec4(mix(col, uHorizonte, niebla), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function caja(x0, y0, z0, x1, y1, z1, radio = 0) {
  const g = radio
    ? new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 2, radio)
    : new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g.index ? g.toNonIndexed() : g;
}

// Copa de árbol con los vértices movidos un poco: se ve orgánica con sombreado plano.
function copaIrregular(semilla) {
  const r = azar(semilla);
  const g = new THREE.IcosahedronGeometry(1.5, 1);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const vistos = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const clave = `${v.x.toFixed(3)}|${v.y.toFixed(3)}|${v.z.toFixed(3)}`;
    if (!vistos.has(clave)) vistos.set(clave, 0.84 + r() * 0.3);
    v.multiplyScalar(vistos.get(clave));
    v.y *= 0.9;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function libreDeCaminos(x, z) {
  const rad = Math.hypot(x, z);
  if (rad > RADIO - 3 || rad < 26) return false;
  if (Math.abs(rad - ANILLO) < 2.6) return false;
  if (Math.abs(z) < 3.4 && Math.abs(x) > PLAZA.x1 - 1) return false;
  if (Math.abs(x) < 3.4 && z > PLAZA.z1 - 1) return false;
  return !(x > PLAZA.x0 - 2 && x < PLAZA.x1 + 2 && z > PLAZA.z0 - 2 && z < PLAZA.z1 + 2);
}

function letrero(texto) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f6f8';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1e293b';
  g.font = '700 92px system-ui, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(texto, c.width / 2, c.height / 2 + 4);
  g.fillStyle = '#2f7bf6';
  g.fillRect(40, 136, c.width - 80, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Entorno {
  constructor(padre, paleta, texturas) {
    this.grupo = new THREE.Group();
    this.grupo.name = 'entorno';
    padre.add(this.grupo);

    // Base infinita con rejilla.
    this.uBase = {
      uColor: { value: new THREE.Color(paleta.base) },
      uLinea: { value: new THREE.Color(paleta.rejilla) },
      uHorizonte: { value: new THREE.Color() },
      uCamara: { value: new THREE.Vector3() },
      uLuz: { value: 1 },
      uCerca: { value: 170 },
      uLejos: { value: 720 },
    };
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: this.uBase, vertexShader: vertexBase, fragmentShader: fragmentBase, fog: false }),
    );
    base.position.y = -1.3;
    base.userData.sinAO = true;
    this.grupo.add(base);

    const est = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...extra });
    this.mats = {
      plataforma: est(paleta.plataforma, { roughness: 0.7 }),
      cesped: est(paleta.cesped, { roughness: 1 }),
      plaza: est(paleta.plaza, { map: texturas.adoquin, roughness: 0.85 }),
      camino: est(paleta.camino, { map: texturas.adoquin, roughness: 0.9 }),
      seto: est(paleta.seto, { flatShading: true }),
      tronco: est(paleta.tronco),
      copa: est(0xffffff, { flatShading: true, roughness: 0.85 }),
      madera: est(0xb08a5e, { roughness: 0.7 }),
      metal: est(0x7d8794, { roughness: 0.4, metalness: 0.6 }),
      farol: new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffc677, emissiveIntensity: 0, roughness: 0.3 }),
      acento: new THREE.MeshStandardMaterial({ color: paleta.acento, emissive: paleta.acento, emissiveIntensity: paleta.brillo.acento }),
      letrero: est(0xffffff, { map: letrero('BLOQUE B'), roughness: 0.5 }),
    };

    // Plataforma circular con borde de luz.
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(RADIO, RADIO + 0.6, 1.05, 120), [this.mats.plataforma, this.mats.cesped, this.mats.plataforma]);
    plat.position.y = Y_CESPED - 0.525;
    plat.receiveShadow = true;
    this.grupo.add(plat);
    const borde = new THREE.Mesh(new THREE.TorusGeometry(RADIO + 0.02, 0.07, 6, 200).rotateX(Math.PI / 2), this.mats.acento);
    borde.position.y = Y_CESPED - 0.02;
    this.grupo.add(borde);

    // Plaza, caminos y anillo peatonal: cajas delgadas a alturas distintas (sin parpadeo).
    const plaza = caja(PLAZA.x0, Y_CESPED, PLAZA.z0, PLAZA.x1, -0.21, PLAZA.z1, 0.04);
    uvMundo(plaza, ESCALA_TEXTURA.adoquin);
    this.agregar(plaza, this.mats.plaza, false);
    const caminos = [
      caja(PLAZA.x1 - 1, Y_CESPED - 0.01, -1.4, RADIO - 0.6, -0.225, 1.4),
      caja(-RADIO + 0.6, Y_CESPED - 0.01, -1.4, PLAZA.x0 + 1, -0.225, 1.4),
      caja(-1.7, Y_CESPED - 0.01, PLAZA.z1 - 1, 1.7, -0.225, RADIO - 0.6),
      caja(-1.4, Y_CESPED - 0.01, -RADIO + 0.6, 1.4, -0.225, PLAZA.z0 + 1),
    ];
    const anillo = new THREE.RingGeometry(ANILLO - 1.2, ANILLO + 1.2, 128, 1).rotateX(-Math.PI / 2).translate(0, -0.235, 0);
    const caminosGeo = mergeGeometries([...caminos, anillo.toNonIndexed()], false);
    uvMundo(caminosGeo, ESCALA_TEXTURA.adoquin);
    this.agregar(caminosGeo, this.mats.camino, false);

    // Setos a lo largo de la plaza, con huecos donde llegan los caminos.
    const setos = [];
    for (const z of [PLAZA.z0 + 0.5, PLAZA.z1 - 0.5]) {
      for (const [x0, x1] of [[PLAZA.x0 + 1, -3], [3, PLAZA.x1 - 1]]) setos.push(caja(x0, -0.21, z - 0.4, x1, 0.55, z + 0.4, 0.25));
    }
    for (const x of [PLAZA.x0 + 0.5, PLAZA.x1 - 0.5]) {
      for (const [z0, z1] of [[PLAZA.z0 + 1, -3], [3, PLAZA.z1 - 1]]) setos.push(caja(x - 0.4, -0.21, z0, x + 0.4, 0.55, z1, 0.25));
    }
    this.agregar(mergeGeometries(setos, false), this.mats.seto, true);

    // Bancas frente a la fachada principal.
    const asientos = [];
    const patas = [];
    for (const x of [-18, -11, 11, 18]) {
      for (const z of [10.6]) {
        asientos.push(caja(x - 1, 0.2, z - 0.25, x + 1, 0.27, z + 0.25, 0.03));
        asientos.push(caja(x - 1, 0.3, z + 0.2, x + 1, 0.7, z + 0.26, 0.02));
        for (const dx of [-0.85, 0.85]) patas.push(caja(x + dx - 0.04, -0.21, z - 0.22, x + dx + 0.04, 0.2, z + 0.22));
      }
    }
    this.agregar(mergeGeometries(asientos, false), this.mats.madera, true);
    this.agregar(mergeGeometries(patas, false), this.mats.metal, true);

    // Letrero del bloque junto al camino de entrada.
    const monolito = new THREE.Mesh(new RoundedBoxGeometry(4.2, 1.3, 0.4, 2, 0.06), [
      this.mats.plataforma, this.mats.plataforma, this.mats.plataforma, this.mats.plataforma, this.mats.letrero, this.mats.plataforma,
    ]);
    monolito.position.set(5.6, -0.21 + 0.65, 17.2);
    monolito.castShadow = monolito.receiveShadow = true;
    this.grupo.add(monolito);

    this.crearArboles(paleta);
    this.crearFaroles();
  }

  agregar(geo, mat, sombra) {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.castShadow = sombra;
    this.grupo.add(m);
    return m;
  }

  crearArboles(paleta) {
    const r = azar(42);
    const sitios = [];
    // Hilera junto a la plaza y árboles sueltos en el césped.
    for (const x of [PLAZA.x0 - 3.5, PLAZA.x1 + 3.5]) for (let z = -9; z <= 11; z += 5) if (Math.abs(z) > 3) sitios.push([x, z, 0.85]);
    for (const z of [PLAZA.z0 - 3.5, PLAZA.z1 + 3.5]) for (let x = -20; x <= 20; x += 6.5) if (Math.abs(x) > 4) sitios.push([x, z, 0.8]);
    let intentos = 0;
    while (sitios.length < 52 && intentos++ < 2000) {
      const a = r() * Math.PI * 2;
      const d = 27 + r() * (RADIO - 30);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!libreDeCaminos(x, z)) continue;
      if (sitios.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 4.8)) continue;
      sitios.push([x, z, 0.7 + r() * 0.45]);
    }
    const tronco = new THREE.CylinderGeometry(0.13, 0.2, 1.8, 7).translate(0, 0.9, 0);
    const redonda = copaIrregular(3);
    const conica = new THREE.ConeGeometry(1.35, 3.6, 7, 1).translate(0, 1.8, 0);
    const n = sitios.length;
    this.troncos = new THREE.InstancedMesh(tronco, this.mats.tronco, n);
    this.copasRedondas = new THREE.InstancedMesh(redonda, this.mats.copa, n);
    this.copasConicas = new THREE.InstancedMesh(conica, this.mats.copa, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const color = new THREE.Color();
    let nr = 0;
    let nc = 0;
    this.coloresArbol = [];
    sitios.forEach(([x, z, k], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      m.compose(p.set(x, Y_CESPED, z), q, s.set(k, k * (0.9 + r() * 0.3), k));
      this.troncos.setMatrixAt(i, m);
      const conico = r() < 0.3;
      const indiceColor = Math.floor(r() * paleta.arboles.length);
      color.setHex(paleta.arboles[indiceColor]);
      if (conico) {
        m.compose(p.set(x, Y_CESPED + 1.2 * k, z), q, s.set(k, k * (0.9 + r() * 0.35), k));
        this.copasConicas.setMatrixAt(nc, m);
        this.copasConicas.setColorAt(nc, color);
        this.coloresArbol.push(['c', nc++, indiceColor]);
      } else {
        m.compose(p.set(x, Y_CESPED + 2.6 * k, z), q, s.set(k, k, k));
        this.copasRedondas.setMatrixAt(nr, m);
        this.copasRedondas.setColorAt(nr, color);
        this.coloresArbol.push(['r', nr++, indiceColor]);
      }
    });
    this.copasRedondas.count = nr;
    this.copasConicas.count = nc;
    for (const im of [this.troncos, this.copasRedondas, this.copasConicas]) {
      im.castShadow = true;
      im.receiveShadow = true;
      this.grupo.add(im);
    }
  }

  crearFaroles() {
    const sitios = [];
    for (let d = PLAZA.x1 + 5; d < RADIO - 4; d += 10) for (const s of [-1, 1]) sitios.push([s * d, 2.3], [s * d, -2.3]);
    for (let d = PLAZA.z1 + 5; d < RADIO - 4; d += 10) sitios.push([2.6, d], [-2.6, d]);
    for (let d = Math.abs(PLAZA.z0) + 5; d < RADIO - 4; d += 10) sitios.push([2.3, -d], [-2.3, -d]);
    for (const [x, z] of [[PLAZA.x0 + 1.2, PLAZA.z0 + 1.2], [PLAZA.x1 - 1.2, PLAZA.z0 + 1.2], [PLAZA.x0 + 1.2, PLAZA.z1 - 1.2], [PLAZA.x1 - 1.2, PLAZA.z1 - 1.2]]) sitios.push([x, z]);
    const poste = new THREE.CylinderGeometry(0.05, 0.08, 3.4, 8).translate(0, 1.7, 0);
    const cabeza = new THREE.CylinderGeometry(0.22, 0.16, 0.22, 12).translate(0, 3.45, 0);
    const postes = new THREE.InstancedMesh(poste, this.mats.metal, sitios.length);
    const cabezas = new THREE.InstancedMesh(cabeza, this.mats.farol, sitios.length);
    const m = new THREE.Matrix4();
    sitios.forEach(([x, z], i) => {
      m.makeTranslation(x, -0.22, z);
      postes.setMatrixAt(i, m);
      cabezas.setMatrixAt(i, m);
    });
    postes.castShadow = true;
    this.grupo.add(postes, cabezas);
  }

  setTema(paleta) {
    this.uBase.uColor.value.setHex(paleta.base);
    this.uBase.uLinea.value.setHex(paleta.rejilla);
    this.mats.plataforma.color.setHex(paleta.plataforma);
    this.mats.cesped.color.setHex(paleta.cesped);
    this.mats.plaza.color.setHex(paleta.plaza);
    this.mats.camino.color.setHex(paleta.camino);
    this.mats.seto.color.setHex(paleta.seto);
    this.mats.tronco.color.setHex(paleta.tronco);
    this.mats.acento.color.setHex(paleta.acento);
    this.mats.acento.emissive.setHex(paleta.acento);
    this.mats.acento.emissiveIntensity = paleta.brillo.acento;
    const color = new THREE.Color();
    for (const [tipo, i, k] of this.coloresArbol) {
      const im = tipo === 'c' ? this.copasConicas : this.copasRedondas;
      im.setColorAt(i, color.setHex(paleta.arboles[k]));
      im.instanceColor.needsUpdate = true;
    }
  }

  // luz: { luzDia, noche, horizonte } del cielo.
  actualizar(luz, camara, niebla) {
    this.uBase.uHorizonte.value.copy(luz.horizonte);
    this.uBase.uCamara.value.copy(camara.position);
    this.uBase.uLuz.value = 0.32 + 0.68 * luz.luzDia;
    this.uBase.uCerca.value = niebla.near;
    this.uBase.uLejos.value = niebla.far;
    this.mats.farol.emissiveIntensity = Math.max(0, luz.noche - 0.25) * 3.2;
  }
}
