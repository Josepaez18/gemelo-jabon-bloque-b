// Mensajes MQTT en vuelo: cada mensaje que procesa el receptor sale del HC-SR04 de su
// dispensador y viaja en arco hasta el nodo del broker, que destella según el resultado.
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { COLOR_PAQUETE } from './paleta.js';

const MAX = 160;
const COLA = 5; // esferas de la estela de cada paquete
const DURACION = 1.3; // segundos de vuelo
const POR_CUADRO = 10; // a ×3600 llegan muchos: se dibujan unos pocos por cuadro

const suavizar = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export class Broker {
  constructor(padre) {
    this.grupo = new THREE.Group();
    this.grupo.name = 'broker';
    this.matNucleo = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.5, roughness: 0.3, flatShading: true });
    this.nucleo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), this.matNucleo);
    this.matLineas = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 });
    this.malla = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.2, 1)), this.matLineas);
    this.matAros = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
    this.aros = [0, 1].map((k) => {
      const a = new THREE.Mesh(new THREE.TorusGeometry(1.75 + k * 0.35, 0.022, 6, 96), this.matAros);
      a.rotation.x = Math.PI / 2 + (k ? 0.5 : -0.35);
      return a;
    });
    this.matOnda = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.onda = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.matOnda);
    this.grupo.add(this.nucleo, this.malla, ...this.aros, this.onda);

    const el = document.createElement('div');
    el.className = 'etiqueta-broker';
    el.innerHTML = '<b>Broker MQTT</b><span>receptor R1–R8</span>';
    this.etiqueta = new CSS2DObject(el);
    this.etiqueta.position.set(0, 2.5, 0);
    this.etiqueta.center.set(0.5, 1);
    this.grupo.add(this.etiqueta);
    padre.add(this.grupo);

    this.t = 0;
    this.flash = 0;
    this.base = new THREE.Color(0x38bdf8);
    this.colorFlash = new THREE.Color();
    this.brillo = 1;
    this.listo = false;
  }

  setColor(hex, brillo) {
    this.base.setHex(hex);
    this.brillo = brillo;
    this.matLineas.color.setHex(hex);
    this.matAros.color.setHex(hex);
  }

  recibir(aceptado) {
    this.colorFlash.setHex(aceptado ? COLOR_PAQUETE.aceptado : COLOR_PAQUETE.rechazado);
    this.flash = Math.min(1.4, this.flash + (aceptado ? 0.35 : 0.9));
    this.matOnda.color.copy(this.colorFlash);
    this.tOnda = 0;
  }

  actualizar(dt, objetivo) {
    this.t += dt;
    if (!this.listo) {
      this.grupo.position.copy(objetivo);
      this.listo = true;
    }
    this.grupo.position.lerp(objetivo, Math.min(1, dt * 4));
    this.grupo.position.y += Math.sin(this.t * 1.3) * 0.004;
    this.nucleo.rotation.set(this.t * 0.6, this.t * 0.9, 0);
    this.malla.rotation.y = -this.t * 0.25;
    this.aros[0].rotation.z = this.t * 0.5;
    this.aros[1].rotation.z = -this.t * 0.35;
    this.flash *= Math.exp(-dt * 3.5);
    this.matNucleo.emissive.copy(this.base).lerp(this.colorFlash, Math.min(1, this.flash));
    this.matNucleo.color.copy(this.matNucleo.emissive);
    this.matNucleo.emissiveIntensity = (1.3 + this.flash * 2.2) * this.brillo;
    if (this.tOnda !== undefined && this.tOnda < 1) {
      this.tOnda = Math.min(1, this.tOnda + dt * 2.2);
      this.onda.scale.setScalar(0.7 + this.tOnda * 1.6);
      this.matOnda.opacity = (1 - this.tOnda) * 0.35;
    }
  }
}

export class Paquetes {
  constructor(padre, broker) {
    this.broker = broker;
    const geo = new THREE.IcosahedronGeometry(0.1, 1);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.malla = new THREE.InstancedMesh(geo, this.mat, MAX * (COLA + 1));
    this.malla.frustumCulled = false;
    this.malla.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.malla.renderOrder = 5;
    this.cero = new THREE.Matrix4().makeScale(0, 0, 0);
    const c = new THREE.Color(0);
    for (let i = 0; i < MAX * (COLA + 1); i++) {
      this.malla.setMatrixAt(i, this.cero);
      this.malla.setColorAt(i, c);
    }
    padre.add(this.malla);
    this.activos = [];
    this.libres = Array.from({ length: MAX }, (_, i) => MAX - 1 - i);
    this.m = new THREE.Matrix4();
    this.p = new THREE.Vector3();
    this.c1 = new THREE.Vector3();
    this.color = new THREE.Color();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.lanzadosCuadro = 0;
  }

  lanzar(desde, aceptado) {
    if (!this.libres.length || this.lanzadosCuadro >= POR_CUADRO) return;
    this.lanzadosCuadro++;
    const slot = this.libres.pop();
    const base = aceptado ? COLOR_PAQUETE.aceptado : COLOR_PAQUETE.rechazado;
    // Colores por encima de 1: la cabeza y la estela brillan con el bloom.
    for (let k = 0; k <= COLA; k++) {
      const f = k === 0 ? 3.2 : 2.2 * (1 - k / (COLA + 1));
      this.malla.setColorAt(slot * (COLA + 1) + k, this.color.setHex(base).multiplyScalar(f));
    }
    this.malla.instanceColor.needsUpdate = true;
    this.activos.push({ slot, p0: desde.clone(), t: 0, aceptado, dur: DURACION * (0.85 + Math.random() * 0.3) });
  }

  punto(a, t, destino, salida) {
    const k = suavizar(Math.min(1, Math.max(0, t)));
    // Control de la curva: por encima del punto medio y un poco hacia afuera del edificio.
    this.c1.set((a.p0.x + destino.x) / 2 + a.p0.x * 0.18, Math.max(a.p0.y, destino.y) + 3, (a.p0.z + destino.z) / 2 + a.p0.z * 0.3);
    const u = 1 - k;
    return salida.set(
      u * u * a.p0.x + 2 * u * k * this.c1.x + k * k * destino.x,
      u * u * a.p0.y + 2 * u * k * this.c1.y + k * k * destino.y,
      u * u * a.p0.z + 2 * u * k * this.c1.z + k * k * destino.z,
    );
  }

  actualizar(dt, visibles = true) {
    this.lanzadosCuadro = 0;
    const destino = this.broker.grupo.position;
    const quedan = [];
    for (const a of this.activos) {
      a.t += dt / a.dur;
      if (a.t >= 1) {
        this.broker.recibir(a.aceptado);
        for (let k = 0; k <= COLA; k++) this.malla.setMatrixAt(a.slot * (COLA + 1) + k, this.cero);
        this.libres.push(a.slot);
        continue;
      }
      quedan.push(a);
      for (let k = 0; k <= COLA; k++) {
        const i = a.slot * (COLA + 1) + k;
        const t = a.t - k * 0.028;
        if (!visibles || t <= 0) {
          this.malla.setMatrixAt(i, this.cero);
          continue;
        }
        this.punto(a, t, destino, this.p);
        const esc = (k === 0 ? 1 : 0.8 - k * 0.12) * (0.75 + 0.25 * Math.sin(Math.min(1, t) * Math.PI));
        this.m.compose(this.p, this.q, this.s.setScalar(esc));
        this.malla.setMatrixAt(i, this.m);
      }
    }
    this.activos = quedan;
    this.ajustarCuenta();
    this.malla.instanceMatrix.needsUpdate = true;
  }

  // Solo se dibujan los paquetes en vuelo.
  ajustarCuenta() {
    let tope = 0;
    for (const a of this.activos) tope = Math.max(tope, a.slot + 1);
    this.malla.count = tope * (COLA + 1);
  }

  limpiar() {
    for (const a of this.activos) {
      for (let k = 0; k <= COLA; k++) this.malla.setMatrixAt(a.slot * (COLA + 1) + k, this.cero);
      this.libres.push(a.slot);
    }
    this.activos = [];
    this.ajustarCuenta();
    this.malla.instanceMatrix.needsUpdate = true;
  }
}
