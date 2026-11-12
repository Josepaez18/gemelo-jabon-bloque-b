// Topología del Bloque B. Las coordenadas (en metros) las usan tanto la simulación
// (rutas de aseo) como la escena 3D, para que ambas cuenten la misma historia.
//
// Planta tipo (vista desde arriba, +z = fachada principal):
//
//   z=-7 ┌────┬──────────┬─────┬─────┬──────────┬────┐
//        │aseo│  baño M  │asc. │esc. │  baño H  │sala│
//   z=-1 ├────┴──────────┴─────┴─────┴──────────┴────┤
//        │ pasillo (z = 0)                            │
//   z=+1 ├──────────┬──────────┬──────────┬───────────┤
//        │  aula 1  │  aula 2  │  aula 3  │  aula 4   │
//   z=+7 └──────────┴──────────┴──────────┴───────────┘
//      x=-16                  x=0                  x=+16

export const NOMBRE_EDIFICIO = 'Bloque B';
export const PISOS = 6;
export const ALTO_PISO = 3.5;
export const ALTURA_CORTE = 1.4;

export const PLANTA = {
  xMin: -16,
  xMax: 16,
  zMin: -7,
  zMax: 7,
  pasillo: { zMin: -1, zMax: 1 },
  anchoPuerta: 1.0,
  recintos: [
    { clave: 'aseo', nombre: 'Cuarto de aseo', x0: -16, x1: -12, z0: -7, z1: -1, puertaX: -13 },
    { clave: 'mujeres', nombre: 'Baño de mujeres', x0: -12, x1: -4, z0: -7, z1: -1, puertaX: -10.5 },
    { clave: 'ascensor', nombre: 'Ascensor', x0: -4, x1: -0.4, z0: -4.4, z1: -1, puertaX: -2.2 },
    { clave: 'ducto', nombre: 'Ducto', x0: -4, x1: -0.4, z0: -7, z1: -4.4, puertaX: null },
    { clave: 'escalera', nombre: 'Escalera', x0: -0.4, x1: 4, z0: -7, z1: -1, puertaX: 1.8, abierta: true },
    { clave: 'hombres', nombre: 'Baño de hombres', x0: 4, x1: 12, z0: -7, z1: -1, puertaX: 10.5 },
    { clave: 'sala', nombre: 'Sala de profesores', x0: 12, x1: 16, z0: -7, z1: -1, puertaX: 13 },
    { clave: 'aula1', nombre: 'Aula', x0: -16, x1: -8, z0: 1, z1: 7, puertaX: -9 },
    { clave: 'aula2', nombre: 'Aula', x0: -8, x1: 0, z0: 1, z1: 7, puertaX: -1 },
    { clave: 'aula3', nombre: 'Aula', x0: 0, x1: 8, z0: 1, z1: 7, puertaX: 1 },
    { clave: 'aula4', nombre: 'Aula', x0: 8, x1: 16, z0: 1, z1: 7, puertaX: 9 },
  ],
};

export function recinto(clave) {
  return PLANTA.recintos.find((r) => r.clave === clave);
}

// Detalles del baño que comparten modelo y escena. lado = -1 (mujeres) o +1 (hombres).
export function geometriaBano(genero) {
  const lado = genero === 'mujeres' ? -1 : 1;
  return {
    lado,
    muroX: lado * 4, // muro compartido con el núcleo, donde van lavamanos y dispensador
    dispensador: { x: lado * 4.16, y: 1.15, z: -3.5 },
    medidor: { x: lado * 4.85, y: 1.72, z: -3.5 },
    lavamanos: [-4.0, -3.0, -2.0].map((z) => ({ x: lado * 4.35, z })),
    cubiculos: genero === 'mujeres' ? 4 : 2,
    orinales: genero === 'mujeres' ? 0 : 3,
  };
}

// Cadenas de puntos desde el pasillo (índice 0) hasta el interior de cada lugar.
function cadena(clave) {
  switch (clave) {
    case 'aseo':
      return [{ x: -13, z: 0 }, { x: -13, z: -1 }, { x: -13.6, z: -2.4 }];
    case 'ascensor':
      return [{ x: -2.2, z: 0 }, { x: -2.2, z: -1 }, { x: -2.2, z: -2.6 }];
    case 'escalera':
      return [{ x: 2.9, z: 0 }, { x: 2.9, z: -1.5 }];
    case 'mujeres':
    case 'hombres': {
      const g = geometriaBano(clave);
      const px = recinto(clave).puertaX;
      return [{ x: px, z: 0 }, { x: px, z: -1 }, { x: px, z: -2 }, { x: g.lado * 5.0, z: g.dispensador.z }];
    }
    default: {
      const r = recinto(clave);
      const zDentro = r.z0 > 0 ? 2 : -2;
      return [{ x: r.puertaX, z: 0 }, { x: r.puertaX, z: r.z0 > 0 ? 1 : -1 }, { x: r.puertaX, z: zDentro }];
    }
  }
}

const CADENAS = {};
export function puntosDe(clave) {
  if (!CADENAS[clave]) CADENAS[clave] = cadena(clave);
  return CADENAS[clave];
}

export function punto(piso, clave, idx) {
  const p = puntosDe(clave)[idx];
  return { piso, clave, idx, x: p.x, z: p.z };
}

export function ultimoIndice(clave) {
  return puntosDe(clave).length - 1;
}

// Ruta caminando por el pasillo y, si cambia de piso, por el ascensor.
// origen y destino: { piso, clave, idx }.
export function ruta(origen, destino) {
  const pts = [];
  const empujar = (p) => {
    const u = pts[pts.length - 1];
    if (!u || u.piso !== p.piso || u.x !== p.x || u.z !== p.z) pts.push(p);
  };
  if (origen.piso === destino.piso && origen.clave === destino.clave) {
    const paso = destino.idx >= origen.idx ? 1 : -1;
    for (let i = origen.idx; i !== destino.idx + paso; i += paso) empujar(punto(origen.piso, origen.clave, i));
    return pts;
  }
  for (let i = origen.idx; i >= 0; i--) empujar(punto(origen.piso, origen.clave, i));
  if (origen.piso !== destino.piso) {
    const ua = ultimoIndice('ascensor');
    for (let i = 0; i <= ua; i++) empujar(punto(origen.piso, 'ascensor', i));
    empujar({ ...punto(destino.piso, 'ascensor', ua), ascensor: true });
    for (let i = ua; i >= 0; i--) empujar(punto(destino.piso, 'ascensor', i));
  }
  for (let i = 0; i <= destino.idx; i++) empujar(punto(destino.piso, destino.clave, i));
  return pts;
}

// d1 = piso 1 mujeres, d2 = piso 1 hombres, d3 = piso 2 mujeres, …
export const DISPENSADORES = Array.from({ length: PISOS * 2 }, (_, i) => {
  const n = i + 1;
  const piso = Math.floor(i / 2) + 1;
  const genero = i % 2 === 0 ? 'mujeres' : 'hombres';
  return {
    n,
    id: `bano-bloque-b-d${n}`,
    corto: `d${n}`,
    piso,
    genero,
    nombre: `Piso ${piso} · ${genero === 'mujeres' ? 'Mujeres' : 'Hombres'}`,
  };
});

export const IDS = DISPENSADORES.map((d) => d.id);

export function infoDispensador(id) {
  return DISPENSADORES.find((d) => d.id === id);
}

export function lugarDispensador(id) {
  const d = infoDispensador(id);
  return { piso: d.piso, clave: d.genero, idx: ultimoIndice(d.genero) };
}

export const LUGAR_BASE = { piso: 1, clave: 'aseo', idx: ultimoIndice('aseo') };
