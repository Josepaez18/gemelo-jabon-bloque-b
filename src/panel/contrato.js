// Vista "Contrato del dato": lo que el ESP32 y el receptor acuerdan, en dos capas.
//   Red:     cómo viaja el mensaje y cómo se prueba que es auténtico (R1–R3).
//   Negocio: qué significa el valor y qué se decide con él (R4–R8, estados, lista de aseo).
// Además, el contrato del canal gemelo ↔ panel y un probador para ver cada regla en acción.
// Todo sale de las constantes del código (contrato.js, receptor.js, supuestos.js), no de textos aparte.
import { SUPUESTOS } from '../config/supuestos.js';
import { CAMPOS, ESQUEMA, VECTOR_PRUEBA, armarMensaje, clavePrueba, firmar, formatearMomento, temaDe, textoAFirmar } from '../modelo/contrato.js';
import { DISPENSADORES, IDS, infoDispensador } from '../modelo/edificio.js';
import { CADA_MS, CANAL, MENSAJES_CANAL, VENCE_MS, VERSION_CANAL } from '../modelo/panel.js';
import { REGLAS, Receptor } from '../modelo/receptor.js';
import { esc, hace, hora } from '../interfaz/formato.js';
import { $, R, bytes, efectoHtml, leerJson, poner, reglasHtml } from './comun.js';

const D = SUPUESTOS.dispositivo;
const EV = SUPUESTOS.envivo;
const dur = (s) => (s >= 120 ? `${s / 60} min` : `${s} s`);
const opcionesNodo = (sel) => DISPENSADORES.map((d) => `<option value="${d.id}"${d.id === sel ? ' selected' : ''}>${d.corto} · ${d.nombre}</option>`).join('');

// Mensajes de prueba: cada uno rompe una regla a propósito (o ninguna).
const CASOS = [
  { clave: 'valido', nombre: 'Válido', espera: 'aceptado' },
  { clave: 'noJson', nombre: 'No es JSON', espera: 'R1' },
  { clave: 'sinFirma', nombre: 'Sin firma', espera: 'R2' },
  { clave: 'decimal', nombre: 'valor 64.0', espera: 'R2' },
  { clave: 'alterado', nombre: 'Cambiado tras firmar', espera: 'R3' },
  { clave: 'otraClave', nombre: 'Clave inventada', espera: 'R3' },
  { clave: 'unidad', nombre: 'Unidad «ml»', espera: 'R4' },
  { clave: 'viejo', nombre: 'Hora de hace 20 min', espera: 'R5' },
  { clave: 'imposible', nombre: 'Valor 116', espera: 'R6' },
  { clave: 'sube', nombre: 'Sube sin recarga', espera: 'R7' },
  { clave: 'cae', nombre: 'Cae a 0', espera: 'R8' },
];

function armarCaso(clave, id, ref, ultimo) {
  const base = { id, valor: ultimo ?? 50, momento: formatearMomento(ref, SUPUESTOS.zonaHorariaMin) };
  const json = (o) => JSON.stringify(o);
  switch (clave) {
    case 'noJson':
      return armarMensaje(base).slice(0, 60);
    case 'sinFirma': {
      const o = JSON.parse(armarMensaje(base));
      delete o.firma;
      return json(o);
    }
    case 'decimal':
      return armarMensaje(base).replace(/"valor":(-?\d+)/, '"valor":$1.0');
    case 'alterado': {
      const o = JSON.parse(armarMensaje(base));
      o.valor = base.valor >= 50 ? base.valor - 20 : base.valor + 20;
      return json(o);
    }
    case 'otraClave':
      return armarMensaje({ ...base, clave: SUPUESTOS.fallas.avisoFalsoClave });
    case 'unidad':
      return armarMensaje({ ...base, unidad: 'ml' });
    case 'viejo':
      return armarMensaje({ ...base, momento: formatearMomento(ref - 20 * 60000, SUPUESTOS.zonaHorariaMin) });
    case 'imposible':
      return armarMensaje({ ...base, valor: 116 });
    case 'sube':
      return armarMensaje({ ...base, valor: Math.min(100, base.valor + 12) });
    case 'cae':
      return armarMensaje({ ...base, valor: 0 });
    default:
      return armarMensaje(base);
  }
}

// Valida con un receptor aparte (el del gemelo no se entera). Para que R5, R7 y R8 tengan con
// qué comparar, antes recibe un mensaje válido con el último valor del nodo, un minuto antes.
export function probarMensaje(tema, carga, { refMs, ultimos }) {
  const rx = new Receptor({ ids: IDS, ahoraMs: refMs - 120000, registrar: false });
  for (const [id, valor] of Object.entries(ultimos)) {
    if (valor === null) continue;
    const previo = refMs - 60000;
    rx.procesar(temaDe(id, R.temaBase), armarMensaje({ id, valor, momento: formatearMomento(previo, SUPUESTOS.zonaHorariaMin) }), previo);
  }
  return rx.procesar(tema, carga, refMs);
}

export class VistaContrato {
  constructor() {
    this.raiz = $('#p-contrato');
    this.ejemplo = EV.idEnVivo;
    this.prueba = { id: EV.idEnVivo, refMs: null, ultimos: {}, caso: 'valido' };
    this.armar();
  }

  armar() {
    const reglas = (capa) =>
      REGLAS.filter((x) => x.capa === capa)
        .map((x) => `<tr><th scope="row">${x.regla}</th><td>${esc(x.comprueba(R))}</td></tr>`)
        .join('');
    const host = new URL(EV.url.replace(/^wss?:/, 'https:')).hostname;
    const v = VECTOR_PRUEBA;
    const vectorOk = firmar(v.campos) === v.firma;

    this.raiz.innerHTML = `
      <section class="pc-tarjeta pc-intro">
        <h2>Qué es el contrato del dato</h2>
        <p>Es lo que el nodo (ESP32) y el receptor acuerdan para que un número viaje por la red y se pueda confiar en él. Tiene dos capas:</p>
        <div class="pc-capas">
          <div data-capa="red"><b>Red</b><span>Cómo viaja el mensaje y cómo se prueba que es de quien dice ser. Reglas R1–R3. Si falla, el mensaje <b>no se atribuye</b> a ningún dispensador.</span></div>
          <div data-capa="negocio"><b>Negocio</b><span>Qué significa el valor y qué se decide con él. Reglas R4–R8, estados y lista de aseo. Si falla, el nodo sigue vivo pero <b>pasa a revisar</b>.</span></div>
        </div>
        <p class="pc-indice">Ir a: <a href="#c-red">Contrato de red</a> · <a href="#c-negocio">Contrato de negocio</a> · <a href="#c-probar">Probar un mensaje</a> · <a href="#c-canal">Gemelo ↔ panel</a></p>
      </section>

      <section class="pc-tarjeta" id="c-red" aria-labelledby="h-c-red">
        <h2 id="h-c-red"><span class="pc-capa-tag" data-capa="red">red</span>Contrato de red · cómo viaja el dato</h2>
        <div class="pc-dos">
          <div>
            <h3>Transporte</h3>
            <table class="pc-ficha"><tbody>
              <tr><th scope="row">Protocolo</th><td>MQTT 3.1.1, publicar / suscribirse</td></tr>
              <tr><th scope="row">Broker</th><td><code>${esc(host)}</code> (público)</td></tr>
              <tr><th scope="row">El ESP32 publica</th><td>por TCP, puerto 1883, en su propio tema</td></tr>
              <tr><th scope="row">El gemelo escucha</th><td><code>${esc(EV.url)}</code>, suscrito a <code>${esc(EV.suscripcion)}</code>. <b>Solo escucha: nunca publica.</b></td></tr>
              <tr><th scope="row">Tema</th><td><code>${esc(R.temaBase)}/&lt;id&gt;</code>, uno por dispensador (p. ej. <code>${esc(temaDe(EV.idEnVivo, R.temaBase))}</code>)</td></tr>
              <tr><th scope="row">Calidad</th><td>QoS 0 (a lo sumo una vez), sin <i>retain</i>: si un mensaje se pierde, el siguiente latido lo reemplaza</td></tr>
              <tr><th scope="row">Carga</th><td>JSON UTF-8 compacto, 7 campos en orden fijo, unos ${bytes(armarMensaje({ id: EV.idEnVivo, valor: 100, momento: v.campos.momento }))} bytes</td></tr>
              <tr><th scope="row">Cuándo publica</th><td>si el nivel cambia ${D.cambioMinimo} puntos o más, y un latido cada ${dur(D.latidoS)} (${dur(D.latidoBajoS)} bajo ${D.umbralLatidoBajo} %). El ESP32 de Wokwi late cada 10 s (5 s bajo 30 %) y nunca envía dos veces en 2 s</td></tr>
              <tr><th scope="row">Hora</th><td>por NTP, con zona <code>-05:00</code>; sin hora no envía, porque el contrato exige <code>momento</code></td></tr>
            </tbody></table>
          </div>
          <div>
            <h3>Firma (autenticidad)</h3>
            <table class="pc-ficha"><tbody>
              <tr><th scope="row">Algoritmo</th><td>HMAC-SHA256, en hexadecimal (64 caracteres)</td></tr>
              <tr><th scope="row">Texto que se firma</th><td><code>${CAMPOS.filter((c) => c !== 'firma').join('|')}</code>, los valores separados por <code>|</code></td></tr>
              <tr><th scope="row">Clave</th><td>una por dispensador: <code>${esc(clavePrueba('<id>'))}</code> (de prueba; en producción iría en un almacén seguro)</td></tr>
              <tr><th scope="row">Vector de prueba</th><td><code>${esc(textoAFirmar(v.campos))}</code> → <code class="pc-partir">${v.firma}</code>
                <span class="pc-res" data-r="${vectorOk ? 'ok' : 'falla'}">${vectorOk ? '✓ este navegador lo calcula igual' : '✕ este navegador da otra firma'}</span></td></tr>
            </tbody></table>
            <h3>Reglas de red</h3>
            <table class="pc-ficha pc-reglas-tabla"><tbody>${reglas('red')}</tbody></table>
            <p class="pc-tenue">Si falla R1, R2 o R3, el mensaje no se atribuye a ningún dispensador y no cuenta como señal de vida: un intruso no puede mantener «vivo» un nodo caído ni cambiar su nivel.</p>
          </div>
        </div>

        <h3>Campos del mensaje (versión 1)</h3>
        <table class="pc-campos pc-esquema">
          <thead><tr><th>#</th><th>Campo</th><th>Tipo</th><th>Lo valida</th><th>Qué es</th></tr></thead>
          <tbody>${ESQUEMA.map((c, i) => `<tr><td>${i + 1}</td><th scope="row"><code>${c.campo}</code></th><td>${esc(c.tipo)}</td><td>${c.reglas}</td><td>${esc(c.descripcion)}</td></tr>`).join('')}</tbody>
        </table>

        <div class="pc-ejemplo">
          <div class="pc-tarjeta-cab">
            <h3>Un mensaje real, recién llegado</h3>
            <label class="pc-campo"><span>Nodo</span><select id="c-ej-nodo">${opcionesNodo(this.ejemplo)}</select></label>
          </div>
          <div id="c-ej"></div>
        </div>
      </section>

      <section class="pc-tarjeta" id="c-negocio" aria-labelledby="h-c-negocio">
        <h2 id="h-c-negocio"><span class="pc-capa-tag" data-capa="negocio">negocio</span>Contrato de negocio · qué significa el dato</h2>
        <div class="pc-dos">
          <div>
            <h3>El valor</h3>
            <table class="pc-ficha"><tbody>
              <tr><th scope="row">Variable</th><td><code>nivel_jabon</code>: cuánto jabón queda en el dispensador</td></tr>
              <tr><th scope="row">Unidad</th><td><code>%</code> del volumen útil (${SUPUESTOS.jabon.capacidadMl} ml), entero de 0 a 100</td></tr>
              <tr><th scope="row">Cómo se mide</th><td>HC-SR04 en la tapa: ${D.dLlenoCm} cm = 100 %, ${D.dVacioCm} cm = 0 %; se absorben ${D.toleranciaPuntos} puntos de error y lo que quede fuera se envía igual, para que R6 lo rechace</td></tr>
              <tr><th scope="row">Para aseo vale</th><td>el <b>último valor válido</b>. Un rechazo nunca borra el nivel conocido</td></tr>
            </tbody></table>
            <h3>Reglas de negocio</h3>
            <table class="pc-ficha pc-reglas-tabla"><tbody>${reglas('negocio')}</tbody></table>
            <p class="pc-tenue">Si falla de R4 a R8, el mensaje sí es auténtico: el dispensador sigue vivo, pasa a «revisar» y para aseo vale su último valor válido.</p>
          </div>
          <div>
            <h3>Estados del nodo</h3>
            <table class="pc-ficha pc-estados"><tbody>
              <tr><th scope="row"><span class="pc-chip" data-estado="normal">normal</span></th><td>${R.umbralBajo} % o más</td></tr>
              <tr><th scope="row"><span class="pc-chip" data-estado="bajo">bajo</span></th><td>de ${R.umbralVacio} a ${R.umbralBajo - 1} %: recargar</td></tr>
              <tr><th scope="row"><span class="pc-chip" data-estado="vacio">vacío</span></th><td>menos de ${R.umbralVacio} %: recargar primero</td></tr>
              <tr><th scope="row"><span class="pc-chip" data-estado="sin_dato">sin dato</span></th><td>${R.latidosSinDato} latidos sin mensajes auténticos: ${dur(R.latidosSinDato * D.latidoS)} (${dur(R.latidosSinDato * D.latidoBajoS)} si estaba bajo ${D.umbralLatidoBajo} %); en vivo, ${dur(R.envivo.sinDatoS)}. <b>Nunca se toma como 0 %.</b></td></tr>
              <tr><th scope="row"><span class="pc-chip" data-estado="esperando">esperando</span></th><td>todavía no llega el primer mensaje</td></tr>
              <tr><th scope="row"><span class="pc-chip" data-estado="revisar">revisar</span></th><td>se suma a los anteriores cuando un mensaje auténtico falla R4–R8; se quita al marcarlo revisado</td></tr>
            </tbody></table>
            <h3>Decisiones</h3>
            <ol class="pc-pasos">
              <li><b>Recargar:</b> los bajos y vacíos, de menor a mayor nivel.</li>
              <li><b>Revisar:</b> los que tienen un dato rechazado por R4–R8.</li>
              <li><b>Sin dato:</b> los que dejaron de enviar; se va a ver qué pasa.</li>
              <li><b>Recarga confirmada:</b> aseo avisa antes de recargar y durante ${dur(R.confirmacionRecargaS)} (${dur(R.envivo.confirmacionRecargaS)} en vivo) R7 acepta la subida. Termina cuando el nivel vuelve a bajar o se vence.</li>
            </ol>
          </div>
        </div>
      </section>

      <section class="pc-tarjeta" id="c-probar" aria-labelledby="h-c-probar">
        <h2 id="h-c-probar">Probar un mensaje</h2>
        <p>Arma un mensaje (o rompe uno a propósito) y mira qué regla lo detiene. Se valida con un receptor aparte que parte del último valor válido de cada nodo y de la hora del gemelo al armarlo: <b>el gemelo no se entera</b>. El probador firma como lo haría el ESP32, con la clave de prueba.</p>
        <div class="pc-filtros">
          <label class="pc-campo"><span>Nodo</span><select id="pr-nodo">${opcionesNodo(this.prueba.id)}</select></label>
          <label class="pc-campo pc-campo-ancho"><span>Tema</span><input id="pr-tema" type="text" spellcheck="false" autocomplete="off" /></label>
        </div>
        <div class="pc-casos" id="pr-casos" role="group" aria-label="Mensajes de prueba">
          ${CASOS.map((c) => `<button type="button" class="pc-btn" data-caso="${c.clave}" aria-pressed="${c.clave === 'valido'}">${esc(c.nombre)}<small>${c.espera === 'aceptado' ? '✓' : c.espera}</small></button>`).join('')}
        </div>
        <label class="pc-campo pc-campo-bloque"><span>Carga (JSON). Puedes editarla: se valida mientras escribes.</span>
          <textarea id="pr-carga" rows="4" spellcheck="false" autocomplete="off"></textarea></label>
        <p class="pc-tenue" id="pr-ref"></p>
        <div id="pr-resultado" aria-live="polite"></div>
      </section>

      <section class="pc-tarjeta" id="c-canal" aria-labelledby="h-c-canal">
        <h2 id="h-c-canal">Contrato gemelo ↔ panel</h2>
        <p>El gemelo y este panel son dos pestañas del mismo navegador. Se hablan por <b>BroadcastChannel</b> (no pasa por la red): el gemelo simula y valida; el panel solo dibuja lo que recibe.</p>
        <table class="pc-ficha"><tbody>
          <tr><th scope="row">Canal</th><td><code>${CANAL}</code>, versión <code>${VERSION_CANAL}</code> (si no coincide, el panel avisa y pide recargar)</td></tr>
          <tr><th scope="row">Ritmo</th><td>una foto cada ${CADA_MS} ms, también con la pestaña del gemelo oculta (un Web Worker marca el paso)</td></tr>
          <tr><th scope="row">Caducidad</th><td>${VENCE_MS / 1000} s sin fotos: el panel da el gemelo por cerrado y corre su propia simulación a ×60</td></tr>
          <tr><th scope="row">Varios gemelos</th><td>cada uno manda su <code>origen</code>; el panel sigue mostrando el primero mientras publique</td></tr>
        </tbody></table>
        <table class="pc-campos">
          <thead><tr><th>Mensaje</th><th>Sentido</th><th>Cuándo</th><th>Campos</th></tr></thead>
          <tbody>${MENSAJES_CANAL.map((m) => `<tr><th scope="row"><code>${m.tipo}</code></th><td>${m.sentido}</td><td>${esc(m.cuando)}</td><td><code>${m.campos}</code></td></tr>`).join('')}</tbody>
        </table>
        <p><code>foto</code> trae: <code>ms</code>, <code>velocidad</code>, <code>estrategia</code>, <code>envivo</code>, <code>nodos[12]</code> (estado, último valor válido, 4 comprobaciones, último JSON), <code>resumen</code>, <code>red</code> (cuentas por capa y por regla), <code>aseo</code>, <code>eventos</code> y <code>trafico</code> (últimos mensajes con su carga).</p>
        <details class="pc-foto" id="c-foto">
          <summary>Ver la última foto en JSON (recortada)</summary>
          <div class="pc-tarjeta-cab"><span class="pc-tenue" id="c-foto-info"></span><button type="button" class="pc-btn" id="c-foto-act">Actualizar</button></div>
          <pre class="pc-json" id="c-foto-json"></pre>
        </details>
      </section>`;

    $('#c-ej-nodo').addEventListener('change', (ev) => {
      this.ejemplo = ev.target.value;
      this.pintarEjemplo();
    });
    $('#pr-nodo').addEventListener('change', (ev) => {
      this.prueba.id = ev.target.value;
      this.armarPrueba(this.prueba.caso);
    });
    $('#pr-casos').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-caso]');
      if (b) this.armarPrueba(b.dataset.caso);
    });
    $('#pr-carga').addEventListener('input', () => this.validarPrueba(true));
    $('#pr-tema').addEventListener('input', () => this.validarPrueba(true));
    $('#c-foto').addEventListener('toggle', () => this.pintarFoto());
    $('#c-foto-act').addEventListener('click', () => this.pintarFoto());
  }

  pintar(f) {
    this.f = f;
    this.pintarEjemplo();
    if (this.prueba.refMs === null) this.armarPrueba('valido');
  }

  pintarEjemplo() {
    const f = this.f;
    if (!f) return;
    const n = f.nodos.find((x) => x.id === this.ejemplo);
    const datos = n?.ultimaCarga ? leerJson(n.ultimaCarga) : null;
    if (!n?.ultimaCarga) {
      poner($('#c-ej'), `<p class="pc-tenue">${infoDispensador(this.ejemplo).corto} todavía no envía ningún mensaje auténtico.</p>`);
      return;
    }
    const campos = datos ? CAMPOS.map((c) => `  "${c}": ${esc(JSON.stringify(datos[c]))}`).join(',\n') : '';
    poner(
      $('#c-ej'),
      `<p class="pc-tenue">Llegó ${hace(n.ultimoAutenticoMs, f.ms)} (${hora(n.ultimoAutenticoMs)}) por <code>${esc(n.tema)}</code>${n.origen === 'envivo' ? ', desde el ESP32 de Wokwi' : ''}.</p>
      <div class="pc-dos">
        <div><b class="pc-mini">Como viaja (${bytes(n.ultimaCarga)} bytes)</b><code class="pc-json">${esc(n.ultimaCarga)}</code></div>
        <div><b class="pc-mini">Campo por campo</b><pre class="pc-json">{\n${campos}\n}</pre></div>
      </div>
      ${datos ? `<p><b class="pc-mini">Texto que se firmó</b> <code class="pc-partir">${esc(textoAFirmar(datos))}</code></p>` : ''}`,
    );
  }

  // --- Probador ------------------------------------------------------------------

  armarPrueba(caso) {
    const f = this.f;
    if (!f) return;
    const p = this.prueba;
    p.caso = caso;
    p.refMs = f.ms;
    p.ultimos = Object.fromEntries(f.nodos.map((n) => [n.id, n.valor]));
    for (const b of $('#pr-casos').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.caso === caso));
    $('#pr-tema').value = temaDe(p.id, R.temaBase);
    $('#pr-carga').value = armarCaso(caso, p.id, p.refMs, p.ultimos[p.id]);
    const ultimo = p.ultimos[p.id];
    poner(
      $('#pr-ref'),
      `Hora del receptor de prueba: ${hora(p.refMs)} (la del gemelo al armar el mensaje). Último valor válido de ${infoDispensador(p.id).corto}: ${ultimo === null ? 'ninguno todavía' : `${ultimo} %`}.`,
    );
    this.validarPrueba(false);
  }

  validarPrueba(editado) {
    const p = this.prueba;
    if (p.refMs === null) return;
    if (editado) for (const b of $('#pr-casos').querySelectorAll('button')) b.setAttribute('aria-pressed', 'false');
    const tema = $('#pr-tema').value.trim();
    const carga = $('#pr-carga').value;
    const r = probarMensaje(tema, carga, p);
    const caso = CASOS.find((c) => c.clave === p.caso);
    const esperado = !editado && caso && caso.espera !== (r.aceptado ? 'aceptado' : r.regla) ? `<p class="pc-tenue">Con el valor actual de este nodo, este caso no llega a romper ${caso.espera}: prueba con otro nodo o edita el valor.</p>` : '';
    poner($('#pr-resultado'), `${efectoHtml(r, tema)}${esperado}${reglasHtml(r)}`);
  }

  // --- Foto en JSON -----------------------------------------------------------------

  pintarFoto() {
    const det = $('#c-foto');
    if (!det.open || !this.f) return;
    const f = this.f;
    const recorte = {
      ...f,
      nodos: [f.nodos[0], `… y ${f.nodos.length - 1} nodos más con la misma forma`],
      eventos: [...f.eventos.slice(0, 2), `… ${Math.max(0, f.eventos.length - 2)} más`],
      trafico: [...f.trafico.slice(-2), `… ${Math.max(0, f.trafico.length - 2)} más`],
    };
    $('#c-foto-info').textContent = `Foto de las ${hora(f.ms)} · ${new TextEncoder().encode(JSON.stringify(f)).length.toLocaleString('es-CO')} bytes completa`;
    $('#c-foto-json').textContent = JSON.stringify(recorte, null, 2);
  }
}
