// Tráfico que llega al receptor: los últimos mensajes con su carga y su resultado, y cuentas por
// regla y por tema. Es solo para observar (panel de control): el receptor no lo consulta, así que
// las reglas R1–R8 y los estados no cambian por llevarlo.
import { REGLAS } from './receptor.js';

const MAX_CARGA = 600; // caracteres que se guardan de cada carga (un mensaje válido ocupa ~230)
const MAX_TEMAS = 50; // temas distintos con rechazos de red que se siguen (el broker es público)

export class Trafico {
  constructor({ max = 80 } = {}) {
    this.max = max;
    this.lista = [];
    this.n = 0;
    this.recibidos = 0;
    this.aceptados = 0;
    this.porRegla = Object.fromEntries(REGLAS.map((r) => [r.regla, 0]));
    // Rechazos de R1–R3 por tema. El receptor no se los atribuye a ningún dispensador (no sabe si
    // son suyos), pero que lleguen mensajes falsos al tema de un nodo es algo que hay que ver.
    this.porTema = new Map();
  }

  // origen: 'simulado' | 'envivo' | 'intruso'. Lo sabe la simulación, no el receptor.
  anotar(tema, carga, ms, r, origen) {
    this.recibidos++;
    if (r.aceptado) this.aceptados++;
    else this.porRegla[r.regla] = (this.porRegla[r.regla] ?? 0) + 1;

    const t = String(tema);
    if (!r.aceptado && r.id === null && (this.porTema.has(t) || this.porTema.size < MAX_TEMAS)) {
      const e = this.porTema.get(t) ?? { rechazos: 0 };
      e.rechazos++;
      e.ultimoMs = ms;
      e.regla = r.regla;
      e.detalle = r.detalle;
      this.porTema.set(t, e);
    }

    const texto = String(carga);
    this.lista.push({
      n: ++this.n,
      ms,
      tema: t.slice(0, 200),
      carga: texto.length > MAX_CARGA ? `${texto.slice(0, MAX_CARGA)}…` : texto,
      largo: texto.length,
      aceptado: r.aceptado,
      regla: r.regla ?? null,
      detalle: r.detalle ?? null,
      id: r.id ?? null,
      valor: r.valor ?? null,
      origen,
    });
    if (this.lista.length > this.max) this.lista.splice(0, this.lista.length - this.max);
  }

  rechazosDeTema(tema) {
    return this.porTema.get(tema) ?? null;
  }
}
