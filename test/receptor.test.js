import { beforeEach, describe, expect, it } from 'vitest';
import { clavePrueba, firmar, formatearMomento, leerMomento } from '../src/modelo/contrato.js';
import { IDS } from '../src/modelo/edificio.js';
import { Receptor } from '../src/modelo/receptor.js';

const ID = 'bano-bloque-b-d2';
const TEMA = `ucc7788/jabon/${ID}`;
const T0 = leerMomento('2026-10-20T09:15:00-05:00');

// Arma un mensaje firmado; `cambios` permite romper cualquier campo a propósito.
function mensaje(valor, s = 0, cambios = {}, clave) {
  const campos = {
    id: ID,
    variable: 'nivel_jabon',
    valor,
    unidad: '%',
    momento: formatearMomento(T0 + s * 1000),
    version: 1,
    ...cambios,
  };
  const firma = firmar(campos, clave ?? clavePrueba(campos.id));
  return JSON.stringify({ ...campos, firma });
}

let rx;
let reloj;
// Envía al receptor con la hora del receptor igual al momento del mensaje (+ desfase).
function enviar(valor, s, cambios, opciones = {}) {
  reloj = T0 + (opciones.ahoraS ?? s) * 1000;
  const carga = opciones.carga ?? mensaje(valor, s, cambios, opciones.clave);
  return rx.procesar(opciones.tema ?? TEMA, carga, reloj);
}

beforeEach(() => {
  rx = new Receptor({ ids: IDS, ahoraMs: T0 });
});

describe('R1: JSON legible', () => {
  it('pasa un JSON válido', () => {
    expect(enviar(50, 0)).toMatchObject({ aceptado: true, valor: 50 });
  });
  it('rechaza texto que no es JSON, sin atribuirlo ni contarlo como vida', () => {
    const r = enviar(0, 0, {}, { carga: '{"id":"bano-bloque-b-d2", valor' });
    expect(r).toMatchObject({ aceptado: false, regla: 'R1', id: null });
    expect(rx.estadoDe(ID, reloj).ultimoAutenticoMs).toBeNull();
    expect(rx.eventos.at(-1).texto).toBe(`RECHAZADO ${TEMA}: R1 no es JSON legible`);
  });
});

describe('R2: 7 campos y enteros', () => {
  it('pasa con los 7 campos y valor/version enteros', () => {
    expect(enviar(0, 0).aceptado).toBe(true);
  });
  it('rechaza si falta un campo', () => {
    const sinFirma = JSON.stringify({ id: ID, variable: 'nivel_jabon', valor: 5, unidad: '%', momento: formatearMomento(T0), version: 1 });
    expect(enviar(0, 0, {}, { carga: sinFirma })).toMatchObject({ regla: 'R2', detalle: 'R2 faltan campos: firma' });
  });
  it('rechaza valor null, decimal o texto, y version no entera', () => {
    expect(enviar(null, 0).regla).toBe('R2');
    expect(enviar(25.5, 0).regla).toBe('R2');
    expect(enviar('25', 0).regla).toBe('R2');
    expect(enviar(25, 0, { version: '1' }).regla).toBe('R2');
    const conPunto = mensaje(25, 0).replace('"valor":25', '"valor":25.0');
    expect(enviar(0, 0, {}, { carga: conPunto }).regla).toBe('R2');
    expect(rx.estadoDe(ID, reloj).ultimoAutenticoMs).toBeNull();
  });
});

describe('R3: id, tema y firma', () => {
  it('pasa con id registrado, tema correcto y firma de prueba', () => {
    expect(enviar(40, 0).aceptado).toBe(true);
  });
  it('rechaza id no registrado, tema cruzado y firma con clave inventada', () => {
    expect(enviar(40, 0, { id: 'bano-bloque-b-d99' }).detalle).toBe('R3 id no registrado: "bano-bloque-b-d99"');
    expect(enviar(40, 0, {}, { tema: 'ucc7788/jabon/bano-bloque-b-d1' }).detalle).toMatch(/^R3 tema no coincide/);
    const r = enviar(0, 0, {}, { clave: 'clave-inventada' });
    expect(r).toMatchObject({ aceptado: false, regla: 'R3', detalle: 'R3 firma no coincide', id: null });
    expect(rx.estadoDe(ID, reloj).ultimoAutenticoMs).toBeNull();
    expect(rx.estadoDe(ID, reloj).revisar).toBe(false);
  });
});

describe('R4: variable, unidad y versión', () => {
  it('pasa con nivel_jabon, % y versión 1', () => {
    expect(enviar(40, 0).aceptado).toBe(true);
  });
  it('rechaza otra variable, otra unidad u otra versión; sigue vivo y pasa a revisar', () => {
    enviar(40, 0);
    expect(enviar(40, 10, { variable: 'temperatura' }).regla).toBe('R4');
    expect(enviar(40, 20, { unidad: 'ml' }).regla).toBe('R4');
    expect(enviar(40, 30, { version: 2 }).regla).toBe('R4');
    const s = rx.estadoDe(ID, reloj);
    expect(s).toMatchObject({ vivo: true, revisar: true, valor: 40 });
    expect(s.ultimoAutenticoMs).toBe(reloj);
  });
});

describe('R5: momento', () => {
  it('pasa con hasta 60 s de adelanto y en orden', () => {
    expect(enviar(40, 50, {}, { ahoraS: 0 }).aceptado).toBe(true);
    expect(enviar(40, 60).aceptado).toBe(true);
  });
  it('rechaza sin zona horaria, en el futuro, viejo, repetido o anterior', () => {
    expect(enviar(40, 0, { momento: '2026-10-20T09:15:00' }).regla).toBe('R5');
    expect(enviar(40, 75, {}, { ahoraS: 0 }).detalle).toBe('R5 momento en el futuro: +75 s');
    expect(enviar(40, 0, {}, { ahoraS: 16 * 60 }).detalle).toBe('R5 momento viejo: 16 min');
    expect(enviar(40, 100).aceptado).toBe(true);
    expect(enviar(40, 100, {}, { ahoraS: 110 }).detalle).toMatch(/^R5 momento no es posterior al último/);
    expect(enviar(40, 90, {}, { ahoraS: 120 }).regla).toBe('R5');
    expect(rx.estadoDe(ID, reloj).revisar).toBe(true);
  });
});

describe('R6: valor posible', () => {
  it('pasa 0 y 100', () => {
    expect(enviar(0, 0).aceptado).toBe(true);
    rx = new Receptor({ ids: IDS, ahoraMs: T0 });
    expect(enviar(100, 10).aceptado).toBe(true);
  });
  it('rechaza valores imposibles y conserva el último válido', () => {
    enviar(60, 0);
    expect(enviar(116, 10).detalle).toBe('R6 valor imposible: 116');
    expect(enviar(-4, 20).detalle).toBe('R6 valor imposible: -4');
    expect(rx.estadoDe(ID, reloj)).toMatchObject({ valor: 60, revisar: true, estado: 'normal' });
  });
});

describe('R7: no sube solo', () => {
  it('pasa subidas de hasta 5 puntos sobre el mínimo desde la última recarga', () => {
    enviar(50, 0);
    enviar(40, 10);
    expect(enviar(45, 20).aceptado).toBe(true);
  });
  it('rechaza una subida mayor sin recarga confirmada', () => {
    enviar(50, 0);
    enviar(40, 10);
    const r = enviar(46, 20);
    expect(r.regla).toBe('R7');
    expect(rx.eventos.at(-1).texto).toBe(
      'RECHAZADO bano-bloque-b-d2: R7 sube solo: 40 -> 46 sin recarga confirmada (mínimo desde la última recarga: 40)',
    );
  });
  it('pasa con recarga confirmada; la confirmación termina cuando el nivel vuelve a bajar', () => {
    enviar(20, 0);
    rx.confirmarRecarga(ID, T0 + 5000);
    expect(enviar(90, 10).aceptado).toBe(true);
    expect(enviar(100, 20).aceptado).toBe(true);
    expect(enviar(97, 30).aceptado).toBe(true); // vuelve a bajar: fin de la confirmación
    expect(rx.estadoDe(ID, reloj).recargaConfirmada).toBe(false);
    expect(enviar(100, 40).aceptado).toBe(true); // 97 + 3: dentro de la tolerancia
    expect(enviar(90, 50).aceptado).toBe(true);
    expect(enviar(99, 60).regla).toBe('R7');
  });
  it('la confirmación se vence (10 min en simulación, 2 min en vivo)', () => {
    enviar(20, 0);
    rx.confirmarRecarga(ID, T0);
    expect(enviar(90, 601).regla).toBe('R7');
    rx.setTiempos(ID, { sinDatoS: 45, confirmacionRecargaS: 120 });
    rx.confirmarRecarga(ID, T0 + 610000);
    expect(enviar(90, 610 + 121).regla).toBe('R7');
    rx.confirmarRecarga(ID, T0 + 800000);
    expect(enviar(90, 800 + 60).aceptado).toBe(true);
  });
});

describe('R8: no cae a 0 de golpe', () => {
  it('pasa a 0 si el último válido era menor que 10 %', () => {
    enviar(9, 0);
    expect(enviar(0, 10).aceptado).toBe(true);
    expect(rx.estadoDe(ID, reloj).estado).toBe('vacio');
  });
  it('rechaza 0 si el último válido era 10 % o más', () => {
    enviar(10, 0);
    expect(enviar(0, 10).detalle).toBe('R8 cae a 0 de golpe: último válido 10');
    expect(rx.estadoDe(ID, reloj)).toMatchObject({ valor: 10, estado: 'bajo', revisar: true });
  });
});

describe('estados y lista para aseo', () => {
  it('normal >= 30, bajo 5–29, vacío < 5', () => {
    const casos = [[30, 'normal'], [29, 'bajo'], [5, 'bajo'], [4, 'vacio']];
    casos.forEach(([v, estado], i) => {
      const r = new Receptor({ ids: IDS, ahoraMs: T0 });
      r.procesar(TEMA, mensaje(v, i), T0 + i * 1000);
      expect(r.estadoDe(ID, T0 + i * 1000).estado).toBe(estado);
    });
  });

  it('agrupa en recargar (vacíos primero), revisar, sin dato y sin novedad', () => {
    const ahora = T0 + 10000;
    const enviarDe = (n, valor, cambios = {}) => {
      const id = `bano-bloque-b-d${n}`;
      const campos = { id, variable: 'nivel_jabon', valor, unidad: '%', momento: formatearMomento(ahora), version: 1, ...cambios };
      rx.procesar(`ucc7788/jabon/${id}`, JSON.stringify({ ...campos, firma: firmar(campos) }), ahora);
    };
    enviarDe(1, 20);
    enviarDe(3, 2);
    enviarDe(4, 80);
    enviarDe(5, 70);
    enviarDe(5, 116, { momento: formatearMomento(ahora + 1000) });
    const lista = rx.listaAseo(ahora + 2000);
    expect(lista.recargar.map((s) => s.id)).toEqual(['bano-bloque-b-d3', 'bano-bloque-b-d1']);
    expect(lista.revisar.map((s) => s.id)).toEqual(['bano-bloque-b-d5']);
    expect(lista.sinNovedad.map((s) => s.id)).toEqual(['bano-bloque-b-d4']);
    expect(lista.sinDato).toHaveLength(8);
  });
});

describe('sin dato', () => {
  it('pasan 3 latidos (15 min) sin mensaje auténtico: sin dato, nunca 0 %', () => {
    enviar(50, 0);
    expect(rx.estadoDe(ID, T0 + 900000).estado).toBe('normal');
    const s = rx.estadoDe(ID, T0 + 901000);
    expect(s.estado).toBe('sin_dato');
    expect(s.valor).toBe(50);
    expect(rx.listaAseo(T0 + 901000).sinDato.map((x) => x.id)).toContain(ID);
    expect(rx.listaAseo(T0 + 901000).recargar).toHaveLength(0);
  });

  it('por debajo de 30 % el latido es de 30 s, así que sin dato llega a los 90 s', () => {
    enviar(20, 0);
    expect(rx.estadoDe(ID, T0 + 90000).estado).toBe('bajo');
    expect(rx.estadoDe(ID, T0 + 91000).estado).toBe('sin_dato');
  });

  it('los rechazos R1–R3 no cuentan como señal de vida; R4–R8 sí', () => {
    enviar(50, 0);
    enviar(0, 800, {}, { clave: 'clave-inventada' });
    expect(rx.estadoDe(ID, T0 + 901000).estado).toBe('sin_dato');

    rx = new Receptor({ ids: IDS, ahoraMs: T0 });
    enviar(50, 0);
    enviar(116, 800);
    const s = rx.estadoDe(ID, T0 + 1000000);
    expect(s).toMatchObject({ vivo: true, estado: 'normal', revisar: true, valor: 50 });
  });

  it('en vivo usa el tiempo de la demo (45 s) y lo registra una sola vez', () => {
    rx.setTiempos(ID, { sinDatoS: 45, confirmacionRecargaS: 120 });
    enviar(50, 0);
    rx.revisarTiempos(T0 + 45000);
    expect(rx.estadoDe(ID, T0 + 45000).estado).toBe('normal');
    rx.revisarTiempos(T0 + 46000);
    rx.revisarTiempos(T0 + 50000);
    expect(rx.estadoDe(ID, T0 + 46000).estado).toBe('sin_dato');
    expect(rx.eventos.filter((e) => e.id === ID && e.texto.startsWith('SIN DATO'))).toHaveLength(1);
    enviar(48, 60);
    expect(rx.eventos.at(-2).texto).toBe(`EN LÍNEA ${ID}: vuelve a llegar un mensaje auténtico`);
  });
});
