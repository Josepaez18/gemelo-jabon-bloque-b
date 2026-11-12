import { createHmac, createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { armarMensaje, firmar, formatearMomento, leerMomento, textoAFirmar } from '../src/modelo/contrato.js';
import { crearHmac, sha256Hex } from '../src/modelo/hmac.js';

const VECTOR = {
  id: 'bano-bloque-b-d2',
  variable: 'nivel_jabon',
  valor: 25,
  unidad: '%',
  momento: '2026-10-20T09:15:00-05:00',
  version: 1,
};
const FIRMA = '270e0a5dbe4bb4f4914d0894453b2714d13dce84a0c79c8bf2ac8a718842269f';

describe('firma HMAC-SHA256', () => {
  it('cumple el vector de prueba obligatorio', () => {
    expect(textoAFirmar(VECTOR)).toBe('bano-bloque-b-d2|nivel_jabon|25|%|2026-10-20T09:15:00-05:00|1');
    expect(firmar(VECTOR)).toBe(FIRMA);
  });

  it('arma el JSON compacto con los 7 campos en orden', () => {
    const texto = armarMensaje({ id: VECTOR.id, valor: 25, momento: VECTOR.momento });
    expect(texto).toBe(
      '{"id":"bano-bloque-b-d2","variable":"nivel_jabon","valor":25,"unidad":"%",' +
        `"momento":"2026-10-20T09:15:00-05:00","version":1,"firma":"${FIRMA}"}`,
    );
  });

  it('da lo mismo que node:crypto (claves cortas, largas y texto con tildes)', () => {
    const casos = [
      ['clave-prueba-bano-bloque-b-d7', 'bano-bloque-b-d7|nivel_jabon|0|%|2026-10-21T22:00:00-05:00|1'],
      ['k', ''],
      ['x'.repeat(64), 'exactamente un bloque'],
      ['clave muy larga '.repeat(10), 'mensaje '.repeat(40)],
      ['ñandú', 'baño de mujeres · piso 3'],
    ];
    for (const [clave, texto] of casos) {
      expect(crearHmac(clave)(texto)).toBe(createHmac('sha256', clave).update(texto).digest('hex'));
    }
    for (const texto of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000)]) {
      expect(sha256Hex(texto)).toBe(createHash('sha256').update(texto).digest('hex'));
    }
  });

  it('formatea y lee el momento con zona -05:00', () => {
    const ms = leerMomento('2026-10-20T09:15:00-05:00');
    expect(new Date(ms).toISOString()).toBe('2026-10-20T14:15:00.000Z');
    expect(formatearMomento(ms)).toBe('2026-10-20T09:15:00-05:00');
    expect(leerMomento('2026-10-20T14:15:00Z')).toBe(ms);
    expect(leerMomento('2026-10-20T09:15:00')).toBeNaN();
    expect(leerMomento('2026-02-31T09:15:00-05:00')).toBeNaN();
  });
});
