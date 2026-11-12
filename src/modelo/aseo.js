// Personal de aseo: se mueve por el pasillo y el ascensor, y atiende según la estrategia.
import { configDia, estaAbierto, horaLocal, msDeHoraLocal } from './afluencia.js';
import { IDS, LUGAR_BASE, infoDispensador, lugarDispensador, ruta } from './edificio.js';

export class Aseo {
  constructor(sim, estrategia) {
    this.sim = sim;
    this.cfg = sim.cfg.aseo;
    this.personal = Array.from({ length: Math.max(1, this.cfg.personas) }, (_, i) => ({
      n: i + 1,
      nombre: this.cfg.personas > 1 ? `Aseo ${i + 1}` : 'Aseo',
      en: { ...LUGAR_BASE },
      pasos: [],
      tarea: null,
      texto: 'En el cuarto de aseo',
    }));
    this.asignados = new Set();
    this.ultimaVisita = new Map();
    this.colaRonda = [];
    this.setEstrategia(estrategia, sim.ahora);
  }

  setEstrategia(estrategia, ahoraMs) {
    this.estrategia = estrategia;
    this.colaRonda = [];
    this.horasRonda = estrategia === 'rondas4h' ? this.cfg.rondasCada4h : estrategia === 'rondas2' ? this.cfg.rondas2AlDia : [];
    this.proximaRonda = this.siguienteRonda(ahoraMs);
  }

  siguienteRonda(desdeMs) {
    if (!this.horasRonda.length) return Infinity;
    for (let dia = 0; dia < 8; dia++) {
      for (const h of this.horasRonda) {
        const ms = msDeHoraLocal(desdeMs, h, dia, this.sim.cfg.zonaHorariaMin);
        if (ms >= desdeMs) return ms;
      }
    }
    return Infinity;
  }

  idsAtendibles() {
    return IDS.filter((id) => id !== this.sim.idEnVivo);
  }

  actualizar(t) {
    while (t >= this.proximaRonda) {
      const dia = configDia(horaLocal(this.proximaRonda, this.sim.cfg.zonaHorariaMin).dia, this.sim.cfg);
      if (dia.abierto) this.colaRonda = this.idsAtendibles();
      this.proximaRonda = this.siguienteRonda(this.proximaRonda + 1000);
    }
    for (const p of this.personal) {
      this.avanzarPasos(p, t);
      if (p.pasos.length === 0) this.despachar(p, t);
    }
  }

  avanzarPasos(p, t) {
    while (p.pasos.length && p.pasos[0].t1 <= t) {
      const paso = p.pasos.shift();
      p.en = paso.hastaLugar;
      if (paso.alFinal) paso.alFinal(paso.t1);
      // Si va de vuelta al cuarto y aparece trabajo, cambia de rumbo en el próximo punto.
      if (p.tarea?.tipo === 'volver' && p.pasos.length && this.hayTrabajo(paso.t1)) {
        p.pasos = [];
        p.tarea = null;
        this.despachar(p, paso.t1);
      }
    }
  }

  hayTrabajo(t) {
    if (this.estrategia === 'sensores') return estaAbierto(t, this.sim.cfg) && this.elegir(t) !== null;
    return this.colaRonda.length > 0;
  }

  despachar(p, t) {
    if (this.estrategia === 'sensores') {
      if (estaAbierto(t, this.sim.cfg)) {
        const objetivo = this.elegir(t);
        if (objetivo) return this.irA(p, objetivo.id, t, objetivo.motivo);
      }
    } else if (this.colaRonda.length) {
      const id = this.colaRonda.shift();
      return this.irA(p, id, t, 'ronda');
    }
    const enBase = p.en.piso === LUGAR_BASE.piso && p.en.clave === LUGAR_BASE.clave && p.en.idx === LUGAR_BASE.idx;
    if (!enBase) {
      p.tarea = { tipo: 'volver' };
      p.texto = 'Vuelve al cuarto de aseo';
      this.planificar(p, LUGAR_BASE, t);
    } else {
      p.tarea = null;
      p.texto = 'En el cuarto de aseo';
    }
  }

  // Estrategia con sensores: recargar (vacíos primero), luego revisar, luego sin dato.
  elegir(t) {
    const lista = this.sim.receptor.listaAseo(t);
    const reVisita = this.cfg.reVisitaMin * 60000;
    const candidatos = [
      ...lista.recargar.map((s) => ({ s, motivo: s.estado === 'vacio' ? 'vacío' : 'bajo' })),
      ...lista.revisar.map((s) => ({ s, motivo: 'revisar' })),
      ...lista.sinDato.filter((s) => s.estado !== 'esperando').map((s) => ({ s, motivo: 'sin dato' })),
    ];
    for (const { s, motivo } of candidatos) {
      if (s.id === this.sim.idEnVivo || this.asignados.has(s.id)) continue;
      const ultima = this.ultimaVisita.get(s.id);
      if (ultima !== undefined && t - ultima < reVisita) continue;
      return { id: s.id, motivo };
    }
    return null;
  }

  irA(p, id, t, motivo) {
    this.asignados.add(id);
    p.tarea = { tipo: 'visita', id, motivo };
    p.texto = `Va a ${infoDispensador(id).corto} (${motivo})`;
    const ultimo = this.planificar(p, lugarDispensador(id), t);
    const llegar = (tl) => this.llegar(p, id, tl);
    if (ultimo) ultimo.alFinal = llegar;
    else p.pasos.push(this.pasoQuieto(p, t, t, 'esperar', llegar));
  }

  llegar(p, id, t) {
    const d = this.sim.dispensador(id);
    const cap = this.sim.cfg.jabon.capacidadMl;
    const nivel = (d.ml / cap) * 100;
    this.sim.contar(d, 'visitas');
    if (nivel >= this.sim.cfg.receptor.umbralBajo) this.sim.contar(d, 'visitasInnecesarias');
    this.ultimaVisita.set(id, t);
    const corto = infoDispensador(id).corto;
    if (nivel < this.cfg.umbralRecarga) {
      p.texto = `Recarga ${corto}`;
      p.pasos.push(
        this.pasoQuieto(p, t, t + this.cfg.recargaS * 1000, 'recargar', (tf) => {
          d.ml = cap;
          this.sim.contar(d, 'recargas');
          this.sim.receptor.confirmarRecarga(id, tf);
          this.sim.receptor.marcarRevisado(id, tf);
          this.terminar(id);
        }),
      );
    } else {
      p.texto = `Revisa ${corto}`;
      p.pasos.push(
        this.pasoQuieto(p, t, t + this.cfg.revisionS * 1000, 'revisar', (tf) => {
          this.sim.receptor.marcarRevisado(id, tf);
          this.terminar(id);
        }),
      );
    }
  }

  terminar(id) {
    this.asignados.delete(id);
    for (const p of this.personal) if (p.tarea?.id === id) p.tarea = null;
  }

  pasoQuieto(p, t0, t1, tipo, alFinal) {
    const aqui = this.sim.coordenadas(p.en);
    return { tipo, t0, t1, desde: aqui, hasta: aqui, hastaLugar: p.en, alFinal };
  }

  // Convierte una ruta en pasos con tiempos. Devuelve el último paso (o null si ya está ahí).
  planificar(p, destino, t) {
    const pts = ruta(p.en, destino);
    let tiempo = t;
    let ultimo = null;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      let dur;
      let tipo = 'caminar';
      let espera = 0;
      if (a.piso !== b.piso) {
        tipo = 'ascensor';
        espera = this.cfg.esperaAscensorS * 1000;
        dur = espera + Math.abs(b.piso - a.piso) * this.cfg.ascensorSPorPiso * 1000;
      } else {
        dur = (Math.hypot(b.x - a.x, b.z - a.z) / this.cfg.velocidadMS) * 1000;
      }
      ultimo = {
        tipo,
        t0: tiempo,
        t1: tiempo + dur,
        espera,
        desde: a,
        hasta: b,
        hastaLugar: { piso: b.piso, clave: b.clave, idx: b.idx },
      };
      p.pasos.push(ultimo);
      tiempo += dur;
    }
    return ultimo;
  }

  // Posición continua (para la escena 3D) en el instante t.
  posicion(p, t) {
    const paso = p.pasos[0];
    if (!paso || t <= paso.t0) {
      const c = this.sim.coordenadas(p.en);
      return { ...c, pisoF: c.piso, tipo: paso?.tipo ?? 'quieto', rumbo: null };
    }
    const f = Math.min(1, (t - paso.t0) / Math.max(1, paso.t1 - paso.t0));
    const { desde: a, hasta: b } = paso;
    if (paso.tipo === 'ascensor') {
      const dur = paso.t1 - paso.t0;
      const fr = Math.max(0, (t - paso.t0 - paso.espera) / Math.max(1, dur - paso.espera));
      return { x: a.x, z: a.z, piso: a.piso, pisoF: a.piso + (b.piso - a.piso) * Math.min(1, fr), tipo: 'ascensor', rumbo: null };
    }
    const rumbo = a.x !== b.x || a.z !== b.z ? Math.atan2(b.x - a.x, b.z - a.z) : null;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, piso: a.piso, pisoF: a.piso, tipo: paso.tipo, rumbo };
  }
}
