// Receptor (equivalente a receptor.py): valida R1–R8, lleva el estado de cada
// dispensador, arma la lista para aseo y escribe el registro de eventos.
import { SUPUESTOS } from '../config/supuestos.js';
import { CAMPOS, UNIDAD, VARIABLE, VERSION, clavePrueba, firmar, formatearMomento, leerMomento, temaDe } from './contrato.js';
import { igualesSeguro } from './hmac.js';

// Todos los textos del registro en un solo lugar.
export const TEXTOS = {
  aceptado: (id, valor, estado) => `ACEPTADO ${id}: ${valor} % (${NOMBRE_ESTADO[estado]})`,
  rechazado: (quien, detalle) => `RECHAZADO ${quien}: ${detalle}`,
  sinDato: (id, s) => `SIN DATO ${id}: ${s} s sin mensajes auténticos (3 latidos)`,
  enLinea: (id) => `EN LÍNEA ${id}: vuelve a llegar un mensaje auténtico`,
  recarga: (id, s) => `RECARGA CONFIRMADA ${id}: se acepta la subida durante ${s} s`,
  finConfirmacion: (id, motivo) => `FIN CONFIRMACIÓN ${id}: ${motivo}`,
  revisado: (id) => `REVISADO ${id}`,
  r1: () => 'R1 no es JSON legible',
  r2Objeto: () => 'R2 no es un objeto con los 7 campos',
  r2Faltan: (lista) => `R2 faltan campos: ${lista.join(', ')}`,
  r2Valor: (v) => `R2 valor no es entero: ${JSON.stringify(v)}`,
  r2Version: (v) => `R2 version no es entero: ${JSON.stringify(v)}`,
  r3Id: (id) => `R3 id no registrado: ${JSON.stringify(id)}`,
  r3Tema: (tema) => `R3 tema no coincide con el id: ${tema}`,
  r3Firma: () => 'R3 firma no coincide',
  r4Variable: (v) => `R4 variable inesperada: ${JSON.stringify(v)}`,
  r4Unidad: (v) => `R4 unidad inesperada: ${JSON.stringify(v)}`,
  r4Version: (v) => `R4 version no soportada: ${v}`,
  r5Formato: (m) => `R5 momento sin formato ISO con zona horaria: ${JSON.stringify(m)}`,
  r5Futuro: (s) => `R5 momento en el futuro: +${s} s`,
  r5Viejo: (min) => `R5 momento viejo: ${min} min`,
  r5Orden: (m, ultimo) => `R5 momento no es posterior al último: ${m} <= ${ultimo}`,
  r6: (v) => `R6 valor imposible: ${v}`,
  r7: (antes, v, minimo) => `R7 sube solo: ${antes} -> ${v} sin recarga confirmada (mínimo desde la última recarga: ${minimo})`,
  r8: (antes) => `R8 cae a 0 de golpe: último válido ${antes}`,
};

export const NOMBRE_ESTADO = {
  normal: 'normal',
  bajo: 'bajo',
  vacio: 'vacío',
  sin_dato: 'sin dato',
  esperando: 'esperando',
};

export const GRUPOS = [
  { clave: 'recargar', nombre: 'Recargar' },
  { clave: 'revisar', nombre: 'Revisar' },
  { clave: 'sinDato', nombre: 'Sin dato' },
  { clave: 'sinNovedad', nombre: 'Sin novedad' },
];

// En JS 25.0 se lee como 25; en Python sería float. Se revisa el texto original.
function esEnteroJson(valor, carga, campo) {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) return false;
  const m = new RegExp(`"${campo}"\\s*:\\s*(-?[0-9.eE+-]+)`).exec(carga);
  return !m || /^-?\d+$/.test(m[1]);
}

function estadoNuevo(id, desdeMs) {
  return {
    id,
    desdeMs,
    ultimoAutenticoMs: null,
    ultimoValorAutentico: null,
    ultimoMomentoMs: null,
    ultimoValido: null,
    ultimoValidoMs: null,
    minimoDesdeRecarga: null,
    recarga: null,
    revisar: false,
    motivoRevisar: '',
    sinDatoAvisado: false,
    ultimaCarga: null,
    ultimoResultado: null,
    aceptados: 0,
    rechazados: 0,
    historial: [],
  };
}

export class Receptor {
  constructor({ ids, cfg = SUPUESTOS, ahoraMs = 0, registrar = true, maxEventos = 400, clave = clavePrueba } = {}) {
    this.cfg = cfg;
    this.r = cfg.receptor;
    this.registrar = registrar;
    this.maxEventos = maxEventos;
    this.clave = clave;
    this.estados = new Map(ids.map((id) => [id, estadoNuevo(id, ahoraMs)]));
    this.tiempos = new Map(); // tiempos especiales por id (modo en vivo)
    this.eventos = [];
    this.secuencia = 0;
    this.oyentes = new Set();
    this.noAtribuidos = 0;
  }

  alEvento(fn) {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  }

  registrarEvento(ms, tipo, texto, id = null) {
    if (!this.registrar) return;
    const ev = { n: ++this.secuencia, ms, tipo, texto, id };
    this.eventos.push(ev);
    if (this.eventos.length > this.maxEventos) this.eventos.splice(0, this.eventos.length - this.maxEventos);
    for (const fn of this.oyentes) fn(ev);
  }

  setTiempos(id, tiempos) {
    if (tiempos) this.tiempos.set(id, tiempos);
    else this.tiempos.delete(id);
  }

  reiniciarDispensador(id, ahoraMs) {
    this.estados.set(id, estadoNuevo(id, ahoraMs));
  }

  sinDatoMs(e) {
    const t = this.tiempos.get(e.id);
    if (t?.sinDatoS) return t.sinDatoS * 1000;
    const d = this.cfg.dispositivo;
    const v = e.ultimoValorAutentico;
    const latido = typeof v === 'number' && v < d.umbralLatidoBajo ? d.latidoBajoS : d.latidoS;
    return this.r.latidosSinDato * latido * 1000;
  }

  confirmacionMs(id) {
    return (this.tiempos.get(id)?.confirmacionRecargaS ?? this.r.confirmacionRecargaS) * 1000;
  }

  clasificar(v) {
    if (v >= this.r.umbralBajo) return 'normal';
    if (v >= this.r.umbralVacio) return 'bajo';
    return 'vacio';
  }

  // --- Recepción de un mensaje -------------------------------------------------

  procesar(tema, carga, ahoraMs) {
    const texto = typeof carga === 'string' ? carga : String(carga);

    // R1: JSON legible
    let datos;
    try {
      datos = JSON.parse(texto);
    } catch {
      return this.sinAtribuir(tema, 'R1', TEXTOS.r1(), ahoraMs);
    }

    // R2: 7 campos, valor y version enteros
    if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
      return this.sinAtribuir(tema, 'R2', TEXTOS.r2Objeto(), ahoraMs);
    }
    const faltan = CAMPOS.filter((c) => !Object.hasOwn(datos, c));
    if (faltan.length) return this.sinAtribuir(tema, 'R2', TEXTOS.r2Faltan(faltan), ahoraMs);
    if (!esEnteroJson(datos.valor, texto, 'valor')) return this.sinAtribuir(tema, 'R2', TEXTOS.r2Valor(datos.valor), ahoraMs);
    if (!esEnteroJson(datos.version, texto, 'version')) return this.sinAtribuir(tema, 'R2', TEXTOS.r2Version(datos.version), ahoraMs);

    // R3: id registrado, tema correcto, firma correcta
    const id = datos.id;
    const e = typeof id === 'string' ? this.estados.get(id) : undefined;
    if (!e) return this.sinAtribuir(tema, 'R3', TEXTOS.r3Id(id), ahoraMs);
    if (tema !== temaDe(id, this.r.temaBase)) return this.sinAtribuir(tema, 'R3', TEXTOS.r3Tema(tema), ahoraMs);
    const esperada = firmar(datos, this.clave(id));
    if (!igualesSeguro(datos.firma, esperada)) return this.sinAtribuir(tema, 'R3', TEXTOS.r3Firma(), ahoraMs);

    // Mensaje auténtico: cuenta como señal de vida.
    e.ultimoAutenticoMs = ahoraMs;
    e.ultimoValorAutentico = datos.valor;
    e.ultimaCarga = texto;
    if (e.sinDatoAvisado) {
      e.sinDatoAvisado = false;
      this.registrarEvento(ahoraMs, 'aviso', TEXTOS.enLinea(id), id);
    }

    // R4: variable, unidad y versión esperadas
    if (datos.variable !== VARIABLE) return this.fallar(e, 'R4', TEXTOS.r4Variable(datos.variable), ahoraMs);
    if (datos.unidad !== UNIDAD) return this.fallar(e, 'R4', TEXTOS.r4Unidad(datos.unidad), ahoraMs);
    if (datos.version !== VERSION) return this.fallar(e, 'R4', TEXTOS.r4Version(datos.version), ahoraMs);

    // R5: momento ISO con zona, ni futuro ni viejo, y posterior al último auténtico
    const m = leerMomento(datos.momento);
    if (Number.isNaN(m)) return this.fallar(e, 'R5', TEXTOS.r5Formato(datos.momento), ahoraMs);
    if (m - ahoraMs > this.r.futuroMaxS * 1000) return this.fallar(e, 'R5', TEXTOS.r5Futuro(Math.round((m - ahoraMs) / 1000)), ahoraMs);
    if (ahoraMs - m > this.r.edadMaxS * 1000) return this.fallar(e, 'R5', TEXTOS.r5Viejo(Math.round((ahoraMs - m) / 60000)), ahoraMs);
    if (e.ultimoMomentoMs !== null && m <= e.ultimoMomentoMs) {
      return this.fallar(e, 'R5', TEXTOS.r5Orden(datos.momento, formatearMomento(e.ultimoMomentoMs, this.cfg.zonaHorariaMin)), ahoraMs);
    }
    e.ultimoMomentoMs = m;

    // R6: rango posible
    const v = datos.valor;
    if (v < 0 || v > 100) return this.fallar(e, 'R6', TEXTOS.r6(v), ahoraMs);

    // R7: no sube solo
    this.vencerConfirmacion(e, ahoraMs);
    const conf = e.recarga;
    if (!conf && e.minimoDesdeRecarga !== null && v > e.minimoDesdeRecarga + this.r.subidaMaxPuntos) {
      return this.fallar(e, 'R7', TEXTOS.r7(e.ultimoValido, v, e.minimoDesdeRecarga), ahoraMs);
    }

    // R8: no cae a 0 de golpe
    if (v === 0 && e.ultimoValido !== null && e.ultimoValido >= this.r.umbralCaidaR8) {
      return this.fallar(e, 'R8', TEXTOS.r8(e.ultimoValido), ahoraMs);
    }

    // Aceptado
    if (conf) {
      if (e.ultimoValido === null || v > e.ultimoValido) conf.subio = true;
      if (conf.subio && e.ultimoValido !== null && v < e.ultimoValido) {
        e.recarga = null;
        e.minimoDesdeRecarga = Math.min(e.minimoDesdeRecarga ?? v, v);
        this.registrarEvento(ahoraMs, 'aseo', TEXTOS.finConfirmacion(e.id, 'el nivel vuelve a bajar'), e.id);
      } else {
        e.minimoDesdeRecarga = v; // nuevo punto de partida desde la recarga
      }
    } else {
      e.minimoDesdeRecarga = e.minimoDesdeRecarga === null ? v : Math.min(e.minimoDesdeRecarga, v);
    }
    e.ultimoValido = v;
    e.ultimoValidoMs = ahoraMs;
    e.aceptados++;
    e.ultimoResultado = { aceptado: true, ms: ahoraMs, valor: v };
    e.historial.push({ ms: ahoraMs, v });
    if (e.historial.length > 600) e.historial.splice(0, e.historial.length - 600);
    this.registrarEvento(ahoraMs, 'ok', TEXTOS.aceptado(id, v, this.clasificar(v)), id);
    return { aceptado: true, id, valor: v };
  }

  sinAtribuir(tema, regla, detalle, ahoraMs) {
    this.noAtribuidos++;
    this.registrarEvento(ahoraMs, 'rechazo', TEXTOS.rechazado(tema, detalle), null);
    return { aceptado: false, regla, detalle, id: null };
  }

  fallar(e, regla, detalle, ahoraMs) {
    e.revisar = true;
    e.motivoRevisar = detalle;
    e.rechazados++;
    e.ultimoResultado = { aceptado: false, ms: ahoraMs, regla, detalle };
    this.registrarEvento(ahoraMs, 'rechazo', TEXTOS.rechazado(e.id, detalle), e.id);
    return { aceptado: false, regla, detalle, id: e.id };
  }

  // --- Acciones de aseo ---------------------------------------------------------

  confirmarRecarga(id, ahoraMs) {
    const e = this.estados.get(id);
    if (!e) return false;
    const ms = this.confirmacionMs(id);
    e.recarga = { desdeMs: ahoraMs, hastaMs: ahoraMs + ms, subio: false };
    this.registrarEvento(ahoraMs, 'aseo', TEXTOS.recarga(id, Math.round(ms / 1000)), id);
    return true;
  }

  marcarRevisado(id, ahoraMs, siempre = false) {
    const e = this.estados.get(id);
    if (!e) return false;
    const estaba = e.revisar;
    e.revisar = false;
    e.motivoRevisar = '';
    if (estaba || siempre) this.registrarEvento(ahoraMs, 'aseo', TEXTOS.revisado(id), id);
    return estaba;
  }

  vencerConfirmacion(e, ahoraMs) {
    if (e.recarga && ahoraMs > e.recarga.hastaMs) {
      e.recarga = null;
      this.registrarEvento(ahoraMs, 'aseo', TEXTOS.finConfirmacion(e.id, 'se venció'), e.id);
    }
  }

  // Se llama periódicamente: vence confirmaciones y detecta "sin dato".
  revisarTiempos(ahoraMs) {
    for (const e of this.estados.values()) {
      this.vencerConfirmacion(e, ahoraMs);
      const ref = e.ultimoAutenticoMs ?? e.desdeMs;
      const limite = this.sinDatoMs(e);
      if (!e.sinDatoAvisado && ahoraMs - ref > limite) {
        e.sinDatoAvisado = true;
        this.registrarEvento(ahoraMs, 'aviso', TEXTOS.sinDato(e.id, Math.round(limite / 1000)), e.id);
      }
    }
  }

  // --- Consultas ----------------------------------------------------------------

  estadoDe(id, ahoraMs) {
    const e = this.estados.get(id);
    const limite = this.sinDatoMs(e);
    let estado;
    let vivo = false;
    if (e.ultimoAutenticoMs === null) {
      estado = ahoraMs - e.desdeMs > limite ? 'sin_dato' : 'esperando';
    } else {
      vivo = ahoraMs - e.ultimoAutenticoMs <= limite;
      if (!vivo || e.ultimoValido === null) estado = 'sin_dato';
      else estado = this.clasificar(e.ultimoValido);
    }
    return {
      id,
      estado,
      vivo,
      valor: e.ultimoValido, // para aseo vale el último valor válido (nunca 0 por falta de datos)
      revisar: e.revisar,
      motivoRevisar: e.motivoRevisar,
      recargaConfirmada: e.recarga !== null,
      recargaHastaMs: e.recarga?.hastaMs ?? null,
      ultimoAutenticoMs: e.ultimoAutenticoMs,
      ultimoValidoMs: e.ultimoValidoMs,
      ultimaCarga: e.ultimaCarga,
      ultimoResultado: e.ultimoResultado,
      aceptados: e.aceptados,
      rechazados: e.rechazados,
      sinDatoMs: limite,
    };
  }

  listaAseo(ahoraMs) {
    const grupos = { recargar: [], revisar: [], sinDato: [], sinNovedad: [] };
    for (const id of this.estados.keys()) {
      const s = this.estadoDe(id, ahoraMs);
      if (!s.vivo) grupos.sinDato.push(s);
      else if (s.estado === 'vacio' || s.estado === 'bajo') grupos.recargar.push(s);
      else if (s.revisar) grupos.revisar.push(s);
      else if (s.valor === null) grupos.sinDato.push(s);
      else grupos.sinNovedad.push(s);
    }
    // Primero los vacíos: de menor a mayor nivel.
    grupos.recargar.sort((a, b) => a.valor - b.valor);
    return grupos;
  }
}
