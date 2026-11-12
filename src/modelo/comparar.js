// "Comparar 7 días": las 3 estrategias con la misma semilla y los mismos usos.
import { ESTRATEGIAS, SUPUESTOS } from '../config/supuestos.js';
import { msDeHoraLocal } from './afluencia.js';
import { leerMomento } from './contrato.js';
import { Simulacion } from './simulacion.js';

export function inicioComparacion(cfg = SUPUESTOS) {
  return msDeHoraLocal(leerMomento(cfg.inicio), 0, 0, cfg.zonaHorariaMin);
}

export function compararEstrategias({ cfg = SUPUESTOS, semilla = cfg.semilla, dias = 7, inicioMs = inicioComparacion(cfg), alAvanzar } = {}) {
  const claves = Object.keys(ESTRATEGIAS);
  return claves.map((estrategia, i) => {
    const sim = new Simulacion({ cfg, semilla, estrategia, inicioMs, registrar: false });
    for (let d = 0; d < dias; d++) {
      sim.avanzar(86400);
      alAvanzar?.((i * dias + d + 1) / (claves.length * dias));
    }
    return { estrategia, nombre: ESTRATEGIAS[estrategia].nombre, ...sim.totales() };
  });
}
