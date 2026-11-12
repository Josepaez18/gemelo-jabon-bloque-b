// Gráficas SVG pequeñas con tooltip: historial de nivel (2 series) y perfil de afluencia (barras).
import { esc } from './formato.js';

const NS = 'http://www.w3.org/2000/svg';

function tooltip(contenedor) {
  let t = contenedor.querySelector('.tooltip');
  if (!t) {
    t = document.createElement('div');
    t.className = 'tooltip';
    t.hidden = true;
    contenedor.appendChild(t);
  }
  return t;
}

// Valor de una serie escalonada (el último valor válido se mantiene hasta el siguiente).
function valorEn(puntos, ms, escalon) {
  if (!puntos.length || ms < puntos[0].ms) return null;
  let i = 0;
  while (i + 1 < puntos.length && puntos[i + 1].ms <= ms) i++;
  if (escalon || i + 1 >= puntos.length) return puntos[i].v;
  const a = puntos[i];
  const b = puntos[i + 1];
  return a.v + ((b.v - a.v) * (ms - a.ms)) / (b.ms - a.ms);
}

// series: [{ nombre, clase: 'serie-1', puntos: [{ms, v}], escalon }]
export function graficaNivel(contenedor, { series, desde, hasta, umbral = 30, formatoTiempo }) {
  const ancho = Math.max(240, contenedor.clientWidth || 340);
  const alto = 150;
  const m = { i: 30, d: 8, s: 8, b: 22 };
  const w = ancho - m.i - m.d;
  const h = alto - m.s - m.b;
  const x = (ms) => m.i + ((ms - desde) / Math.max(1, hasta - desde)) * w;
  const y = (v) => m.s + (1 - Math.max(0, Math.min(100, v)) / 100) * h;

  let svg = `<svg viewBox="0 0 ${ancho} ${alto}" height="${alto}" role="img" aria-label="Historial de nivel">`;
  svg += '<g class="rejilla">';
  for (const v of [0, 50, 100]) svg += `<line x1="${m.i}" x2="${m.i + w}" y1="${y(v)}" y2="${y(v)}"/>`;
  svg += '</g><g class="eje">';
  for (const v of [0, 50, 100]) svg += `<text x="${m.i - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`;
  const marcas = 4;
  for (let k = 0; k <= marcas; k++) {
    const ms = desde + ((hasta - desde) * k) / marcas;
    const ancla = k === 0 ? 'start' : k === marcas ? 'end' : 'middle';
    svg += `<text x="${x(ms)}" y="${alto - 6}" text-anchor="${ancla}">${esc(formatoTiempo(ms))}</text>`;
  }
  svg += '</g>';
  svg += `<line class="linea-umbral" x1="${m.i}" x2="${m.i + w}" y1="${y(umbral)}" y2="${y(umbral)}"/>`;
  svg += `<text class="eje" x="${m.i + w}" y="${y(umbral) - 4}" text-anchor="end">30 %</text>`;
  for (const s of series) {
    const pts = s.puntos.filter((p) => p.ms >= desde - 1 && p.ms <= hasta);
    const previo = [...s.puntos].reverse().find((p) => p.ms < desde);
    if (previo && s.escalon) pts.unshift({ ms: desde, v: previo.v });
    if (!pts.length) continue;
    let d = '';
    pts.forEach((p, i) => {
      if (i === 0) d += `M${x(p.ms).toFixed(1)},${y(p.v).toFixed(1)}`;
      else if (s.escalon) d += `H${x(p.ms).toFixed(1)}V${y(p.v).toFixed(1)}`;
      else d += `L${x(p.ms).toFixed(1)},${y(p.v).toFixed(1)}`;
    });
    if (s.escalon) d += `H${x(Math.min(hasta, s.hastaMs ?? hasta)).toFixed(1)}`;
    svg += `<path class="serie ${s.clase}" d="${d}"/>`;
  }
  svg += `<g class="hover" visibility="hidden"><line class="cruz" y1="${m.s}" y2="${m.s + h}"/>`;
  for (const s of series) svg += `<circle class="marcador ${s.clase}" r="4"/>`;
  svg += `</g><rect class="captura" x="${m.i}" y="0" width="${w}" height="${alto}" fill="transparent"/></svg>`;

  const viejo = contenedor.querySelector('svg');
  if (viejo) viejo.remove();
  contenedor.insertAdjacentHTML('afterbegin', svg);
  const el = contenedor.querySelector('svg');
  const capa = el.querySelector('.hover');
  const cruz = capa.querySelector('.cruz');
  const marcadores = [...capa.querySelectorAll('.marcador')];
  const tip = tooltip(contenedor);

  const mover = (ev) => {
    contenedor._puntero = { clientX: ev.clientX, clientY: ev.clientY };
    const r = el.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * ancho;
    const ms = desde + ((px - m.i) / w) * (hasta - desde);
    if (ms < desde || ms > hasta) return salir();
    capa.setAttribute('visibility', 'visible');
    cruz.setAttribute('x1', px);
    cruz.setAttribute('x2', px);
    let filas = '';
    series.forEach((s, i) => {
      const v = valorEn(s.puntos, ms, s.escalon);
      const mk = marcadores[i];
      if (v === null) {
        mk.setAttribute('visibility', 'hidden');
        filas += `<div class="fila"><i class="${s.clase}"></i>${esc(s.nombre)}: <b>—</b></div>`;
        return;
      }
      mk.setAttribute('visibility', 'visible');
      mk.setAttribute('cx', px);
      mk.setAttribute('cy', y(v));
      filas += `<div class="fila"><i class="${s.clase}"></i>${esc(s.nombre)}: <b>${Math.round(v)} %</b></div>`;
    });
    tip.innerHTML = `<div>${esc(formatoTiempo(ms, true))}</div>${filas}`;
    tip.hidden = false;
    tip.style.left = `${(px / ancho) * r.width}px`;
    tip.style.top = `${m.s + 4}px`;
  };
  const salir = () => {
    contenedor._puntero = null;
    capa.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  const captura = el.querySelector('.captura');
  captura.addEventListener('pointermove', mover);
  captura.addEventListener('pointerdown', mover);
  captura.addEventListener('pointerleave', salir);
  // La gráfica se redibuja mientras corre la simulación: conserva el tooltip abierto.
  if (contenedor._puntero) mover(contenedor._puntero);
}

// Barras: [{ etiqueta, valor, detalle }]
export function graficaBarras(contenedor, { datos, maximo, etiquetaEje }) {
  const ancho = Math.max(240, contenedor.clientWidth || 340);
  const alto = 120;
  const m = { i: 28, d: 4, s: 8, b: 20 };
  const w = ancho - m.i - m.d;
  const h = alto - m.s - m.b;
  const top = maximo ?? Math.max(1, ...datos.map((d) => d.valor));
  const paso = w / datos.length;
  const anchoBarra = Math.max(2, paso - 2);
  const y = (v) => m.s + (1 - v / top) * h;

  let svg = `<svg viewBox="0 0 ${ancho} ${alto}" height="${alto}" role="img" aria-label="${esc(etiquetaEje)}">`;
  svg += '<g class="rejilla">';
  for (const v of [0, top / 2, top]) svg += `<line x1="${m.i}" x2="${m.i + w}" y1="${y(v)}" y2="${y(v)}"/>`;
  svg += '</g><g class="eje">';
  for (const v of [0, top / 2, top]) svg += `<text x="${m.i - 5}" y="${y(v) + 3.5}" text-anchor="end">${Math.round(v)}</text>`;
  datos.forEach((d, i) => {
    if (i % 3 === 0) svg += `<text x="${m.i + i * paso + paso / 2}" y="${alto - 5}" text-anchor="middle">${esc(d.etiqueta)}</text>`;
  });
  svg += '</g>';
  datos.forEach((d, i) => {
    if (d.valor <= 0) return;
    const x0 = m.i + i * paso + 1;
    const y0 = y(d.valor);
    const alturaBarra = m.s + h - y0;
    const r = Math.min(4, anchoBarra / 2, alturaBarra);
    // Extremo de datos redondeado (4 px), base recta sobre el eje.
    const dPath = `M${x0},${m.s + h}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + anchoBarra - r}Q${x0 + anchoBarra},${y0} ${x0 + anchoBarra},${y0 + r}V${m.s + h}Z`;
    svg += `<path class="barra" data-i="${i}" d="${dPath}"/>`;
  });
  datos.forEach((d, i) => {
    svg += `<rect class="zona" data-i="${i}" x="${m.i + i * paso}" y="0" width="${paso}" height="${alto}" fill="transparent"/>`;
  });
  svg += '</svg>';
  contenedor.innerHTML = svg;
  const tip = tooltip(contenedor);
  const el = contenedor.querySelector('svg');
  let activa = null;
  const mostrar = (ev) => {
    const i = Number(ev.target.dataset.i);
    if (Number.isNaN(i)) return;
    activa?.classList.remove('hover');
    activa = el.querySelector(`.barra[data-i="${i}"]`);
    activa?.classList.add('hover');
    const r = el.getBoundingClientRect();
    tip.innerHTML = datos[i].detalle;
    tip.hidden = false;
    tip.style.left = `${((m.i + i * paso + paso / 2) / ancho) * r.width}px`;
    tip.style.top = `${y(Math.max(datos[i].valor, 0))}px`;
  };
  el.querySelectorAll('.zona').forEach((z) => {
    z.addEventListener('pointerenter', mostrar);
    z.addEventListener('pointerdown', mostrar);
  });
  el.addEventListener('pointerleave', () => {
    activa?.classList.remove('hover');
    tip.hidden = true;
  });
}
