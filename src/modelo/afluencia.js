// Afluencia de personas según la hora, el día y el piso.
import { SUPUESTOS } from '../config/supuestos.js';

export function horaLocal(ms, zonaMin = SUPUESTOS.zonaHorariaMin) {
  const d = new Date(ms + zonaMin * 60000);
  return {
    dia: d.getUTCDay(),
    hora: d.getUTCHours(),
    minuto: d.getUTCMinutes(),
    segundo: d.getUTCSeconds(),
    horaDecimal: d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600,
    fecha: { anio: d.getUTCFullYear(), mes: d.getUTCMonth(), dia: d.getUTCDate() },
  };
}

// Milisegundos UTC de una hora local dada (día calendario de `ms`, más `diasExtra`).
export function msDeHoraLocal(ms, hora, diasExtra = 0, zonaMin = SUPUESTOS.zonaHorariaMin) {
  const { fecha } = horaLocal(ms, zonaMin);
  return Date.UTC(fecha.anio, fecha.mes, fecha.dia + diasExtra, hora) - zonaMin * 60000;
}

export function configDia(dia, cfg = SUPUESTOS) {
  const h = cfg.horario;
  const d = h.dias[dia];
  return { abre: d.abre ?? h.abre, cierra: d.cierra ?? h.cierra, abierto: d.abierto, factor: d.factor, nombre: d.nombre };
}

export function estaAbierto(ms, cfg = SUPUESTOS) {
  const t = horaLocal(ms, cfg.zonaHorariaMin);
  const d = configDia(t.dia, cfg);
  return d.abierto && t.horaDecimal >= d.abre && t.horaDecimal < d.cierra;
}

export function factorPiso(piso, cfg = SUPUESTOS) {
  const f = cfg.afluencia.factorPiso;
  return f[piso - 1] ?? f[f.length - 1];
}

// Usos por hora en un baño de un piso con factor 1 (el piso se aplica aparte).
export function tasaBase(ms, cfg = SUPUESTOS) {
  const t = horaLocal(ms, cfg.zonaHorariaMin);
  const d = configDia(t.dia, cfg);
  if (!(d.abierto && t.horaDecimal >= d.abre && t.horaDecimal < d.cierra)) return 0;
  return cfg.afluencia.usosHoraPico * (cfg.afluencia.perfilHora[t.hora] ?? 0) * d.factor;
}

// Usos esperados por hora en un baño del piso indicado (1..6).
export function tasaUsos(ms, piso, cfg = SUPUESTOS) {
  return tasaBase(ms, cfg) * factorPiso(piso, cfg);
}
