// Personas que entran a los baños (decorativas, ligadas a los usos simulados)
// y el personal de aseo (su posición la calcula el modelo).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { geometriaBano, infoDispensador, puntosDe, recinto } from '../modelo/edificio.js';

const COLORES_ROPA = [0xe4572e, 0x29335c, 0xf3a712, 0x669bbc, 0xa8c686, 0x7b2cbf, 0x2a9d8f, 0xe76f51, 0x264653, 0xd62828, 0x3a86ff, 0x8d99ae];
const PIELES = [0xf1c9a5, 0xe0ac83, 0xc68863, 0x8d5a3b, 0xf6d7bd, 0xa86b47];
const MAX = 90;
const MAX_POR_BANO = 6;
const COLOR_SIN_JABON = 0xd63c3c;

function pintar(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function pieza(g, x, y, z) {
  g.translate(x, y, z);
  return g.index ? g.toNonIndexed() : g;
}

// Ropa (torso y brazos): toma el color de cada persona.
function geometriaRopa(e = 1) {
  return mergeGeometries([
    pieza(new THREE.CapsuleGeometry(0.17 * e, 0.4 * e, 3, 10), 0, 0.98 * e, 0),
    pieza(new THREE.CapsuleGeometry(0.052 * e, 0.42 * e, 2, 6), -0.215 * e, 1.0 * e, 0),
    pieza(new THREE.CapsuleGeometry(0.052 * e, 0.42 * e, 2, 6), 0.215 * e, 1.0 * e, 0),
  ]);
}

// Cabeza y piernas: la cabeza toma el tono de piel; las piernas quedan oscuras.
function geometriaCuerpo(e = 1) {
  return mergeGeometries([
    pintar(pieza(new THREE.SphereGeometry(0.12 * e, 10, 8), 0, 1.5 * e, 0), 0xffffff),
    pintar(pieza(new THREE.CapsuleGeometry(0.072 * e, 0.5 * e, 2, 6), -0.085 * e, 0.32 * e, 0), 0x3a4256),
    pintar(pieza(new THREE.CapsuleGeometry(0.072 * e, 0.5 * e, 2, 6), 0.085 * e, 0.32 * e, 0), 0x3a4256),
  ]);
}

function azarDe(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// Puntos de origen: puertas de aulas, escalera y ascensor.
function origenAlAzar() {
  const r = Math.random();
  if (r < 0.55) {
    const a = recinto(azarDe(['aula1', 'aula2', 'aula3', 'aula4']));
    return [{ x: a.puertaX + (Math.random() - 0.5) * 0.4, z: 2.2 }, { x: a.puertaX, z: 0.4 }];
  }
  const clave = r < 0.85 ? 'escalera' : 'ascensor';
  const c = puntosDe(clave);
  return [c[c.length - 1], c[0]].map((p) => ({ x: p.x, z: p.z }));
}

function rutaAlBano(id) {
  const info = infoDispensador(id);
  const g = geometriaBano(info.genero);
  const r = recinto(info.genero);
  const s = g.lado;
  const ida = origenAlAzar();
  const vuelta = origenAlAzar().reverse();
  const carril = (Math.random() - 0.5) * 0.9;
  const pts = [
    ...ida,
    { x: ida[ida.length - 1].x, z: carril },
    { x: r.puertaX, z: carril },
    { x: r.puertaX, z: -1 },
    { x: r.puertaX + (Math.random() - 0.5) * 0.6, z: -2.2 },
  ];
  if (Math.random() < 0.65) {
    const n = g.cubiculos + g.orinales;
    const k = Math.floor(Math.random() * n);
    const x = k < g.cubiculos ? s * (11.92 - 1.45 * (k + 0.5)) : s * (11.92 - 1.45 * g.cubiculos - 0.75 - (k - g.cubiculos) * 0.85);
    pts.push({ x, z: -4.7 }, { x, z: k < g.cubiculos ? -6.0 : -6.3, espera: 2.2 }, { x, z: -4.7 });
  }
  const lav = azarDe(g.lavamanos);
  pts.push({ x: s * 5.0, z: lav.z, espera: 1.4, lavado: true });
  pts.push({ x: r.puertaX, z: -2.2 }, { x: r.puertaX, z: -1 }, { x: r.puertaX, z: -carril }, { x: vuelta[0].x, z: -carril }, ...vuelta);
  return pts;
}

export class Personas {
  constructor(padre) {
    this.ropa = new THREE.InstancedMesh(geometriaRopa(), new THREE.MeshStandardMaterial({ roughness: 0.75 }), MAX);
    this.cuerpo = new THREE.InstancedMesh(geometriaCuerpo(), new THREE.MeshStandardMaterial({ roughness: 0.6, vertexColors: true }), MAX);
    this.color = new THREE.Color();
    for (const malla of [this.ropa, this.cuerpo]) {
      malla.castShadow = true;
      malla.frustumCulled = false;
      malla.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      padre.add(malla);
    }
    for (let i = 0; i < MAX; i++) {
      this.ropa.setColorAt(i, this.color.setHex(COLORES_ROPA[i % COLORES_ROPA.length]));
      this.cuerpo.setColorAt(i, this.color.setHex(PIELES[i % PIELES.length]));
    }
    this.activos = [];
    this.libres = Array.from({ length: MAX }, (_, i) => MAX - 1 - i);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.p = new THREE.Vector3();
    this.esc = new THREE.Vector3(1, 1, 1);
    this.e = new THREE.Euler();
    this.cero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) this.poner(i, this.cero);
  }

  poner(slot, m) {
    this.ropa.setMatrixAt(slot, m);
    this.cuerpo.setMatrixAt(slot, m);
  }

  generar(uso) {
    if (!this.libres.length) return;
    const enBano = this.activos.filter((a) => a.id === uso.id).length;
    if (enBano >= MAX_POR_BANO) return;
    const slot = this.libres.pop();
    const info = infoDispensador(uso.id);
    const ruta = rutaAlBano(uso.id);
    this.ropa.setColorAt(slot, this.color.setHex(azarDe(COLORES_ROPA)));
    this.cuerpo.setColorAt(slot, this.color.setHex(azarDe(PIELES)));
    this.ropa.instanceColor.needsUpdate = true;
    this.cuerpo.instanceColor.needsUpdate = true;
    const escala = 0.92 + Math.random() * 0.16;
    this.activos.push({ slot, id: uso.id, piso: info.piso, ruta, i: 0, x: ruta[0].x, z: ruta[0].z, espera: 0, rumbo: 0, fase: Math.random() * 6, escala, conJabon: uso.conJabon });
  }

  // vel: metros por segundo visuales; yPiso(piso): altura de la losa; visible(piso).
  actualizar(dt, vel, yPiso, visible) {
    const quedan = [];
    const dtMov = vel > 0 ? dt : 0; // en pausa nadie avanza ni termina de lavarse
    for (const a of this.activos) {
      let avance = vel * dtMov;
      const camina = a.espera <= 0 && avance > 0;
      if (a.espera > 0) {
        a.espera = Math.max(0, a.espera - dtMov);
        avance = 0;
      }
      a.fase += vel * dtMov * 7.5;
      while (avance > 0 && a.i < a.ruta.length - 1) {
        const b = a.ruta[a.i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-6) a.rumbo = Math.atan2(dx, dz);
        if (d <= avance) {
          a.x = b.x;
          a.z = b.z;
          a.i++;
          avance -= d;
          if (b.espera) {
            a.espera = b.espera;
            avance = 0;
          }
          if (b.lavado && !a.conJabon) {
            this.ropa.setColorAt(a.slot, this.color.setHex(COLOR_SIN_JABON));
            this.ropa.instanceColor.needsUpdate = true;
          }
        } else {
          a.x += (dx / d) * avance;
          a.z += (dz / d) * avance;
          avance = 0;
        }
      }
      if (a.i >= a.ruta.length - 1) {
        this.poner(a.slot, this.cero);
        this.libres.push(a.slot);
        continue;
      }
      quedan.push(a);
      if (!visible(a.piso)) {
        this.poner(a.slot, this.cero);
        continue;
      }
      // Paso: un pequeño rebote y balanceo al caminar.
      const rebote = camina ? Math.abs(Math.sin(a.fase)) * 0.045 : 0;
      const balanceo = camina ? Math.sin(a.fase) * 0.05 : 0;
      this.p.set(a.x, yPiso(a.piso) + 0.012 + rebote, a.z);
      this.q.setFromEuler(this.e.set(camina ? 0.06 : 0, a.rumbo, balanceo, 'YXZ'));
      this.esc.setScalar(a.escala);
      this.m.compose(this.p, this.q, this.esc);
      this.poner(a.slot, this.m);
    }
    this.activos = quedan;
    this.ajustarCuenta();
    this.ropa.instanceMatrix.needsUpdate = true;
    this.cuerpo.instanceMatrix.needsUpdate = true;
  }

  // Solo se dibujan los puestos en uso: una figura en escala 0 también gasta triángulos.
  ajustarCuenta() {
    let tope = 0;
    for (const a of this.activos) tope = Math.max(tope, a.slot + 1);
    this.ropa.count = this.cuerpo.count = tope;
  }

  limpiar() {
    for (const a of this.activos) {
      this.poner(a.slot, this.cero);
      this.libres.push(a.slot);
    }
    this.activos = [];
    this.ajustarCuenta();
    this.ropa.instanceMatrix.needsUpdate = true;
    this.cuerpo.instanceMatrix.needsUpdate = true;
  }
}

// Figura del personal de aseo con su carrito.
export class FiguraAseo {
  constructor(padre, nombre) {
    this.grupo = new THREE.Group();
    const e = 1.06;
    const ropa = new THREE.Mesh(geometriaRopa(e), new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.6 }));
    const cuerpo = new THREE.Mesh(geometriaCuerpo(e), new THREE.MeshStandardMaterial({ color: 0xc68863, roughness: 0.6, vertexColors: true }));
    const chaleco = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.34, 14).translate(0, 1.0 * e, 0),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x8a6a00, emissiveIntensity: 0.5 }),
    );
    const gorra = new THREE.Mesh(
      new THREE.SphereGeometry(0.13 * e, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.53 * e, 0),
      new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.6 }),
    );
    const carro = new THREE.Group();
    const caja = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.6).translate(0, 0.38, 0), new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 }));
    const balde = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.25, 12).translate(0, 0.76, 0.12), new THREE.MeshStandardMaterial({ color: 0xfacc15 }));
    const botella = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 10).translate(0.1, 0.76, -0.15), new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x166534, emissiveIntensity: 0.4 }));
    const mango = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 6, 16, Math.PI).rotateY(Math.PI / 2).translate(0, 0.82, -0.32), new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.6, roughness: 0.4 }));
    const rueda = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12).rotateZ(Math.PI / 2);
    const matRueda = new THREE.MeshStandardMaterial({ color: 0x1f2937 });
    for (const [x, z] of [[-0.2, -0.24], [0.2, -0.24], [-0.2, 0.24], [0.2, 0.24]]) {
      const r = new THREE.Mesh(rueda, matRueda);
      r.position.set(x, 0.06, z);
      carro.add(r);
    }
    carro.add(caja, balde, botella, mango);
    carro.position.set(0, 0, 0.62);
    ropa.castShadow = cuerpo.castShadow = chaleco.castShadow = caja.castShadow = true;
    this.matAnillo = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.85, depthWrite: false });
    this.anillo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.54, 40).rotateX(-Math.PI / 2), this.matAnillo);
    this.anillo.position.y = 0.03;
    this.grupo.add(ropa, cuerpo, chaleco, gorra, carro, this.anillo);

    this.el = document.createElement('div');
    this.el.className = 'etiqueta-aseo';
    this.el.textContent = nombre;
    this.etiqueta = new CSS2DObject(this.el);
    this.etiqueta.position.set(0, 2.05, 0);
    this.etiqueta.center.set(0.5, 1);
    this.grupo.add(this.etiqueta);
    padre.add(this.grupo);
    this.t = 0;
    this.textoPrevio = '';
    this.previa = null;
  }

  actualizar(pos, texto, y, visible, dt) {
    this.grupo.visible = visible;
    const mueve = this.previa && Math.hypot(pos.x - this.previa.x, pos.z - this.previa.z) > 1e-4;
    this.previa = { x: pos.x, z: pos.z };
    this.t += dt;
    const rebote = mueve ? Math.abs(Math.sin(this.t * 9)) * 0.035 : 0;
    this.grupo.position.set(pos.x, y + 0.012 + rebote, pos.z);
    if (pos.rumbo !== null && pos.rumbo !== undefined) this.grupo.rotation.y = pos.rumbo;
    const trabajando = pos.tipo === 'recargar' || pos.tipo === 'revisar';
    this.anillo.visible = trabajando;
    if (trabajando) {
      const k = (this.t * 1.2) % 1;
      this.anillo.scale.setScalar(1 + k * 0.8);
      this.matAnillo.opacity = 0.9 * (1 - k);
    }
    if (texto !== this.textoPrevio) {
      this.textoPrevio = texto;
      this.el.textContent = texto;
    }
  }
}
