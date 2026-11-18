// Contrato del mensaje que publica el ESP32 (7 campos, en este orden).
import { crearHmac } from './hmac.js';

export const CAMPOS = ['id', 'variable', 'valor', 'unidad', 'momento', 'version', 'firma'];
export const VARIABLE = 'nivel_jabon';
export const UNIDAD = '%';
export const VERSION = 1;
export const TEMA_BASE = 'ucc7788/jabon';

// Qué es cada campo y qué regla del receptor lo valida. El panel de control lo muestra tal cual
// (pestaña "Contrato del dato"); una prueba revisa que siga el mismo orden que CAMPOS.
export const ESQUEMA = [
  { campo: 'id', tipo: 'texto', reglas: 'R3', descripcion: 'dispensador registrado; debe coincidir con el final del tema' },
  { campo: 'variable', tipo: 'texto', reglas: 'R4', descripcion: `siempre "${VARIABLE}"` },
  { campo: 'valor', tipo: 'entero', reglas: 'R2 · R6 · R7 · R8', descripcion: 'nivel en % del volumen útil; entero (nunca 25.0 ni null)' },
  { campo: 'unidad', tipo: 'texto', reglas: 'R4', descripcion: `siempre "${UNIDAD}"` },
  { campo: 'momento', tipo: 'texto ISO 8601', reglas: 'R5', descripcion: 'hora de la lectura con zona horaria y sin milisegundos' },
  { campo: 'version', tipo: 'entero', reglas: 'R2 · R4', descripcion: `versión del contrato: ${VERSION}` },
  { campo: 'firma', tipo: 'texto hex (64)', reglas: 'R3', descripcion: 'HMAC-SHA256 de id|variable|valor|unidad|momento|version' },
];

// Vector de prueba obligatorio: con estos campos y la clave de prueba de d2, la firma debe dar esto.
export const VECTOR_PRUEBA = {
  campos: { id: 'bano-bloque-b-d2', variable: VARIABLE, valor: 25, unidad: UNIDAD, momento: '2026-10-20T09:15:00-05:00', version: VERSION },
  firma: '270e0a5dbe4bb4f4914d0894453b2714d13dce84a0c79c8bf2ac8a718842269f',
};

export function temaDe(id, base = TEMA_BASE) {
  return `${base}/${id}`;
}

export function clavePrueba(id) {
  return `clave-prueba-${id}`;
}

export function textoAFirmar({ id, variable, valor, unidad, momento, version }) {
  return `${id}|${variable}|${valor}|${unidad}|${momento}|${version}`;
}

const hmacs = new Map();
function hmacDe(clave) {
  let f = hmacs.get(clave);
  if (!f) {
    f = crearHmac(clave);
    hmacs.set(clave, f);
  }
  return f;
}

export function firmar(campos, clave = clavePrueba(campos.id)) {
  return hmacDe(clave)(textoAFirmar(campos));
}

// Arma el JSON compacto tal como lo envía el ESP32.
export function armarMensaje({ id, valor, momento, clave, variable = VARIABLE, unidad = UNIDAD, version = VERSION }) {
  const campos = { id, variable, valor, unidad, momento, version };
  const firma = firmar(campos, clave ?? clavePrueba(id));
  return JSON.stringify({ ...campos, firma });
}

// Fecha local con zona fija, p. ej. 2026-10-20T09:15:00-05:00 (sin milisegundos).
export function formatearMomento(ms, zonaMin = -300) {
  const d = new Date(Math.floor(ms / 1000) * 1000 + zonaMin * 60000);
  const p = (n) => String(n).padStart(2, '0');
  const signo = zonaMin < 0 ? '-' : '+';
  const abs = Math.abs(zonaMin);
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}` +
    `${signo}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}

const ISO_CON_ZONA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

// Devuelve milisegundos UTC, o NaN si no es ISO 8601 con zona horaria.
export function leerMomento(texto) {
  if (typeof texto !== 'string') return NaN;
  const m = ISO_CON_ZONA.exec(texto);
  if (!m) return NaN;
  const [, a, mes, dia, h, min, s, frac, zona] = m;
  const N = Number;
  if (N(mes) < 1 || N(mes) > 12 || N(dia) < 1 || N(dia) > 31 || N(h) > 23 || N(min) > 59 || N(s) > 59) return NaN;
  let ms = Date.UTC(N(a), N(mes) - 1, N(dia), N(h), N(min), N(s), frac ? Math.floor(Number(frac) * 1000) : 0);
  if (new Date(ms).getUTCDate() !== N(dia)) return NaN; // 31 de febrero, etc.
  if (zona !== 'Z') {
    const signo = zona[0] === '-' ? -1 : 1;
    const zh = N(zona.slice(1, 3));
    const zm = N(zona.slice(4, 6));
    ms -= signo * (zh * 60 + zm) * 60000;
  }
  return ms;
}
