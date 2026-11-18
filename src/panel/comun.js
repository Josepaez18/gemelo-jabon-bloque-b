// Utilidades compartidas por las vistas del panel de control.
import { SUPUESTOS } from '../config/supuestos.js';
import { CAMPOS, ESQUEMA, textoAFirmar } from '../modelo/contrato.js';
import { infoDispensador } from '../modelo/edificio.js';
import { REGLAS, TEXTOS } from '../modelo/receptor.js';
import { esc } from '../interfaz/formato.js';

export const $ = (s, raiz = document) => raiz.querySelector(s);
export const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)];
export const SIMBOLO = { ok: '✓', aviso: '!', falla: '✕', pendiente: '·' };
export const NOMBRE_RESULTADO = { ok: 'bien', aviso: 'atención', falla: 'falla', pendiente: 'sin información' };
export const R = SUPUESTOS.receptor;

// Cambia el contenido solo si cambió: así no se pierde el foco ni el texto seleccionado.
const cache = new WeakMap();
export function poner(el, html) {
  if (cache.get(el) !== html) {
    el.innerHTML = html;
    cache.set(el, html);
  }
}

export function marcar(grupo, boton) {
  for (const b of grupo.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === boton));
}

export function clasificar(v) {
  if (v >= R.umbralBajo) return 'normal';
  if (v >= R.umbralVacio) return 'bajo';
  return 'vacio';
}

export function bytes(texto) {
  return new TextEncoder().encode(texto).length;
}

// Nombre corto de quien envía, a partir del tema (sirve también para mensajes sin atribuir).
export function quienDe(tema) {
  const pre = `${R.temaBase}/`;
  if (!tema.startsWith(pre)) return tema;
  const id = tema.slice(pre.length);
  return infoDispensador(id)?.corto ?? id;
}

export function leerJson(carga) {
  try {
    const d = JSON.parse(carga);
    return d && typeof d === 'object' && !Array.isArray(d) ? d : null;
  } catch {
    return null;
  }
}

// Resultado de cada regla para un mensaje: las anteriores a la que falló pasaron y las
// siguientes no se evaluaron (el receptor se detiene en el primer rechazo).
export function recorrido({ aceptado, regla }) {
  const i = aceptado ? REGLAS.length : REGLAS.findIndex((x) => x.regla === regla);
  return REGLAS.map((x, j) => ({ ...x, estado: j < i ? 'ok' : j === i ? 'falla' : 'pendiente' }));
}

export function reglasHtml(r) {
  return `<ol class="pc-reglas">${recorrido(r)
    .map(
      (x) => `<li data-r="${x.estado}">
        <span class="s" aria-hidden="true">${SIMBOLO[x.estado]}</span>
        <b>${x.regla}</b><span class="capa" data-capa="${x.capa}">${x.capa}</span>
        <span>${esc(x.comprueba(R))}${x.estado === 'falla' ? `<em>${esc(r.detalle ?? '')}</em>` : ''}${x.estado === 'pendiente' ? ' <span class="pc-tenue">(no se evaluó)</span>' : ''}</span>
      </li>`,
    )
    .join('')}</ol>`;
}

// Qué hace el receptor con un mensaje según su resultado: es la diferencia entre las dos capas.
export function efectoHtml(r, tema) {
  if (r.aceptado) {
    return `<p><span class="pc-res" data-r="ok">✓ Aceptado</span> Cuenta como señal de vida y pasa a ser el último valor válido de <b>${esc(quienDe(tema))}</b>: ${r.valor} % (${clasificar(r.valor)}).</p>
      <p class="pc-registro"><code>${esc(TEXTOS.aceptado(r.id, r.valor, clasificar(r.valor)))}</code></p>`;
  }
  const red = REGLAS.find((x) => x.regla === r.regla)?.capa === 'red';
  const que = red
    ? 'Capa de red: no se atribuye a ningún dispensador y <b>no cuenta como señal de vida</b>. El estado del nodo no cambia.'
    : `Capa de negocio: el mensaje es auténtico, así que <b>${esc(quienDe(tema))} sigue en línea</b>, pero el dato no se usa: el nodo pasa a <b>revisar</b> y para aseo vale su último valor válido.`;
  return `<p><span class="pc-res" data-r="falla">✕ Rechazado por ${esc(r.regla)}</span> ${que}</p>
    <p class="pc-registro"><code>${esc(TEXTOS.rechazado(r.id ?? tema, r.detalle ?? ''))}</code></p>`;
}

// Tabla con los campos que trae una carga, comparados con el contrato.
export function camposHtml(datos) {
  if (!datos) return '<p class="pc-tenue">La carga no es un objeto JSON: no hay campos que leer.</p>';
  const filas = ESQUEMA.map((c) => {
    const hay = Object.hasOwn(datos, c.campo);
    const valor = hay ? JSON.stringify(datos[c.campo]) : '';
    return `<tr${hay ? '' : ' class="falta"'}><th scope="row">${c.campo}</th><td><code>${hay ? esc(valor.length > 70 ? `${valor.slice(0, 70)}…` : valor) : 'falta'}</code></td><td>${c.reglas}</td></tr>`;
  });
  const extra = Object.keys(datos).filter((k) => !CAMPOS.includes(k));
  if (extra.length) filas.push(`<tr><th scope="row" class="pc-tenue">otros</th><td colspan="2" class="pc-tenue">${esc(extra.join(', '))} (el receptor los ignora)</td></tr>`);
  return `<table class="pc-campos"><thead><tr><th>Campo</th><th>Valor recibido</th><th>Lo valida</th></tr></thead><tbody>${filas.join('')}</tbody></table>`;
}

export function firmaHtml(datos, r) {
  if (!datos || !CAMPOS.every((c) => Object.hasOwn(datos, c))) {
    return '<p class="pc-tenue">No se pudo comprobar: el mensaje no llegó a tener los 7 campos.</p>';
  }
  const texto = textoAFirmar(datos);
  const firma = String(datos.firma);
  const etapa = recorrido(r).find((x) => x.regla === 'R3').estado;
  let veredicto;
  if (etapa === 'ok') veredicto = '<span class="pc-res" data-r="ok">✓ Coincide</span> con la firma calculada con la clave del dispensador.';
  else if (etapa === 'falla' && /firma/.test(r.detalle ?? '')) veredicto = '<span class="pc-res" data-r="falla">✕ No coincide</span>: el mensaje no se firmó con la clave de este dispensador, o se cambió después de firmarlo.';
  else veredicto = `<span class="pc-res" data-r="pendiente">· Sin comprobar</span>: ${esc(r.detalle ?? 'falló antes')}.`;
  return `<dl class="pc-dl">
      <dt>Texto que se firma</dt><dd><code>${esc(texto.length > 200 ? `${texto.slice(0, 200)}…` : texto)}</code></dd>
      <dt>Firma recibida</dt><dd><code>${esc(firma.length > 80 ? `${firma.slice(0, 80)}…` : firma)}</code></dd>
      <dt>Resultado</dt><dd>${veredicto}</dd>
    </dl>
    <p class="pc-tenue">El receptor nunca muestra la firma esperada: sería regalarle una firma válida a quien quiera falsificar un mensaje.</p>`;
}
