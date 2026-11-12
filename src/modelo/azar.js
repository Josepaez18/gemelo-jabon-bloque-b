// Generador pseudoaleatorio con semilla (mulberry32). Cada flujo es independiente:
// así los usos de jabón no cambian aunque cambie la estrategia de aseo.

export function crearAzar(semilla) {
  let s = semillaEntera(semilla);
  const azar = {
    siguiente() {
      s = (s + 0x6d2b79f5) | 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    entre(min, max) {
      return min + (max - min) * azar.siguiente();
    },
    entero(min, max) {
      return Math.floor(azar.entre(min, max + 1));
    },
    normal(media = 0, desv = 1) {
      const u = 1 - azar.siguiente();
      const v = azar.siguiente();
      return media + desv * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    // Número de eventos en un intervalo con tasa esperada lambda (método de Knuth).
    poisson(lambda) {
      if (lambda <= 0) return 0;
      const limite = Math.exp(-lambda);
      let k = 0;
      let p = azar.siguiente();
      while (p > limite) {
        k++;
        p *= azar.siguiente();
      }
      return k;
    },
  };
  return azar;
}

// Deriva una semilla para un flujo con nombre (por ejemplo "usos:bano-bloque-b-d1").
export function derivarSemilla(semilla, nombre) {
  let h = semillaEntera(semilla) ^ 0x9e3779b9;
  for (let i = 0; i < nombre.length; i++) {
    h = Math.imul(h ^ nombre.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

function semillaEntera(semilla) {
  if (typeof semilla === 'number' && Number.isFinite(semilla)) return semilla >>> 0;
  const texto = String(semilla);
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}
