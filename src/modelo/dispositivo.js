// ESP32-C3 simulado: mide con el HC-SR04, decide cuándo enviar y firma el mensaje.
import { SUPUESTOS } from '../config/supuestos.js';
import { armarMensaje, formatearMomento, temaDe } from './contrato.js';
import { distanciaDesdeNivel, nivelDesdeDistancia } from './sensor.js';

export const FALLAS = {
  sensorDanado: { nombre: 'Sensor dañado (reporta 0 %)', regla: 'R8' },
  espuma: { nombre: 'Espuma (la lectura sube)', regla: 'R7' },
  obstruccion: { nombre: 'Obstrucción (lectura imposible)', regla: 'R6' },
  sinEnergia: { nombre: 'Sin energía (deja de enviar)', regla: 'sin dato' },
  avisoFalso: { nombre: 'Aviso falso (clave inventada)', regla: 'R3' },
};

export class Dispositivo {
  constructor({ id, azar, cfg = SUPUESTOS }) {
    this.id = id;
    this.cfg = cfg;
    this.azar = azar;
    this.tema = temaDe(id, cfg.receptor.temaBase);
    this.fallas = Object.fromEntries(Object.keys(FALLAS).map((f) => [f, false]));
    this.reiniciar();
  }

  // Como si el ESP32 arrancara de nuevo: el primer nivel se envía de inmediato.
  reiniciar() {
    this.ultimoEnviado = null;
    this.ultimoEnvioMs = -Infinity;
    this.ultimaLectura = null;
    this.proximoAvisoFalsoMs = Infinity;
  }

  setFalla(nombre, activa, ahoraMs) {
    if (!(nombre in this.fallas)) throw new Error(`Falla desconocida: ${nombre}`);
    const antes = this.fallas[nombre];
    this.fallas[nombre] = activa;
    if (nombre === 'avisoFalso') this.proximoAvisoFalsoMs = activa ? ahoraMs : Infinity;
    if (nombre === 'sinEnergia' && antes && !activa) this.reiniciar();
  }

  medir(nivelRealPct) {
    const c = this.cfg.dispositivo;
    const f = this.cfg.fallas;
    let d = distanciaDesdeNivel(Math.max(0, Math.min(100, nivelRealPct)), c) + this.azar.normal(0, c.ruidoCm);
    if (this.fallas.sensorDanado) d = c.dVacioCm;
    else if (this.fallas.obstruccion) d = f.obstruccionCm + this.azar.normal(0, c.ruidoCm);
    else if (this.fallas.espuma) d -= f.espumaCm;
    return { d, nivel: nivelDesdeDistancia(d, c) };
  }

  // Un ciclo del loop() del ESP32. Devuelve los mensajes a publicar.
  paso(ahoraMs, nivelRealPct) {
    const salida = [];
    const c = this.cfg.dispositivo;
    const zona = this.cfg.zonaHorariaMin;

    if (this.fallas.avisoFalso && ahoraMs >= this.proximoAvisoFalsoMs) {
      salida.push({
        tema: this.tema,
        carga: armarMensaje({ id: this.id, valor: 0, momento: formatearMomento(ahoraMs, zona), clave: this.cfg.fallas.avisoFalsoClave }),
        falso: true,
      });
      this.proximoAvisoFalsoMs = ahoraMs + this.cfg.fallas.avisoFalsoCadaS * 1000;
    }

    if (this.fallas.sinEnergia) return salida;

    const { nivel } = this.medir(nivelRealPct);
    this.ultimaLectura = nivel;
    // El ritmo del latido sigue al último valor enviado, que es el que conoce el receptor.
    const referencia = this.ultimoEnviado ?? nivel;
    const latidoS = referencia < c.umbralLatidoBajo ? c.latidoBajoS : c.latidoS;
    const cambio = this.ultimoEnviado === null || Math.abs(nivel - this.ultimoEnviado) >= c.cambioMinimo;
    const toca = ahoraMs - this.ultimoEnvioMs >= latidoS * 1000;
    if (cambio || toca) {
      salida.push({
        tema: this.tema,
        carga: armarMensaje({ id: this.id, valor: nivel, momento: formatearMomento(ahoraMs, zona) }),
        falso: false,
      });
      this.ultimoEnviado = nivel;
      this.ultimoEnvioMs = ahoraMs;
    }
    return salida;
  }
}
