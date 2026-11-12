// Texturas dibujadas en un canvas (sin archivos externos). Son claras y casi grises:
// el color lo pone el material, así sirven en los dos temas.
import * as THREE from 'three';

function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lienzo(lado = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = lado;
  return { c, g: c.getContext('2d'), lado };
}

function gris(v) {
  const n = Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${n},${n},${n})`;
}

function textura(c, anisotropia) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropia;
  return t;
}

// Baldosas cuadradas con junta: baños.
function baldosas(n, junta, base, variacion, semilla) {
  const { c, g, lado } = lienzo();
  const r = azar(semilla);
  g.fillStyle = gris(base - 34);
  g.fillRect(0, 0, lado, lado);
  const paso = lado / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      g.fillStyle = gris(base + (r() - 0.5) * variacion);
      g.fillRect(i * paso + junta / 2, j * paso + junta / 2, paso - junta, paso - junta);
    }
  }
  return c;
}

// Tablas de madera con veta: aulas y sala.
function madera(semilla) {
  const { c, g, lado } = lienzo();
  const r = azar(semilla);
  const filas = 8;
  const alto = lado / filas;
  for (let f = 0; f < filas; f++) {
    let x = -r() * lado * 0.5;
    while (x < lado) {
      const largo = lado * (0.35 + r() * 0.4);
      g.fillStyle = gris(222 + (r() - 0.5) * 26);
      g.fillRect(x, f * alto, largo, alto);
      g.strokeStyle = 'rgba(0,0,0,0.07)';
      g.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        const y = f * alto + 3 + r() * (alto - 6);
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + largo * 0.3, y + (r() - 0.5) * 4, x + largo * 0.7, y + (r() - 0.5) * 4, x + largo, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x, f * alto, 2, alto);
      x += largo;
    }
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(0, f * alto, lado, 1.5);
  }
  return c;
}

// Adoquines trabados: plaza y caminos.
function adoquines(semilla) {
  const { c, g, lado } = lienzo();
  const r = azar(semilla);
  g.fillStyle = gris(196);
  g.fillRect(0, 0, lado, lado);
  const filas = 8;
  const alto = lado / filas;
  const largo = lado / 4;
  for (let f = 0; f < filas; f++) {
    const desfase = f % 2 ? largo / 2 : 0;
    for (let k = -1; k < 5; k++) {
      g.fillStyle = gris(232 + (r() - 0.5) * 18);
      g.fillRect(k * largo + desfase + 2, f * alto + 2, largo - 4, alto - 4);
    }
  }
  return c;
}

// Concreto con un ruido muy suave: losas y pasillo.
function concreto(semilla) {
  const { c, g, lado } = lienzo(256);
  const r = azar(semilla);
  g.fillStyle = gris(236);
  g.fillRect(0, 0, lado, lado);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(0,0,0,${0.015 + r() * 0.03})`;
    const s = 1 + r() * 2.5;
    g.fillRect(r() * lado, r() * lado, s, s);
  }
  // Juntas cada medio canvas: losetas grandes.
  g.fillStyle = 'rgba(0,0,0,0.09)';
  g.fillRect(0, 0, lado, 1.5);
  g.fillRect(0, 0, 1.5, lado);
  return c;
}

// Metros que cubre una repetición de cada textura.
export const ESCALA_TEXTURA = { baldosa: 1.8, madera: 4.5, adoquin: 3.2, concreto: 3.0 };

export function crearTexturas(renderer) {
  const a = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return {
    baldosa: textura(baldosas(6, 3, 238, 10, 11), a),
    madera: textura(madera(7), a),
    adoquin: textura(adoquines(5), a),
    concreto: textura(concreto(3), a),
  };
}

// UV en coordenadas del mundo (proyección por cara): la textura conserva su tamaño real
// aunque las cajas se fusionen en una sola geometría.
export function uvMundo(geo, metrosPorRepeticion) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const k = 1 / metrosPorRepeticion;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) * k, p.getZ(i) * k);
    else if (ax >= az) uv.setXY(i, p.getZ(i) * k, p.getY(i) * k);
    else uv.setXY(i, p.getX(i) * k, p.getY(i) * k);
  }
  uv.needsUpdate = true;
  return geo;
}

export { azar };
