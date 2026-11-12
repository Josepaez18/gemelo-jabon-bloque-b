import { describe, expect, it } from 'vitest';
import { SUPUESTOS } from '../src/config/supuestos.js';
import { crearAzar } from '../src/modelo/azar.js';
import { leerMomento } from '../src/modelo/contrato.js';
import { Dispositivo } from '../src/modelo/dispositivo.js';
import { nivelCrudo, nivelDesdeDistancia, redondearC } from '../src/modelo/sensor.js';
import { Receptor } from '../src/modelo/receptor.js';
import { IDS } from '../src/modelo/edificio.js';

describe('sensor: distancia a nivel', () => {
  it('4 cm es lleno, 20 cm es vacío, 12 cm es la mitad', () => {
    expect(nivelDesdeDistancia(4)).toBe(100);
    expect(nivelDesdeDistancia(20)).toBe(0);
    expect(nivelDesdeDistancia(12)).toBe(50);
  });

  it('absorbe solo 3 puntos de error a cada lado', () => {
    expect(redondearC(-2.5)).toBe(-3); // round de C/Arduino
    expect(redondearC(2.5)).toBe(3);
    expect(nivelCrudo(20.48)).toBe(-3);
    expect(nivelDesdeDistancia(20.48)).toBe(0);
    expect(nivelDesdeDistancia(20.6)).toBe(-4); // imposible: se envía igual
    expect(nivelDesdeDistancia(3.6)).toBe(100); // 102.5 -> 103 -> 100
    expect(nivelDesdeDistancia(3.4)).toBe(104);
  });
});

const sinRuido = { ...SUPUESTOS, dispositivo: { ...SUPUESTOS.dispositivo, ruidoCm: 0 } };
const T0 = leerMomento('2026-10-20T09:15:00-05:00');

function nuevoDispositivo() {
  return new Dispositivo({ id: 'bano-bloque-b-d2', azar: crearAzar(1), cfg: sinRuido });
}

describe('dispositivo: cuándo envía', () => {
  it('envía de inmediato al arrancar y al cambiar 2 puntos o más', () => {
    const d = nuevoDispositivo();
    expect(d.paso(T0, 60)).toHaveLength(1);
    expect(d.paso(T0 + 10000, 59)).toHaveLength(0); // cambió 1 punto
    expect(d.paso(T0 + 20000, 58)).toHaveLength(1); // cambió 2 puntos
  });

  it('latido cada 5 min, o cada 30 s por debajo de 30 %', () => {
    const d = nuevoDispositivo();
    d.paso(T0, 60);
    expect(d.paso(T0 + 290000, 60)).toHaveLength(0);
    expect(d.paso(T0 + 300000, 60)).toHaveLength(1);
    const b = nuevoDispositivo();
    b.paso(T0, 20);
    expect(b.paso(T0 + 20000, 20)).toHaveLength(0);
    expect(b.paso(T0 + 30000, 20)).toHaveLength(1);
  });

  it('sin energía no envía nada; el aviso falso no pasa la firma', () => {
    const d = nuevoDispositivo();
    d.setFalla('sinEnergia', true, T0);
    expect(d.paso(T0, 60)).toHaveLength(0);
    d.setFalla('sinEnergia', false, T0);
    d.setFalla('avisoFalso', true, T0);
    const msgs = d.paso(T0 + 10000, 60);
    expect(msgs.filter((m) => m.falso)).toHaveLength(1);
    const rx = new Receptor({ ids: IDS, ahoraMs: T0 });
    const r = rx.procesar(msgs[0].tema, msgs[0].carga, T0 + 10000);
    expect(r).toMatchObject({ aceptado: false, regla: 'R3', id: null });
  });

  it('las fallas producen las lecturas esperadas', () => {
    const d = nuevoDispositivo();
    d.setFalla('sensorDanado', true, T0);
    expect(d.medir(70).nivel).toBe(0);
    d.setFalla('sensorDanado', false, T0);
    d.setFalla('espuma', true, T0);
    expect(d.medir(50).nivel).toBe(63);
    d.setFalla('espuma', false, T0);
    d.setFalla('obstruccion', true, T0);
    expect(d.medir(50).nivel).toBeGreaterThan(103);
  });
});
