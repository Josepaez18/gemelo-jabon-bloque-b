// Datos del panel de control: una "foto" del estado de los 12 nodos, sin DOM.
// El gemelo la publica por BroadcastChannel y la página panel.html la dibuja en otra pestaña.
//
// Contrato gemelo ↔ panel (todo viaja como objetos JSON; se copia con structured clone):
//   panel  → gemelo  { tipo: 'hola',  v }                  al abrir el panel: pide una foto ya
//   gemelo → panel   { tipo: 'foto',  v, origen, foto }    cada CADA_MS, y en respuesta a 'hola'
//   gemelo → panel   { tipo: 'adios', v, origen }          al cerrar o recargar la pestaña del gemelo
// `origen` identifica a cada gemelo abierto (puede haber varios); `v` es VERSION_CANAL.
import { SUPUESTOS } from '../config/supuestos.js';
import { temaDe } from './contrato.js';
import { FALLAS } from './dispositivo.js';
import { PISOS } from './edificio.js';
import { REGLAS } from './receptor.js';

export const CANAL = 'gemelo-bloque-b';
export const VERSION_CANAL = 1; // súbela si cambia la forma de la foto: el panel avisa si no coincide
export const CADA_MS = 500; // cada cuánto publica el gemelo
export const VENCE_MS = 2500; // sin fotos nuevas durante este tiempo, el panel da el gemelo por cerrado
export const TRAFICO_POR_FOTO = 60; // últimos mensajes que viajan en cada foto

// Descripción del canal para la pestaña "Contrato del dato" del panel.
export const MENSAJES_CANAL = [
  { tipo: 'hola', sentido: 'panel → gemelo', cuando: 'al abrir el panel', campos: 'tipo, v' },
  { tipo: 'foto', sentido: 'gemelo → panel', cuando: `cada ${CADA_MS} ms y en respuesta a «hola»`, campos: 'tipo, v, origen, foto' },
  { tipo: 'adios', sentido: 'gemelo → panel', cuando: 'al cerrar o recargar el gemelo', campos: 'tipo, v, origen' },
];

function duracion(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 120) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 120) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const comprobacion = (clave, nombre) => (resultado, detalle) => ({ clave, nombre, resultado, detalle });

// Las 4 comprobaciones de un nodo, con lo que sabe el receptor en el instante `ahora`.
// resultado: 'ok' | 'aviso' | 'falla' | 'pendiente'.
export function verificar(n, ahora) {
  const C = comprobacion('comunicacion', 'Comunicación');
  const F = comprobacion('firma', 'Firma');
  const D = comprobacion('dato', 'Dato');
  const N = comprobacion('nivel', 'Nivel');
  const c = [];

  // C · ¿envía a tiempo? Solo cuentan los mensajes auténticos (los que pasan R1–R3).
  const limite = duracion(n.sinDatoMs);
  if (n.estado === 'esperando') c.push(C('pendiente', `todavía no llega el primer mensaje auténtico (sin dato a los ${limite})`));
  else if (!n.vivo) {
    const desde = n.ultimoAutenticoMs === null ? 'nunca llegó un mensaje auténtico' : `último mensaje auténtico hace ${duracion(ahora - n.ultimoAutenticoMs)}`;
    c.push(C('falla', `sin dato: ${desde} (límite: ${limite}, 3 latidos)`));
  } else c.push(C('ok', `último mensaje auténtico hace ${duracion(ahora - n.ultimoAutenticoMs)} (límite: ${limite})`));

  // F · ¿lo que llega a su tema es auténtico? Los rechazos de R1–R3 no se le atribuyen al nodo,
  // pero si llegan a su tema alguien publica en su nombre (o el nodo tiene mal la clave).
  const red = n.red;
  const recienteRed = red && ahora - red.ultimoMs <= n.sinDatoMs;
  if (red && (n.ultimoAutenticoMs === null || red.ultimoMs > n.ultimoAutenticoMs)) {
    c.push(F('falla', `el último mensaje en su tema no pasó ${red.regla}: ${red.detalle} (no se le atribuye al nodo)`));
  } else if (recienteRed) {
    c.push(F('aviso', `llegan mensajes a su tema que no pasan ${red.regla} (${red.rechazos} en total, el último hace ${duracion(ahora - red.ultimoMs)}); los auténticos siguen llegando`));
  } else if (n.ultimoAutenticoMs === null) c.push(F('pendiente', 'sin mensajes auténticos todavía'));
  else c.push(F('ok', 'los mensajes de su tema pasan R1–R3 (JSON, campos y firma)'));

  // D · ¿el último dato tiene sentido? (R4–R8)
  const r = n.ultimoResultado;
  if (!r) c.push(D('pendiente', 'sin lecturas todavía'));
  else if (r.aceptado && !n.revisar) c.push(D('ok', 'la última lectura pasó R4–R8'));
  else if (r.aceptado) c.push(D('aviso', `la última lectura pasó, pero quedó pendiente de revisar: ${n.motivoRevisar}`));
  else c.push(D('falla', r.detalle));

  // N · ¿hay jabón? Sin comunicación, el último valor no es información actual: nunca se toma como 0 %.
  if (n.valor === null) c.push(N('pendiente', 'sin valor válido todavía'));
  else if (!n.vivo) c.push(N('pendiente', `último válido ${n.valor} %, pero sin comunicación: no se usa como 0 % ni como dato actual`));
  else if (n.valor >= n.umbralBajo) c.push(N('ok', `${n.valor} %, normal`));
  else if (n.valor >= n.umbralVacio) c.push(N('aviso', `${n.valor} %, bajo: recargar`));
  else c.push(N('falla', `${n.valor} %, vacío: recargar ya`));
  return c;
}

// Veredicto de una línea para la columna "Funcionamiento". Sigue el mismo orden que la lista de aseo.
export function funcionamiento(n) {
  if (n.estado === 'esperando') return { clave: 'esperando', texto: 'Esperando' };
  if (!n.vivo) return { clave: 'sin_dato', texto: 'Sin comunicación' };
  if (n.revisar) return { clave: 'revisar', texto: 'Revisar' };
  // Aseo ya lo marcó revisado, pero la última lectura tampoco pasó: el sensor sigue mal.
  if (n.ultimoResultado && !n.ultimoResultado.aceptado) return { clave: 'revisar', texto: 'Dato rechazado' };
  // Envía mensajes auténticos, pero ninguno pasó R4–R8: para aseo es «sin dato».
  if (n.valor === null) return { clave: 'sin_dato', texto: 'Sin valor válido' };
  if (n.estado === 'vacio') return { clave: 'vacio', texto: 'Funciona · vacío' };
  if (n.estado === 'bajo') return { clave: 'bajo', texto: 'Funciona · bajo' };
  return { clave: 'normal', texto: 'Funciona' };
}

// La foto completa. Todo es JSON puro (sin funciones ni Map), para que viaje por BroadcastChannel.
export function instantanea(sim, { envivo = null, velocidad = 0, eventos = 40, trafico = TRAFICO_POR_FOTO } = {}) {
  const r = sim.cfg.receptor;
  const nodos = sim.dispensadores.map((d) => {
    const s = sim.receptor.estadoDe(d.id, sim.ahora);
    const tema = temaDe(d.id, r.temaBase);
    const red = sim.trafico.rechazosDeTema(tema);
    const n = {
      id: d.id,
      corto: d.corto,
      nombre: d.nombre,
      piso: d.piso,
      genero: d.genero,
      tema,
      origen: d.id === sim.idEnVivo ? 'envivo' : 'simulado',
      estado: s.estado,
      vivo: s.vivo,
      valor: s.valor,
      revisar: s.revisar,
      motivoRevisar: s.motivoRevisar,
      recargaConfirmada: s.recargaConfirmada,
      recargaHastaMs: s.recargaHastaMs,
      ultimoAutenticoMs: s.ultimoAutenticoMs,
      ultimoValidoMs: s.ultimoValidoMs,
      ultimaCarga: s.ultimaCarga,
      ultimoResultado: s.ultimoResultado,
      aceptados: s.aceptados,
      rechazados: s.rechazados,
      sinDatoMs: s.sinDatoMs,
      red: red ? { ...red } : null,
      umbralBajo: r.umbralBajo,
      umbralVacio: r.umbralVacio,
      fallas: Object.keys(FALLAS).filter((f) => d.dispositivo.fallas[f]).map((f) => FALLAS[f].nombre),
    };
    n.comprobaciones = verificar(n, sim.ahora);
    n.funcionamiento = funcionamiento(n);
    return n;
  });

  const cuenta = (f) => nodos.filter(f).length;
  const t = sim.trafico;
  const rechazosRed = REGLAS.filter((x) => x.capa === 'red').reduce((a, x) => a + t.porRegla[x.regla], 0);
  const lista = sim.receptor.listaAseo(sim.ahora);
  const ids = (g) => lista[g].map((s) => s.id);
  const c = SUPUESTOS.envivo;

  return {
    ms: sim.ahora,
    velocidad,
    estrategia: sim.estrategia,
    pisos: PISOS,
    envivo: envivo
      ? {
          id: sim.idEnVivo,
          url: c.url,
          suscripcion: c.suscripcion,
          estado: envivo.estado,
          detalle: envivo.detalle ?? '',
          recibidos: envivo.recibidos ?? 0,
          ignorados: envivo.ignorados ?? 0,
        }
      : null,
    nodos,
    resumen: {
      total: nodos.length,
      enLinea: cuenta((n) => n.vivo),
      normal: cuenta((n) => n.vivo && n.estado === 'normal'),
      bajo: cuenta((n) => n.vivo && n.estado === 'bajo'),
      vacio: cuenta((n) => n.vivo && n.estado === 'vacio'),
      sinDato: cuenta((n) => n.estado === 'sin_dato'), // sin comunicación, o en línea sin ningún valor válido
      esperando: cuenta((n) => n.estado === 'esperando'),
      revisar: cuenta((n) => n.revisar),
      aceptados: nodos.reduce((a, n) => a + n.aceptados, 0),
      rechazados: nodos.reduce((a, n) => a + n.rechazados, 0) + sim.receptor.noAtribuidos,
    },
    // Lo que pasó por el receptor, separado por capa.
    red: {
      recibidos: t.recibidos,
      aceptados: t.aceptados,
      rechazosRed, // R1–R3: no se atribuyen a ningún dispensador
      rechazosNegocio: t.recibidos - t.aceptados - rechazosRed, // R4–R8: el nodo pasa a revisar
      porRegla: { ...t.porRegla },
      temasConRechazo: t.porTema.size,
    },
    aseo: {
      personal: sim.aseo.personal.map((p) => ({ nombre: p.nombre, texto: p.texto })),
      recargar: ids('recargar'),
      revisar: ids('revisar'),
      sinDato: ids('sinDato'),
      sinNovedad: ids('sinNovedad').length,
    },
    eventos: sim.receptor.eventos.slice(-eventos).reverse(),
    trafico: t.lista.slice(-trafico),
  };
}
