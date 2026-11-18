// Datos del panel de control: una "foto" del estado de los 12 nodos, sin DOM.
// El gemelo la publica por BroadcastChannel y la página panel.html la dibuja en otra pestaña.
import { FALLAS } from './dispositivo.js';
import { PISOS } from './edificio.js';

export const CANAL = 'gemelo-bloque-b';
export const CADA_MS = 500; // cada cuánto publica el gemelo
export const VENCE_MS = 2500; // sin fotos nuevas durante este tiempo, el panel da el gemelo por cerrado

// Las 4 comprobaciones de un nodo. resultado: 'ok' | 'aviso' | 'falla' | 'pendiente'.
export function verificar(n) {
  const c = [];
  if (n.estado === 'esperando') c.push({ clave: 'comunicacion', nombre: 'Comunicación', resultado: 'pendiente', detalle: 'todavía no llega el primer mensaje' });
  else if (!n.vivo) c.push({ clave: 'comunicacion', nombre: 'Comunicación', resultado: 'falla', detalle: 'dejó de enviar: sin dato' });
  else c.push({ clave: 'comunicacion', nombre: 'Comunicación', resultado: 'ok', detalle: 'envía dentro del tiempo esperado' });

  if (n.ultimoAutenticoMs === null) c.push({ clave: 'firma', nombre: 'Firma', resultado: 'pendiente', detalle: 'sin mensajes auténticos todavía' });
  else c.push({ clave: 'firma', nombre: 'Firma', resultado: 'ok', detalle: 'el último mensaje pasó R1–R3' });

  const r = n.ultimoResultado;
  if (!r) c.push({ clave: 'dato', nombre: 'Dato', resultado: 'pendiente', detalle: 'sin lecturas todavía' });
  else if (r.aceptado && !n.revisar) c.push({ clave: 'dato', nombre: 'Dato', resultado: 'ok', detalle: 'la última lectura pasó R4–R8' });
  else if (r.aceptado) c.push({ clave: 'dato', nombre: 'Dato', resultado: 'aviso', detalle: `pendiente de revisar: ${n.motivoRevisar}` });
  else c.push({ clave: 'dato', nombre: 'Dato', resultado: 'falla', detalle: r.detalle });

  if (n.valor === null) c.push({ clave: 'nivel', nombre: 'Nivel', resultado: 'pendiente', detalle: 'sin valor válido' });
  else if (n.valor >= n.umbralBajo) c.push({ clave: 'nivel', nombre: 'Nivel', resultado: 'ok', detalle: `${n.valor} %, normal` });
  else if (n.valor >= n.umbralVacio) c.push({ clave: 'nivel', nombre: 'Nivel', resultado: 'aviso', detalle: `${n.valor} %, bajo: recargar` });
  else c.push({ clave: 'nivel', nombre: 'Nivel', resultado: 'falla', detalle: `${n.valor} %, vacío: recargar ya` });
  return c;
}

// Veredicto de una línea para la columna "Funcionamiento".
export function funcionamiento(n) {
  if (n.estado === 'esperando') return { clave: 'esperando', texto: 'Esperando' };
  if (!n.vivo) return { clave: 'sin_dato', texto: 'Sin comunicación' };
  if (n.revisar) return { clave: 'revisar', texto: 'Revisar' };
  if (n.estado === 'vacio') return { clave: 'vacio', texto: 'Funciona · vacío' };
  if (n.estado === 'bajo') return { clave: 'bajo', texto: 'Funciona · bajo' };
  return { clave: 'normal', texto: 'Funciona' };
}

export function instantanea(sim, { envivo = null, velocidad = 0, eventos = 40 } = {}) {
  const r = sim.cfg.receptor;
  const nodos = sim.dispensadores.map((d) => {
    const s = sim.receptor.estadoDe(d.id, sim.ahora);
    const n = {
      id: d.id,
      corto: d.corto,
      nombre: d.nombre,
      piso: d.piso,
      genero: d.genero,
      origen: d.id === sim.idEnVivo ? 'envivo' : 'simulado',
      estado: s.estado,
      vivo: s.vivo,
      valor: s.valor,
      revisar: s.revisar,
      motivoRevisar: s.motivoRevisar,
      recargaConfirmada: s.recargaConfirmada,
      ultimoAutenticoMs: s.ultimoAutenticoMs,
      ultimoValidoMs: s.ultimoValidoMs,
      ultimaCarga: s.ultimaCarga,
      ultimoResultado: s.ultimoResultado,
      aceptados: s.aceptados,
      rechazados: s.rechazados,
      umbralBajo: r.umbralBajo,
      umbralVacio: r.umbralVacio,
      fallas: Object.keys(FALLAS).filter((f) => d.dispositivo.fallas[f]).map((f) => FALLAS[f].nombre),
    };
    n.comprobaciones = verificar(n);
    n.funcionamiento = funcionamiento(n);
    return n;
  });
  const cuenta = (f) => nodos.filter(f).length;
  return {
    ms: sim.ahora,
    envivo: envivo ? { estado: envivo.estado, recibidos: envivo.recibidos } : null,
    velocidad,
    estrategia: sim.estrategia,
    pisos: PISOS,
    nodos,
    resumen: {
      total: nodos.length,
      enLinea: cuenta((n) => n.vivo),
      normal: cuenta((n) => n.vivo && n.estado === 'normal'),
      bajo: cuenta((n) => n.vivo && n.estado === 'bajo'),
      vacio: cuenta((n) => n.vivo && n.estado === 'vacio'),
      sinDato: cuenta((n) => !n.vivo && n.estado !== 'esperando'),
      revisar: cuenta((n) => n.revisar),
      aceptados: nodos.reduce((a, n) => a + n.aceptados, 0),
      rechazados: nodos.reduce((a, n) => a + n.rechazados, 0) + sim.receptor.noAtribuidos,
    },
    aseo: sim.aseo.personal.map((p) => ({ nombre: p.nombre, texto: p.texto })),
    eventos: sim.receptor.eventos.slice(-eventos).reverse(),
  };
}
