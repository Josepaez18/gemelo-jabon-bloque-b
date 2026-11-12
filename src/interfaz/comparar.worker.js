// Corre "Comparar 7 días" fuera del hilo principal para que la maqueta siga fluida.
import { compararEstrategias } from '../modelo/comparar.js';

self.onmessage = (ev) => {
  const { semilla, dias } = ev.data;
  let ultimo = 0;
  const resultados = compararEstrategias({
    semilla,
    dias,
    alAvanzar: (f) => {
      if (f - ultimo >= 0.04 || f === 1) {
        ultimo = f;
        self.postMessage({ tipo: 'progreso', f });
      }
    },
  });
  self.postMessage({ tipo: 'listo', resultados });
};
