import { describe, expect, it } from 'vitest';
import { funcionamiento, instantanea } from '../src/modelo/panel.js';
import { Simulacion } from '../src/modelo/simulacion.js';

const ID = 'bano-bloque-b-d3';
const nodo = (foto, id = ID) => foto.nodos.find((n) => n.id === id);
const comp = (n, clave) => n.comprobaciones.find((c) => c.clave === clave).resultado;

describe('panel de control', () => {
  it('lista los 12 nodos, 2 por piso, y todos funcionan al empezar', () => {
    const sim = new Simulacion({});
    sim.avanzar(600);
    const foto = instantanea(sim);
    expect(foto.nodos).toHaveLength(12);
    for (let p = 1; p <= 6; p++) expect(foto.nodos.filter((n) => n.piso === p)).toHaveLength(2);
    expect(foto.resumen.enLinea).toBe(12);
    expect(foto.resumen.aceptados).toBeGreaterThan(0);
    for (const n of foto.nodos) {
      expect(comp(n, 'comunicacion')).toBe('ok');
      expect(comp(n, 'firma')).toBe('ok');
      expect(comp(n, 'dato')).toBe('ok');
    }
    expect(JSON.parse(JSON.stringify(foto))).toEqual(foto); // viaja entera por BroadcastChannel
  });

  it('una obstrucción deja el nodo en revisar, con la comprobación de dato en falla', () => {
    const sim = new Simulacion({});
    sim.avanzar(600);
    sim.setFalla(ID, 'obstruccion', true);
    sim.avanzar(600);
    const n = nodo(instantanea(sim));
    expect(comp(n, 'dato')).toBe('falla');
    expect(comp(n, 'comunicacion')).toBe('ok');
    expect(n.funcionamiento.clave).toBe('revisar');
    expect(n.fallas).toHaveLength(1);
  });

  it('sin energía, el nodo queda sin comunicación y nunca en 0 %', () => {
    const sim = new Simulacion({});
    sim.avanzar(600);
    const antes = nodo(instantanea(sim)).valor;
    sim.setFalla(ID, 'sinEnergia', true);
    sim.avanzar(3600);
    const foto = instantanea(sim);
    const n = nodo(foto);
    expect(comp(n, 'comunicacion')).toBe('falla');
    expect(funcionamiento(n).clave).toBe('sin_dato');
    expect(n.valor).toBe(antes);
    expect(foto.resumen.enLinea).toBe(11);
    expect(foto.resumen.sinDato).toBe(1);
  });
});
