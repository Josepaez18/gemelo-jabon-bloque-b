// Geometría de la maqueta: losas con franja de luz, fachada de vidrio, columnas,
// muros interiores cortados a 1,4 m, baños, aulas y núcleo.
// Las cajas se agrupan por material y se fusionan: pocos objetos que dibujar por piso.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ALTO_PISO, ALTURA_CORTE, PLANTA, geometriaBano, recinto } from '../modelo/edificio.js';
import { ESCALA_TEXTURA, uvMundo } from './texturas.js';

const EXT = 0.25; // espesor de muro exterior
const INT = 0.15; // espesor de muro interior
const TAPA = 0.03; // tapa oscura del corte (poché)
const LOSA = 0.24; // espesor de la losa
export const TECHO = ALTO_PISO - LOSA; // cara inferior de la losa de arriba
const ANTEPECHO = 1.0;

class Cubetas {
  constructor() {
    this.geos = new Map();
  }

  agregar(mat, g) {
    if (!this.geos.has(mat)) this.geos.set(mat, []);
    this.geos.get(mat).push(g.index ? g.toNonIndexed() : g);
  }

  caja(mat, x0, y0, z0, x1, y1, z1) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.agregar(mat, g);
  }

  cajaRedonda(mat, x0, y0, z0, x1, y1, z1, radio) {
    // Un borde tan fino no se alcanza a ver y cuesta 100 triángulos por pieza: pupitres y sillas van rectos.
    if (radio < 0.03) return this.caja(mat, x0, y0, z0, x1, y1, z1);
    const g = new RoundedBoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 1, radio);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.agregar(mat, g);
  }

  cajaGirada(mat, cx, cy, cz, sx, sy, sz, rotY, pivoteX = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(pivoteX, 0, 0);
    g.rotateY(rotY);
    g.translate(cx, cy, cz);
    this.agregar(mat, g);
  }

  cilindro(mat, x, y0, z, r, h, seg = 10, rArriba = r) {
    const g = new THREE.CylinderGeometry(rArriba, r, h, seg);
    g.translate(x, y0 + h / 2, z);
    this.agregar(mat, g);
  }

  esfera(mat, x, y, z, r, detalle = 1) {
    const g = new THREE.IcosahedronGeometry(r, detalle);
    g.translate(x, y, z);
    this.agregar(mat, g);
  }

  // Muro alineado a un eje, con huecos de puerta [{ c, ancho }] y tapa de corte.
  muro(x0, z0, x1, z1, esp, puertas = [], alto = ALTURA_CORTE, mat = 'muro') {
    const horizontal = z0 === z1;
    const a = horizontal ? Math.min(x0, x1) : Math.min(z0, z1);
    const b = horizontal ? Math.max(x0, x1) : Math.max(z0, z1);
    const huecos = puertas.map((p) => [p.c - p.ancho / 2, p.c + p.ancho / 2]).sort((p, q) => p[0] - q[0]);
    const tramos = [];
    let desde = a - esp / 2;
    for (const [h0, h1] of huecos) {
      if (h0 > desde) tramos.push([desde, h0]);
      desde = Math.max(desde, h1);
    }
    if (desde < b + esp / 2) tramos.push([desde, b + esp / 2]);
    for (const [t0, t1] of tramos) {
      if (horizontal) {
        this.caja(mat, t0, 0, z0 - esp / 2, t1, alto, z0 + esp / 2);
        this.caja('corte', t0, alto, z0 - esp / 2, t1, alto + TAPA, z0 + esp / 2);
      } else {
        this.caja(mat, x0 - esp / 2, 0, t0, x0 + esp / 2, alto, t1);
        this.caja('corte', x0 - esp / 2, alto, t0, x0 + esp / 2, alto + TAPA, t1);
      }
    }
  }

  construir(materiales) {
    const grupo = new THREE.Group();
    for (const [mat, lista] of this.geos) {
      const geo = mergeGeometries(lista, false);
      const textura = TEXTURA_DE[mat];
      if (textura) uvMundo(geo, ESCALA_TEXTURA[textura]);
      const malla = new THREE.Mesh(geo, materiales[mat]);
      const vidrio = mat === 'vidrio';
      malla.castShadow = PROYECTAN.has(mat);
      malla.receiveShadow = !vidrio;
      if (vidrio) malla.renderOrder = 3;
      malla.name = `maqueta-${mat}`;
      grupo.add(malla);
    }
    return grupo;
  }
}

// Solo las piezas grandes proyectan sombra: la de una silla o un grifo no se nota y duplica su costo.
const PROYECTAN = new Set(['losa', 'canto', 'muro', 'columna', 'madera', 'tabique', 'ducto']);
const TEXTURA_DE = { losa: 'concreto', pasillo: 'concreto', piso: 'madera', banoM: 'baldosa', banoH: 'baldosa' };

export const MATERIALES = [
  'losa', 'canto', 'muro', 'columna', 'corte', 'pasillo', 'piso', 'banoM', 'banoH', 'loza', 'meson',
  'madera', 'silla', 'metal', 'espejo', 'ducto', 'tabique', 'planta', 'vidrio', 'acento',
];

function colorDe(paleta, clave) {
  if (clave === 'planta') return paleta.seto;
  return paleta[clave];
}

export function crearMateriales(paleta, texturas) {
  const m = {};
  for (const clave of MATERIALES) {
    if (clave === 'vidrio' || clave === 'acento') continue;
    const map = texturas?.[TEXTURA_DE[clave]] ?? null;
    m[clave] = new THREE.MeshStandardMaterial({ color: colorDe(paleta, clave), roughness: 0.85, metalness: 0, map });
  }
  m.metal.roughness = 0.38;
  m.metal.metalness = 0.65;
  m.espejo.roughness = 0.04;
  m.espejo.metalness = 0.92;
  m.loza.roughness = 0.22;
  m.banoM.roughness = m.banoH.roughness = 0.3;
  m.pasillo.roughness = 0.5;
  m.piso.roughness = 0.6;
  m.corte.roughness = 0.6;
  m.planta.flatShading = true;
  m.vidrio = new THREE.MeshPhysicalMaterial({
    color: paleta.vidrio,
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMapIntensity: 1.6,
    emissive: 0xffc98a,
    emissiveIntensity: 0,
  });
  m.acento = new THREE.MeshStandardMaterial({ color: paleta.acento, emissive: paleta.acento, emissiveIntensity: paleta.brillo.acento, roughness: 0.4 });
  return m;
}

export function pintarMateriales(m, paleta) {
  for (const clave of MATERIALES) m[clave].color.setHex(colorDe(paleta, clave));
  m.acento.emissive.setHex(paleta.acento);
  m.acento.emissiveIntensity = paleta.brillo.acento;
}

function bano(c, genero) {
  const g = geometriaBano(genero);
  const s = g.lado;
  const r = recinto(genero);
  const cara = 4 + INT / 2; // cara interior del muro del núcleo
  const xi = (d) => s * (cara + d); // punto a `d` metros del muro, hacia adentro del baño
  const rango = (d0, d1) => [Math.min(xi(d0), xi(d1)), Math.max(xi(d0), xi(d1))];

  c.caja(genero === 'mujeres' ? 'banoM' : 'banoH', r.x0 + INT / 2, 0, r.z0 + EXT / 2, r.x1 - INT / 2, 0.012, r.z1 - INT / 2);

  // Cubículos contra el muro del fondo, desde la esquina exterior hacia el centro.
  const zFondo = PLANTA.zMin + EXT / 2;
  const zFrente = -5.3;
  const ancho = 1.45;
  const xEsq = s * 11.92;
  const xs = Array.from({ length: g.cubiculos + 1 }, (_, k) => xEsq - s * ancho * k);
  for (const x of xs) c.caja('tabique', x - 0.025, 0, zFondo, x + 0.025, ALTURA_CORTE, zFrente);
  for (let k = 0; k < g.cubiculos; k++) {
    const xa = xs[k];
    const xb = xs[k + 1];
    const xc = (xa + xb) / 2;
    const panel = xa + (xb - xa) * 0.42;
    c.caja('tabique', Math.min(xa, panel), 0.05, zFrente - 0.025, Math.max(xa, panel), ALTURA_CORTE, zFrente + 0.025);
    const hueco = Math.abs(xb - panel) - 0.04;
    // Puerta entreabierta hacia adentro del cubículo, con la bisagra en el panel.
    c.cajaGirada('tabique', panel, 0.05 + 1.3 / 2, zFrente, hueco, 1.3, 0.03, -s * 0.65, -s * hueco / 2);
    c.cilindro('loza', xc, 0, -6.4, 0.2, 0.4, 12, 0.22);
    c.cajaRedonda('loza', xc - 0.2, 0.3, zFondo, xc + 0.2, 0.75, zFondo + 0.18, 0.04);
  }
  // Orinales (hombres).
  for (let k = 0; k < g.orinales; k++) {
    const x = xs[xs.length - 1] - s * (0.75 + k * 0.85);
    c.cajaRedonda('loza', x - 0.18, 0.45, zFondo, x + 0.18, 0.95, zFondo + 0.3, 0.06);
    if (k > 0) {
      const xp = x + s * 0.425;
      c.caja('tabique', xp - 0.015, 0.5, zFondo, xp + 0.015, 1.3, zFondo + 0.45);
    }
  }

  // Mesón con lavamanos y espejos contra el muro del núcleo.
  const [m0, m1] = rango(0, 0.575);
  c.cajaRedonda('meson', m0, 0.78, -4.6, m1, 0.86, -1.6, 0.02);
  const [b0, b1] = rango(0.02, 0.52);
  c.caja('tabique', b0, 0, -4.55, b1, 0.78, -1.65);
  for (const l of g.lavamanos) {
    c.cilindro('loza', l.x, 0.86, l.z, 0.15, 0.05, 12, 0.18);
    const [f0, f1] = rango(0.04, 0.12);
    c.caja('metal', f0, 0.86, l.z - 0.025, f1, 1.0, l.z + 0.025);
    const [e0, e1] = rango(0, 0.02);
    c.caja('espejo', e0, 0.98, l.z - 0.3, e1, ALTURA_CORTE - 0.02, l.z + 0.3);
  }
  // Papelera junto a la puerta.
  c.cilindro('metal', r.puertaX - s * 0.9, 0, -1.55, 0.14, 0.5, 10, 0.16);
}

function planta(c, x, z, alto = 0.9) {
  c.cilindro('canto', x, 0, z, 0.16, 0.34, 12, 0.2);
  c.esfera('planta', x, 0.34 + alto * 0.45, z, alto * 0.32, 1);
  c.esfera('planta', x + 0.08, 0.34 + alto * 0.75, z - 0.05, alto * 0.22, 1);
}

function aula(c, r) {
  const a = r.x0;
  c.caja('piso', r.x0 + INT / 2, 0, r.z0 + INT / 2, r.x1 - INT / 2, 0.012, r.z1 - EXT / 2);
  c.caja('loza', a + INT / 2, 0.9, 2.4, a + INT / 2 + 0.03, 1.36, 5.6); // tablero
  c.caja('metal', a + INT / 2, 0.86, 2.35, a + INT / 2 + 0.08, 0.9, 5.65);
  c.cajaRedonda('madera', a + 0.9, 0.72, 3.4, a + 1.6, 0.77, 4.6, 0.015); // escritorio del docente
  c.caja('silla', a + 0.95, 0, 3.45, a + 1.55, 0.72, 4.55);
  for (const x of [a + 2.6, a + 3.9, a + 5.2, a + 6.5]) {
    for (const z of [2.0, 3.25, 4.5, 5.75]) {
      c.cajaRedonda('madera', x - 0.25, 0.7, z - 0.32, x + 0.25, 0.75, z + 0.32, 0.015);
      c.caja('silla', x - 0.22, 0, z - 0.3, x - 0.19, 0.7, z + 0.3);
      c.caja('silla', x + 0.19, 0, z - 0.3, x + 0.22, 0.7, z + 0.3);
      c.cajaRedonda('silla', x + 0.35, 0.42, z - 0.2, x + 0.75, 0.46, z + 0.2, 0.015);
      c.cajaRedonda('silla', x + 0.72, 0.46, z - 0.2, x + 0.76, 0.85, z + 0.2, 0.015);
    }
  }
  planta(c, r.x1 - 0.55, r.z1 - 0.6);
}

// Fachada: antepecho macizo, vidrio hasta la losa de arriba, parteluces y columnas.
function fachada(c, numero) {
  const { xMin, xMax, zMin, zMax } = PLANTA;
  // En el piso 1 el pasillo abre a la calle por ambos extremos.
  const entrada = numero === 1 ? [{ c: 0, ancho: 1.8 }] : [];
  c.muro(xMin, zMin, xMax, zMin, EXT, [], ANTEPECHO);
  c.muro(xMin, zMax, xMax, zMax, EXT, [], ANTEPECHO);
  c.muro(xMin, zMin, xMin, zMax, EXT, entrada, ANTEPECHO);
  c.muro(xMax, zMin, xMax, zMax, EXT, entrada, ANTEPECHO);

  const v = 0.012;
  for (const z of [zMin, zMax]) {
    c.caja('vidrio', xMin, ANTEPECHO, z - v, xMax, TECHO, z + v);
    c.caja('metal', xMin, TECHO - 0.06, z - 0.05, xMax, TECHO, z + 0.05);
    c.caja('metal', xMin, ANTEPECHO + TAPA, z - 0.05, xMax, ANTEPECHO + TAPA + 0.04, z + 0.05);
    for (let x = xMin + 2; x < xMax; x += 2) {
      if (Math.abs(x % 8) < 1e-6) continue; // ahí va una columna
      c.caja('metal', x - 0.03, ANTEPECHO, z - 0.05, x + 0.03, TECHO, z + 0.05);
    }
  }
  for (const x of [xMin, xMax]) {
    const tramos = numero === 1 ? [[zMin, -0.9], [0.9, zMax]] : [[zMin, zMax]];
    for (const [z0, z1] of tramos) c.caja('vidrio', x - v, ANTEPECHO, z0, x + v, TECHO, z1);
    if (numero === 1) {
      // Puerta de vidrio abierta con dintel.
      c.caja('vidrio', x - v, 2.4, -0.9, x + v, TECHO, 0.9);
      c.caja('metal', x - 0.06, 2.34, -0.95, x + 0.06, 2.4, 0.95);
      for (const z of [-0.95, 0.95]) c.caja('metal', x - 0.06, 0, z - 0.03, x + 0.06, 2.4, z + 0.03);
    }
    c.caja('metal', x - 0.05, TECHO - 0.06, zMin, x + 0.05, TECHO, zMax);
    for (let z = zMin + 2; z < zMax; z += 2) {
      if (numero === 1 && Math.abs(z) < 1.2) continue;
      c.caja('metal', x - 0.05, ANTEPECHO, z - 0.03, x + 0.05, TECHO, z + 0.03);
    }
  }
  for (const x of [-16, -8, 0, 8, 16]) {
    for (const z of [zMin, zMax]) c.cajaRedonda('columna', x - 0.24, 0, z - 0.24, x + 0.24, TECHO, z + 0.24, 0.04);
  }
}

export function construirPiso(numero, materiales) {
  const c = new Cubetas();
  const { xMin, xMax, zMin, zMax } = PLANTA;

  // Losa con canto redondeado y franja de luz en todo el borde.
  c.cajaRedonda('losa', xMin - 0.15, -LOSA, zMin - 0.15, xMax + 0.15, 0, zMax + 0.15, 0.05);
  c.caja('canto', xMin - 0.12, -LOSA - 0.03, zMin - 0.12, xMax + 0.12, -LOSA + 0.01, zMax + 0.12);
  const f0 = -0.15;
  const f1 = -0.1;
  const e = 0.165;
  c.caja('acento', xMin - e, f0, zMin - e, xMax + e, f1, zMin - e + 0.02);
  c.caja('acento', xMin - e, f0, zMax + e - 0.02, xMax + e, f1, zMax + e);
  c.caja('acento', xMin - e, f0, zMin - e, xMin - e + 0.02, f1, zMax + e);
  c.caja('acento', xMax + e - 0.02, f0, zMin - e, xMax + e, f1, zMax + e);

  // Acabados de piso.
  c.caja('pasillo', xMin + EXT / 2, 0, -1 + INT / 2, xMax - EXT / 2, 0.01, 1 - INT / 2);
  const aseo = recinto('aseo');
  c.caja('pasillo', aseo.x0 + EXT / 2, 0, aseo.z0 + EXT / 2, aseo.x1 - INT / 2, 0.01, aseo.z1 - INT / 2);
  const sala = recinto('sala');
  c.caja('piso', sala.x0 + INT / 2, 0, sala.z0 + EXT / 2, sala.x1 - EXT / 2, 0.012, sala.z1 - INT / 2);

  fachada(c, numero);

  // Muros del pasillo con sus puertas.
  const puerta = (clave, ancho = PLANTA.anchoPuerta) => ({ c: recinto(clave).puertaX, ancho });
  c.muro(xMin, -1, xMax, -1, INT, [puerta('aseo'), puerta('mujeres'), puerta('ascensor', 1.4), puerta('escalera', 3.0), puerta('hombres'), puerta('sala')]);
  c.muro(xMin, 1, xMax, 1, INT, ['aula1', 'aula2', 'aula3', 'aula4'].map((k) => puerta(k)));

  // Divisiones de la crujía de atrás y de las aulas.
  for (const x of [-12, -4, -0.4, 4, 12]) c.muro(x, zMin, x, -1, INT);
  c.muro(-4, -4.4, -0.4, -4.4, INT);
  for (const x of [-8, 0, 8]) c.muro(x, 1, x, zMax, INT);

  // Núcleo: ascensor, ducto y escalera.
  c.caja('metal', -3.9, 0, -4.3, -0.5, 0.02, -1.1);
  c.caja('metal', -2.95, 0, -1.09, -2.85, ALTURA_CORTE, -0.92);
  c.caja('metal', -1.55, 0, -1.09, -1.45, ALTURA_CORTE, -0.92);
  c.caja('ducto', -3.9, 0, -6.9, -0.5, ALTURA_CORTE, -4.5);
  const peldanos = 9;
  for (let i = 0; i < peldanos; i++) {
    const z1 = -1.7 - i * 0.4;
    c.caja('canto', -0.3, 0, z1 - 0.4, 1.7, ((i + 1) * ALTURA_CORTE) / peldanos, z1);
    c.caja('metal', -0.3, ((i + 1) * ALTURA_CORTE) / peldanos, z1 - 0.05, 1.7, ((i + 1) * ALTURA_CORTE) / peldanos + 0.01, z1);
  }
  c.caja('canto', -0.3, 0, -6.9, 3.9, ALTURA_CORTE, -5.3);
  c.caja('tabique', 1.78, 0, -5.3, 1.86, 1.0, -1.7);
  c.caja('metal', 1.76, 1.0, -5.3, 1.88, 1.04, -1.7);

  // Baños.
  bano(c, 'mujeres');
  bano(c, 'hombres');

  // Cuarto de aseo y sala de profesores.
  c.caja('metal', -15.85, 0, -6.85, -12.2, 1.3, -6.45);
  for (const x of [-15.3, -14.3, -13.3]) c.cilindro('tabique', x, 1.3, -6.65, 0.12, 0.28, 10);
  c.cajaRedonda('loza', -15.85, 0.6, -2.4, -15.35, 0.9, -1.6, 0.03);
  c.cajaRedonda('madera', 12.9, 0.72, -5.2, 15.1, 0.77, -2.8, 0.02);
  c.caja('silla', 13.0, 0, -5.1, 15.0, 0.72, -2.9);
  for (const z of [-4.6, -3.4]) {
    c.cajaRedonda('silla', 12.45, 0.42, z - 0.22, 12.8, 0.46, z + 0.22, 0.015);
    c.cajaRedonda('silla', 15.2, 0.42, z - 0.22, 15.55, 0.46, z + 0.22, 0.015);
  }
  planta(c, 15.4, -1.6, 1.0);
  planta(c, 12.6, -6.4, 0.8);

  for (const k of ['aula1', 'aula2', 'aula3', 'aula4']) aula(c, recinto(k));

  return c.construir(materiales);
}
