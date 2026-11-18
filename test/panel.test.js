import { describe, expect, it } from 'vitest';
import { CAMPOS, ESQUEMA, VECTOR_PRUEBA, firmar } from '../src/modelo/contrato.js';
import { funcionamiento, instantanea } from '../src/modelo/panel.js';
import { REGLAS } from '../src/modelo/receptor.js';
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
    const foto = instantanea(sim);
    const n = nodo(foto);
    expect(comp(n, 'dato')).toBe('falla');
    expect(comp(n, 'comunicacion')).toBe('ok');
    expect(comp(n, 'firma')).toBe('ok');
    expect(n.funcionamiento.clave).toBe('revisar');
    expect(n.fallas).toHaveLength(1);
    expect(foto.red.porRegla.R6).toBeGreaterThan(0);
    expect(foto.aseo.revisar).toContain(ID);
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
    expect(comp(n, 'nivel')).toBe('pendiente'); // el último valor no es un dato actual
    expect(funcionamiento(n).clave).toBe('sin_dato');
    expect(n.valor).toBe(antes);
    expect(foto.resumen.enLinea).toBe(11);
    expect(foto.resumen.sinDato).toBe(1);
    expect(foto.aseo.sinDato).toContain(ID);
  });

  it('un nodo en línea que nunca mandó un dato válido no aparece como «funciona»', () => {
    const sim = new Simulacion({});
    sim.setFalla(ID, 'obstruccion', true); // desde antes del primer mensaje
    sim.avanzar(600);
    let n = nodo(instantanea(sim));
    expect(n.vivo).toBe(true);
    expect(n.valor).toBeNull();
    expect(comp(n, 'nivel')).toBe('pendiente');
    // Aseo lo revisa, pero la última lectura sigue rechazada.
    sim.receptor.marcarRevisado(ID, sim.ahora);
    const foto = instantanea(sim);
    n = nodo(foto);
    expect(n.revisar).toBe(false);
    expect(n.funcionamiento).toEqual({ clave: 'revisar', texto: 'Dato rechazado' });
    expect(comp(n, 'dato')).toBe('falla');
    expect(foto.resumen.sinDato).toBe(1); // igual que la lista de aseo
    expect(foto.aseo.sinDato).toContain(ID);
  });

  it('un aviso falso en el tema de un nodo se ve en la firma, sin atribuírselo al nodo', () => {
    const sim = new Simulacion({});
    sim.avanzar(600);
    sim.setFalla(ID, 'avisoFalso', true);
    sim.avanzar(60);
    const foto = instantanea(sim);
    const n = nodo(foto);
    expect(['aviso', 'falla']).toContain(comp(n, 'firma'));
    expect(n.red).toMatchObject({ regla: 'R3', rechazos: 1 });
    expect(comp(n, 'dato')).toBe('ok'); // el receptor no le atribuye el rechazo
    expect(n.rechazados).toBe(0);
    expect(foto.red.rechazosRed).toBe(1);
    expect(foto.red.porRegla.R3).toBe(1);
    // En el tráfico queda el mensaje con su carga, marcado como intruso.
    const falso = foto.trafico.find((m) => m.origen === 'intruso');
    expect(falso).toMatchObject({ aceptado: false, regla: 'R3', id: null, tema: n.tema });
    expect(JSON.parse(falso.carga).id).toBe(ID);
  });

  it('el tráfico guarda los últimos mensajes con su JSON y cuadra con las cuentas por capa', () => {
    const sim = new Simulacion({});
    sim.avanzar(3600);
    sim.setFalla(ID, 'espuma', true);
    sim.avanzar(1800);
    const foto = instantanea(sim);
    const { red } = foto;
    expect(red.recibidos).toBe(red.aceptados + red.rechazosRed + red.rechazosNegocio);
    expect(red.aceptados).toBe(foto.resumen.aceptados);
    expect(foto.trafico.length).toBeGreaterThan(0);
    expect(foto.trafico.length).toBeLessThanOrEqual(60);
    const ns = foto.trafico.map((m) => m.n);
    expect(ns).toEqual([...ns].sort((a, b) => a - b)); // en orden de llegada
    for (const m of foto.trafico.filter((x) => x.aceptado)) expect(Object.keys(JSON.parse(m.carga))).toEqual(CAMPOS);
  });
});

describe('contrato del dato', () => {
  it('el esquema documenta los 7 campos en el orden del contrato', () => {
    expect(ESQUEMA.map((c) => c.campo)).toEqual(CAMPOS);
  });

  it('el vector de prueba que muestra el panel es el obligatorio', () => {
    expect(firmar(VECTOR_PRUEBA.campos)).toBe(VECTOR_PRUEBA.firma);
  });

  it('las reglas son R1–R8, en orden: R1–R3 de red y R4–R8 de negocio', () => {
    expect(REGLAS.map((r) => r.regla)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8']);
    expect(REGLAS.filter((r) => r.capa === 'red').map((r) => r.regla)).toEqual(['R1', 'R2', 'R3']);
    const sim = new Simulacion({});
    for (const r of REGLAS) expect(typeof r.comprueba(sim.cfg.receptor)).toBe('string');
  });
});
