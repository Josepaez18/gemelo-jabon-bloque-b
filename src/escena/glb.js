// Carga opcional de un modelo .glb (Blender, SketchUp) para reemplazar la maqueta genérica.
// Si el modelo trae nodos llamados "piso-1" … "piso-6", cada uno se monta en su piso
// y funcionan la vista por piso y la vista explotada.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function cargarModelo(fuente) {
  const cargador = new GLTFLoader();
  if (typeof File !== 'undefined' && fuente instanceof File) {
    const datos = await fuente.arrayBuffer();
    return new Promise((ok, mal) => cargador.parse(datos, '', ok, mal));
  }
  return cargador.loadAsync(fuente);
}

export function nodosPorPiso(raiz, pisos) {
  const mapa = new Map();
  raiz.traverse((o) => {
    const m = /^piso[-_ ]?(\d+)$/i.exec(o.name.trim());
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= pisos && !mapa.has(n)) mapa.set(n, o);
    }
  });
  return mapa;
}
