import { describe, expect, it } from 'vitest';
import { compararEstrategias, inicioComparacion } from '../src/modelo/comparar.js';
import { Simulacion } from '../src/modelo/simulacion.js';

const ID = 'bano-bloque-b-d2';

describe('comparar 7 días', () => {
  const resultados = compararEstrategias({ dias: 7 });

  it('corre las 3 estrategias con los mismos usos totales', () => {
    expect(resultados.map((r) => r.estrategia)).toEqual(['sensores', 'rondas4h', 'rondas2']);
    const usos = resultados.map((r) => r.usos);
    expect(usos[0]).toBeGreaterThan(0);
    expect(new Set(usos).size).toBe(1);
  });

  it('es determinista con la misma semilla', () => {
    const otra = compararEstrategias({ dias: 2 });
    const otraVez = compararEstrategias({ dias: 2 });
    expect(otraVez).toEqual(otra);
    const distinta = compararEstrategias({ dias: 2, semilla: 7 });
    expect(distinta[0].usos).not.toBe(otra[0].usos);
  });
});

describe('simulación', () => {
  it('aseo recarga, confirma en el receptor y la subida se acepta (sin R7)', () => {
    const sim = new Simulacion({ estrategia: 'sensores', inicioMs: inicioComparacion() });
    sim.receptor.maxEventos = 1e6;
    sim.avanzar(3 * 86400);
    const eventos = sim.receptor.eventos;
    expect(sim.totales().recargas).toBeGreaterThan(0);
    expect(eventos.some((e) => e.texto.startsWith('RECARGA CONFIRMADA'))).toBe(true);
    expect(eventos.some((e) => e.texto.includes('R7'))).toBe(false);
  });

  it('domingo cerrado: no hay usos', () => {
    // inicioComparacion() es lunes 00:00; el domingo empieza 6 días después.
    const sim = new Simulacion({ inicioMs: inicioComparacion() + 6 * 86400000, registrar: false });
    sim.avanzar(86400);
    expect(sim.totales().usos).toBe(0);
  });

  it('cada falla dispara la regla esperada', () => {
    const casos = [
      ['sensorDanado', 'R8'],
      ['espuma', 'R7'],
      ['obstruccion', 'R6'],
    ];
    for (const [falla, regla] of casos) {
      const sim = new Simulacion({ estrategia: 'rondas2' });
      sim.dispensador(ID).ml = 700;
      sim.avanzar(60);
      sim.setFalla(ID, falla, true);
      sim.avanzar(30);
      const r = sim.receptor.estadoDe(ID, sim.ahora);
      expect(r.revisar, falla).toBe(true);
      expect(r.motivoRevisar.startsWith(regla), `${falla}: ${r.motivoRevisar}`).toBe(true);
    }
  });

  it('sin energía lleva a "sin dato"; el aviso falso se rechaza con R3', () => {
    const sim = new Simulacion({ estrategia: 'rondas2' });
    sim.dispensador(ID).ml = 700;
    sim.avanzar(60);
    sim.setFalla(ID, 'sinEnergia', true);
    sim.avanzar(15 * 60 + 20);
    expect(sim.receptor.estadoDe(ID, sim.ahora).estado).toBe('sin_dato');

    sim.setFalla(ID, 'avisoFalso', true);
    sim.avanzar(10);
    expect(sim.receptor.eventos.at(-1).texto).toBe(`RECHAZADO ucc7788/jabon/${ID}: R3 firma no coincide`);
    expect(sim.receptor.estadoDe(ID, sim.ahora).estado).toBe('sin_dato');
  });

  it('modo en vivo: d2 deja de simularse y usa los tiempos de la demo', () => {
    const sim = new Simulacion();
    const ahora = Date.UTC(2026, 9, 28, 15, 0, 0);
    sim.activarEnVivo(ID, { sinDatoS: 45, confirmacionRecargaS: 120 }, ahora);
    const ml = sim.dispensador(ID).ml;
    sim.avanzarHasta(ahora + 60000);
    expect(sim.dispensador(ID).ml).toBe(ml);
    expect(sim.receptor.estadoDe(ID, sim.ahora).estado).toBe('sin_dato');
    expect(sim.receptor.estadoDe('bano-bloque-b-d1', sim.ahora).vivo).toBe(true);
  });
});
