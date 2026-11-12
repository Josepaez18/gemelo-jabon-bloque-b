// Paneles laterales: resumen, lista para aseo, registro y supuestos.
import { ESTRATEGIAS, SUPUESTOS } from '../config/supuestos.js';
import { infoDispensador } from '../modelo/edificio.js';
import { GRUPOS, NOMBRE_ESTADO } from '../modelo/receptor.js';
import { INDICADORES } from '../modelo/simulacion.js';
import { diaHora, duracion, esc, hace, numero } from './formato.js';
import { graficaBarras } from './graficas.js';

const $ = (s) => document.querySelector(s);

export function pintarIndicadores(sim) {
  const t = sim.totales();
  const html = INDICADORES.map(({ clave, nombre }) => {
    const v = t[clave];
    const texto = clave === 'horasSinJabon' ? numero(v, 1) : numero(v);
    const alerta = (clave === 'usosSinJabon' || clave === 'horasSinJabon') && v > 0;
    return `<div class="indicador${alerta ? ' alerta' : ''}"><span class="valor">${texto}</span><span class="nombre">${nombre}</span></div>`;
  }).join('');
  const el = $('#indicadores');
  if (el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
  const desde = sim.idEnVivo ? 'desde que empezó el modo en vivo (sin contar d2)' : `desde ${diaHora(sim.inicioMs)}`;
  $('#nota-indicadores').textContent = `Acumulados ${desde}. Innecesaria: aseo llega y el nivel real está en 30 % o más.`;
}

export function pintarPersonal(sim) {
  const html = sim.aseo.personal.map((p) => `<li>${esc(p.nombre)}: ${esc(p.texto)}</li>`).join('');
  const el = $('#estado-personal');
  if (el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
  $('#desc-estrategia').textContent = ESTRATEGIAS[sim.estrategia].descripcion;
}

function itemAseo(s, sim) {
  const info = infoDispensador(s.id);
  const estado = s.estado;
  const valor = s.valor === null ? '—' : `${s.valor} %`;
  let sub = '';
  if (!s.vivo) sub = s.ultimoAutenticoMs === null ? 'nunca ha enviado un mensaje auténtico' : `último mensaje auténtico ${hace(s.ultimoAutenticoMs, sim.ahora)}`;
  else if (s.revisar) sub = s.motivoRevisar;
  else if (estado === 'vacio' || estado === 'bajo') sub = `${NOMBRE_ESTADO[estado]} · ${hace(s.ultimoValidoMs, sim.ahora)}`;
  const vivo = s.id === sim.idEnVivo ? ' <span class="chip-estado" data-estado="envivo">en vivo</span>' : '';
  return `<button type="button" class="item-aseo" data-id="${s.id}">
    <span class="punto-estado" data-estado="${estado}"></span>
    <span class="titulo">${info.corto} · ${info.nombre}${vivo}</span>
    <span class="val">${valor}${s.revisar ? ' <span title="revisar">⚠</span>' : ''}</span>
    ${sub ? `<span class="sub">${esc(sub)}</span>` : ''}
  </button>`;
}

export function pintarListaAseo(sim) {
  const lista = sim.receptor.listaAseo(sim.ahora);
  const html = GRUPOS.map(({ clave, nombre }) => {
    const items = lista[clave];
    const cuerpo = items.length ? items.map((s) => itemAseo(s, sim)).join('') : '<p class="vacio-grupo">Ninguno.</p>';
    return `<div class="grupo-lista"><h3>${nombre} <span class="n">${items.length}</span></h3>${cuerpo}</div>`;
  }).join('');
  const el = $('#lista-aseo');
  if (el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
  const pendientes = lista.recargar.length + lista.revisar.length + lista.sinDato.length;
  $('#contador-aseo').textContent = pendientes ? String(pendientes) : '';
}

export function pintarRegistro(sim, filtro) {
  const eventos = sim.receptor.eventos;
  const ultimo = eventos.at(-1)?.n ?? 0;
  const el = $('#registro');
  const clave = `${ultimo}|${filtro}|${eventos.length}|${sim.receptor === el._receptor}`;
  if (el.dataset.clave === clave) return;
  el.dataset.clave = clave;
  el._receptor = sim.receptor;
  const pasa = (e) => filtro === 'todo' || (filtro === 'aseo' ? e.tipo === 'aseo' || e.tipo === 'aviso' : e.tipo === filtro);
  const filas = [];
  for (let i = eventos.length - 1; i >= 0 && filas.length < 200; i--) {
    const e = eventos[i];
    if (!pasa(e)) continue;
    filas.push(`<li class="${e.tipo}"><span class="t">${diaHora(e.ms)}</span><span class="m">${esc(e.texto)}</span></li>`);
  }
  el.innerHTML = filas.length ? filas.join('') : '<li class="vacio-registro">Todavía no hay eventos con este filtro.</li>';
}

function fila(nombre, valor) {
  return `<tr><th scope="row">${nombre}</th><td class="num">${valor}</td></tr>`;
}

export function pintarSupuestos() {
  const s = SUPUESTOS;
  const dias = Object.values(s.horario.dias);
  const html = `
  <section class="seccion-supuestos">
    <h3>Jabón</h3>
    <table class="tabla">${fila('Por uso', `${numero(s.jabon.mlPorUso, 1)} ml`)}${fila('Recipiente', `${numero(s.jabon.capacidadMl)} ml`)}${fila('Usos con un recipiente lleno', numero(Math.floor(s.jabon.capacidadMl / s.jabon.mlPorUso)))}${fila('Nivel al empezar', `${s.jabon.nivelInicialMin}–${s.jabon.nivelInicialMax} % (al azar)`)}</table>
  </section>
  <section class="seccion-supuestos">
    <h3>Afluencia por hora · un baño del piso 1, día entre semana</h3>
    <div class="grafica" id="grafica-afluencia"></div>
    <p class="nota">Pico: ${s.afluencia.usosHoraPico} usos por hora. Abre de ${s.horario.abre}:00 a ${s.horario.cierra}:00, con picos a media mañana y al mediodía.</p>
  </section>
  <section class="seccion-supuestos">
    <h3>Afluencia por piso</h3>
    <table class="tabla"><thead><tr><th>Piso</th>${s.afluencia.factorPiso.map((_, i) => `<th class="num">${i + 1}</th>`).join('')}</tr></thead>
    <tbody><tr><th scope="row">Factor</th>${s.afluencia.factorPiso.map((f) => `<td class="num">${numero(f, 2)}</td>`).join('')}</tr></tbody></table>
  </section>
  <section class="seccion-supuestos">
    <h3>Días</h3>
    <table class="tabla"><thead><tr><th>Día</th><th>Abierto</th><th class="num">Factor de gente</th></tr></thead><tbody>
    ${dias.map((d) => `<tr><td>${d.nombre}</td><td>${d.abierto ? 'sí' : 'cerrado'}</td><td class="num">${numero(d.factor, 2)}</td></tr>`).join('')}
    </tbody></table>
  </section>
  <section class="seccion-supuestos">
    <h3>Dispositivo (ESP32 + HC-SR04)</h3>
    <table class="tabla">${fila('Lleno / vacío', `${s.dispositivo.dLlenoCm} cm / ${s.dispositivo.dVacioCm} cm`)}${fila('Error que se absorbe', `±${s.dispositivo.toleranciaPuntos} puntos`)}${fila('Envía de inmediato si cambia', `${s.dispositivo.cambioMinimo} puntos o más`)}${fila('Latido', `${duracion(s.dispositivo.latidoS * 1000)} (${duracion(s.dispositivo.latidoBajoS * 1000)} si está por debajo de ${s.dispositivo.umbralLatidoBajo} %)`)}${fila('Lectura (paso de simulación)', `cada ${s.dispositivo.lecturaCadaS} s`)}${fila('Ruido del sensor', `${s.dispositivo.ruidoCm} cm`)}</table>
  </section>
  <section class="seccion-supuestos">
    <h3>Receptor</h3>
    <table class="tabla">${fila('Normal / bajo / vacío', `≥ ${s.receptor.umbralBajo} % / ${s.receptor.umbralVacio}–${s.receptor.umbralBajo - 1} % / &lt; ${s.receptor.umbralVacio} %`)}${fila('R5 futuro máximo / edad máxima', `${s.receptor.futuroMaxS} s / ${duracion(s.receptor.edadMaxS * 1000)}`)}${fila('R7 subida tolerada', `${s.receptor.subidaMaxPuntos} puntos`)}${fila('R8 caída a 0 bloqueada desde', `${s.receptor.umbralCaidaR8} %`)}${fila('Sin dato', `${s.receptor.latidosSinDato} latidos sin mensaje auténtico`)}${fila('Confirmación de recarga', duracion(s.receptor.confirmacionRecargaS * 1000))}${fila('En vivo: sin dato / confirmación', `${s.receptor.envivo.sinDatoS} s / ${duracion(s.receptor.envivo.confirmacionRecargaS * 1000)}`)}</table>
  </section>
  <section class="seccion-supuestos">
    <h3>Aseo</h3>
    <table class="tabla">${fila('Personas', s.aseo.personas)}${fila('Velocidad caminando', `${numero(s.aseo.velocidadMS, 1)} m/s`)}${fila('Espera del ascensor', `${s.aseo.esperaAscensorS} s + ${s.aseo.ascensorSPorPiso} s por piso`)}${fila('Recargar / revisar', `${duracion(s.aseo.recargaS * 1000)} / ${duracion(s.aseo.revisionS * 1000)}`)}${fila('En rondas recarga si', `nivel real &lt; ${s.aseo.umbralRecarga} %`)}${fila('Con sensores, no vuelve antes de', `${s.aseo.reVisitaMin} min`)}${fila('Rondas cada 4 h', s.aseo.rondasCada4h.map((h) => `${h}:00`).join(', '))}${fila('Rondas 2 veces al día', s.aseo.rondas2AlDia.map((h) => `${h}:00`).join(', '))}</table>
  </section>`;
  $('#supuestos').innerHTML = html;
  pintarAfluencia();
}

export function pintarAfluencia() {
  const a = SUPUESTOS.afluencia;
  const datos = Array.from({ length: 24 }, (_, h) => {
    const v = a.usosHoraPico * (a.perfilHora[h] ?? 0);
    return {
      etiqueta: `${h}h`,
      valor: v,
      detalle: `<b>${h}:00–${h + 1}:00</b><br>${numero(v)} usos por hora`,
    };
  });
  const el = document.querySelector('#grafica-afluencia');
  if (el) graficaBarras(el, { datos, etiquetaEje: 'Usos por hora en un baño del piso 1' });
}
