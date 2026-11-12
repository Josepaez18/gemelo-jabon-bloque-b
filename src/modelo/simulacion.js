// Simulación del Bloque B: consumo de jabón, dispositivos, receptor y aseo.
// No toca el DOM: la escena y la interfaz solo leen su estado.
import { SUPUESTOS } from '../config/supuestos.js';
import { estaAbierto, factorPiso, tasaBase } from './afluencia.js';
import { Aseo } from './aseo.js';
import { crearAzar, derivarSemilla } from './azar.js';
import { leerMomento } from './contrato.js';
import { Dispositivo } from './dispositivo.js';
import { DISPENSADORES, IDS, punto } from './edificio.js';
import { Receptor } from './receptor.js';

export const INDICADORES = [
  { clave: 'usos', nombre: 'Usos', unidad: '' },
  { clave: 'usosSinJabon', nombre: 'Usos sin jabón', unidad: '' },
  { clave: 'horasSinJabon', nombre: 'Horas sin jabón', unidad: 'h' },
  { clave: 'visitas', nombre: 'Visitas de aseo', unidad: '' },
  { clave: 'visitasInnecesarias', nombre: 'Visitas innecesarias', unidad: '' },
  { clave: 'recargas', nombre: 'Recargas', unidad: '' },
];

function indicadoresEnCero() {
  return { usos: 0, usosSinJabon: 0, segundosSinJabon: 0, visitas: 0, visitasInnecesarias: 0, recargas: 0 };
}

export class Simulacion {
  constructor({ cfg = SUPUESTOS, semilla = cfg.semilla, estrategia = 'sensores', inicioMs, registrar = true } = {}) {
    this.cfg = cfg;
    this.semilla = semilla;
    this.estrategia = estrategia;
    this.registrar = registrar;
    this.dtMs = cfg.dispositivo.lecturaCadaS * 1000;
    this.inicioMs = inicioMs ?? leerMomento(cfg.inicio);
    this.ahora = this.inicioMs;
    this.tVisual = this.inicioMs;
    this.idEnVivo = null;
    this.eventosUso = [];
    this.eventosMensaje = [];

    const cap = cfg.jabon.capacidadMl;
    const azarInicial = crearAzar(derivarSemilla(semilla, 'inicial'));
    this.dispensadores = DISPENSADORES.map((info) => ({
      ...info,
      ml: (cap * azarInicial.entre(cfg.jabon.nivelInicialMin, cfg.jabon.nivelInicialMax)) / 100,
      azarUsos: crearAzar(derivarSemilla(semilla, `usos:${info.id}`)),
      dispositivo: new Dispositivo({ id: info.id, cfg, azar: crearAzar(derivarSemilla(semilla, `sensor:${info.id}`)) }),
      ind: indicadoresEnCero(),
      historialReal: [],
    }));
    this.porId = new Map(this.dispensadores.map((d) => [d.id, d]));
    this.crearReceptorYAseo();
  }

  crearReceptorYAseo() {
    this.receptor = new Receptor({ ids: IDS, cfg: this.cfg, ahoraMs: this.ahora, registrar: this.registrar });
    this.aseo = new Aseo(this, this.estrategia);
  }

  dispensador(id) {
    return this.porId.get(id);
  }

  coordenadas(lugar) {
    return punto(lugar.piso, lugar.clave, lugar.idx);
  }

  nivelReal(d) {
    return (d.ml / this.cfg.jabon.capacidadMl) * 100;
  }

  contar(d, clave) {
    d.ind[clave]++;
  }

  totales() {
    const t = indicadoresEnCero();
    for (const d of this.dispensadores) {
      if (d.id === this.idEnVivo) continue;
      for (const k of Object.keys(t)) t[k] += d.ind[k];
    }
    return {
      usos: t.usos,
      usosSinJabon: t.usosSinJabon,
      horasSinJabon: t.segundosSinJabon / 3600,
      visitas: t.visitas,
      visitasInnecesarias: t.visitasInnecesarias,
      recargas: t.recargas,
    };
  }

  setEstrategia(estrategia) {
    this.estrategia = estrategia;
    this.aseo.setEstrategia(estrategia, this.ahora);
  }

  setFalla(id, falla, activa) {
    this.dispensador(id).dispositivo.setFalla(falla, activa, this.ahora);
  }

  // Avanza `segundos` de tiempo simulado (en pasos fijos del ciclo del ESP32).
  avanzar(segundos) {
    this.avanzarHasta(this.tVisual + segundos * 1000);
  }

  avanzarHasta(ms) {
    this.tVisual = Math.max(this.tVisual, ms);
    while (this.ahora + this.dtMs <= this.tVisual) this.paso();
  }

  paso() {
    const t = this.ahora + this.dtMs;
    const dtS = this.dtMs / 1000;
    const c = this.cfg;
    const abierto = estaAbierto(t, c);
    const base = abierto ? (tasaBase(t, c) * dtS) / 3600 : 0;

    // 1. Personas que usan el jabón (mismo flujo aleatorio sin importar la estrategia).
    for (const d of this.dispensadores) {
      if (d.id === this.idEnVivo) continue;
      const n = d.azarUsos.poisson(base * factorPiso(d.piso, c));
      for (let k = 0; k < n; k++) {
        d.ind.usos++;
        const conJabon = d.ml >= c.jabon.mlPorUso;
        if (conJabon) d.ml -= c.jabon.mlPorUso;
        else d.ind.usosSinJabon++;
        if (this.registrar && this.eventosUso.length < 300) this.eventosUso.push({ id: d.id, ms: t, conJabon });
      }
      if (abierto && d.ml < c.jabon.mlPorUso) d.ind.segundosSinJabon += dtS;
    }

    // 2. Cada ESP32 mide y publica; el receptor valida.
    for (const d of this.dispensadores) {
      if (d.id === this.idEnVivo) continue;
      for (const m of d.dispositivo.paso(t, this.nivelReal(d))) this.entregar(m.tema, m.carga, t, { falso: m.falso });
    }
    this.receptor.revisarTiempos(t);

    // 3. Aseo.
    this.aseo.actualizar(t);

    if (this.registrar && t % 600000 === 0) {
      for (const d of this.dispensadores) {
        d.historialReal.push({ ms: t, v: this.nivelReal(d) });
        if (d.historialReal.length > 600) d.historialReal.shift();
      }
    }
    this.ahora = t;
  }

  entregar(tema, carga, ahoraMs, meta = {}) {
    const r = this.receptor.procesar(tema, carga, ahoraMs);
    if (this.registrar && this.eventosMensaje.length < 300) {
      this.eventosMensaje.push({ tema, ms: ahoraMs, aceptado: r.aceptado, id: r.id ?? meta.idTema ?? null, regla: r.regla, ...meta });
    }
    return r;
  }

  vaciarEventos() {
    const usos = this.eventosUso;
    const mensajes = this.eventosMensaje;
    this.eventosUso = [];
    this.eventosMensaje = [];
    return { usos, mensajes };
  }

  // Salta a otro reloj (por ejemplo la hora real del modo en vivo). Conserva los niveles
  // físicos y las fallas; el receptor, el aseo y los indicadores empiezan de cero.
  reiniciarReloj(ms) {
    const t = Math.floor(ms / this.dtMs) * this.dtMs;
    this.ahora = t;
    this.tVisual = t;
    for (const d of this.dispensadores) {
      d.ind = indicadoresEnCero();
      d.historialReal = [];
      d.dispositivo.reiniciar();
      if (d.dispositivo.fallas.avisoFalso) d.dispositivo.proximoAvisoFalsoMs = t;
    }
    this.crearReceptorYAseo();
  }

  // El dispensador `id` deja de simularse: sus datos llegan de afuera (ESP32 de Wokwi).
  activarEnVivo(id, tiempos, ahoraMs) {
    this.idEnVivo = id;
    this.reiniciarReloj(ahoraMs);
    this.receptor.setTiempos(id, tiempos);
  }

  desactivarEnVivo() {
    const id = this.idEnVivo;
    if (!id) return;
    const ultimo = this.receptor.estadoDe(id, this.ahora).valor;
    const d = this.dispensador(id);
    if (ultimo !== null) d.ml = (ultimo / 100) * this.cfg.jabon.capacidadMl;
    d.dispositivo.reiniciar();
    this.idEnVivo = null;
    this.receptor.setTiempos(id, null);
    this.receptor.reiniciarDispensador(id, this.ahora);
  }
}
