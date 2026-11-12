// Conversión del HC-SR04 a nivel de jabón, igual que en el ESP32.
import { SUPUESTOS } from '../config/supuestos.js';

const D = SUPUESTOS.dispositivo;

// round() de C/Arduino: redondea .5 alejándose de cero (Math.round no lo hace con negativos).
export function redondearC(x) {
  return Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
}

export function nivelCrudo(d, cfg = D) {
  return redondearC(((cfg.dVacioCm - d) / (cfg.dVacioCm - cfg.dLlenoCm)) * 100);
}

// Solo se absorben 3 puntos de error; fuera de eso el valor imposible se envía igual.
export function nivelDesdeDistancia(d, cfg = D) {
  const n = nivelCrudo(d, cfg);
  const tol = cfg.toleranciaPuntos;
  if (n < 0 && n >= -tol) return 0;
  if (n > 100 && n <= 100 + tol) return 100;
  return n;
}

export function distanciaDesdeNivel(porcentaje, cfg = D) {
  return cfg.dVacioCm - (porcentaje / 100) * (cfg.dVacioCm - cfg.dLlenoCm);
}
