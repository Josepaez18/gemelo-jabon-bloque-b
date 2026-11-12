// Formatos de fecha, hora y números para la interfaz (hora de Colombia, -05:00).
import { SUPUESTOS } from '../config/supuestos.js';
import { horaLocal } from '../modelo/afluencia.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const p2 = (n) => String(n).padStart(2, '0');

export function hora(ms, conSegundos = true) {
  const t = horaLocal(ms);
  return `${p2(t.hora)}:${p2(t.minuto)}${conSegundos ? `:${p2(t.segundo)}` : ''}`;
}

export function fecha(ms) {
  const t = horaLocal(ms);
  return `${SUPUESTOS.horario.dias[t.dia].nombre} ${t.fecha.dia} ${MESES[t.fecha.mes]}`;
}

export function diaHora(ms) {
  const t = horaLocal(ms);
  return `${DIAS_CORTOS[t.dia]} ${hora(ms)}`;
}

export function hace(ms, ahora) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.max(0, Math.round((ahora - ms) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `hace ${h} h ${m % 60} min`;
  return `hace ${Math.floor(h / 24)} días`;
}

export function duracion(ms) {
  const s = Math.round(ms / 1000);
  if (s < 120) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 120) return `${m} min`;
  return `${(m / 60).toLocaleString('es-CO', { maximumFractionDigits: 1 })} h`;
}

export function numero(n, decimales = 0) {
  return n.toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// Todo texto que venga de mensajes MQTT pasa por aquí antes de ir a innerHTML.
export function esc(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
