// Post-procesado con calidad adaptable:
//   alta  → oclusión ambiental (GTAO) + bloom (solo tema oscuro) + MSAA
//   media → bloom a media resolución, sin MSAA (para gráficas integradas)
//   baja  → render directo, sin efectos
// Si los cuadros tardan demasiado, baja un nivel solo y lo recuerda para esa gráfica.
// `?calidad=alta|media|baja` en la URL lo fija; `?calidad=auto` olvida lo recordado y vuelve a medir.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Viñeta suave: oscurece las esquinas como un lente de cámara.
const Vineta = {
  uniforms: { tDiffuse: { value: null }, uFuerza: { value: 0.25 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uFuerza;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = length((vUv - 0.5) * vec2(1.15, 1.0));
      c.rgb *= 1.0 - uFuerza * smoothstep(0.35, 0.85, d);
      gl_FragColor = c;
    }
  `,
};

export const NIVELES = ['alta', 'media', 'baja'];
// Mediana por cuadro que se tolera antes de bajar. De media a baja hay más margen:
// un primer plano puede rondar los 25 cuadros/s y no vale perder el brillo por eso.
const LIMITE_MS = { alta: 32, media: 48 };
const CLAVE = 'gemelo-calidad';
const VENTANA_S = 2.5;

export function calidadPedida() {
  try {
    const q = new URLSearchParams(location.search).get('calidad');
    if (q === 'auto') localStorage.removeItem(CLAVE);
    return NIVELES.includes(q) ? q : null;
  } catch {
    return null;
  }
}

function nombreGrafica(gl) {
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  return gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
}

// Nivel que ya se midió en esta gráfica: así no se empieza a tirones en cada carga.
export function calidadGuardada(renderer) {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE));
    return g?.grafica === nombreGrafica(renderer.getContext()) && NIVELES.includes(g.nivel) ? g.nivel : null;
  } catch {
    return null;
  }
}

export class Postproceso {
  constructor(renderer, scene, camara, { nivel = null, inicial = 'alta', alCambiar } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camara = camara;
    this.alCambiar = alCambiar;
    this.adaptativo = !nivel;
    this.nivel = nivel ?? inicial;
    this.bloomCfg = { fuerza: 0.4, umbral: 1, radio: 0.55 };
    this.fuerzaVineta = 0.25;
    this.ocultos = [];
    this.reiniciarMedida(2);
    // Al volver a la pestaña el primer cuadro llega tarde: no cuenta.
    document.addEventListener('visibilitychange', () => this.reiniciarMedida(1));
    this.construir();
  }

  reiniciarMedida(espera) {
    this.espera = espera;
    this.suma = 0;
    this.cuadros = [];
  }

  construir() {
    this.composer?.renderTarget1.dispose();
    this.composer?.renderTarget2.dispose();
    this.composer?.passes.forEach((p) => p.dispose?.());
    this.composer = null;
    this.bloom = null;
    this.vineta = null;
    if (this.nivel === 'baja') return;
    try {
      const r = this.renderer;
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.nivel === 'alta' ? 4 : 0 });
      const c = new EffectComposer(r, rt);
      c.addPass(new RenderPass(this.scene, this.camara));
      if (this.nivel === 'alta') c.addPass(this.crearAO());
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.bloomCfg.fuerza, this.bloomCfg.radio, this.bloomCfg.umbral);
      this.bloom.enabled = this.bloomCfg.fuerza > 0;
      if (this.nivel !== 'alta') {
        // El resplandor es borroso por naturaleza: a media resolución se ve igual y cuesta un cuarto.
        const setSize = this.bloom.setSize.bind(this.bloom);
        this.bloom.setSize = (w, h) => setSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
      }
      c.addPass(this.bloom);
      c.addPass(new OutputPass());
      this.vineta = new ShaderPass(Vineta);
      this.vineta.uniforms.uFuerza.value = this.fuerzaVineta;
      c.addPass(this.vineta);
      this.composer = c;
      const t = r.getSize(new THREE.Vector2());
      c.setPixelRatio(r.getPixelRatio());
      c.setSize(t.x, t.y);
    } catch (err) {
      console.warn('Sin post-procesado:', err);
      this.nivel = 'baja';
      this.composer = null;
    }
  }

  crearAO() {
    const ao = new GTAOPass(this.scene, this.camara, 1, 1);
    ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.3, thickness: 1.4, scale: 1.15, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    ao.blendIntensity = 0.85;
    // A media resolución: casi igual de bonito y cuatro veces más barato.
    const setSize = ao.setSize.bind(ao);
    ao.setSize = (w, h) => setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    // El vidrio, el cielo y las partículas no deben oscurecer lo que hay detrás.
    const render = ao.render.bind(ao);
    ao.render = (...args) => {
      this.ocultarSinAO();
      try {
        render(...args);
      } finally {
        this.restaurar();
      }
    };
    return ao;
  }

  ocultarSinAO() {
    const lista = this.ocultos;
    this.scene.traverseVisible((o) => {
      if (o.userData.sinAO || (o.isMesh && !Array.isArray(o.material) && o.material.transparent)) lista.push(o);
    });
    for (const o of lista) o.visible = false;
  }

  restaurar() {
    for (const o of this.ocultos) o.visible = true;
    this.ocultos.length = 0;
  }

  setBloom(fuerza, umbral) {
    this.bloomCfg.fuerza = fuerza;
    this.bloomCfg.umbral = umbral;
    if (this.bloom) {
      this.bloom.strength = fuerza;
      this.bloom.threshold = umbral;
      this.bloom.enabled = fuerza > 0;
    }
  }

  setVineta(fuerza) {
    this.fuerzaVineta = fuerza;
    if (this.vineta) this.vineta.uniforms.uFuerza.value = fuerza;
  }

  setSize(w, h) {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(dt) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camara);
  }

  // ms: duración real del último cuadro.
  medir(ms) {
    if (!this.adaptativo || this.nivel === 'baja' || ms > 5000) return;
    if (this.espera > 0) {
      this.espera -= ms / 1000;
      return;
    }
    this.suma += ms;
    this.cuadros.push(ms);
    if (this.suma < VENTANA_S * 1000) return;
    // La mediana no se deja engañar por un tirón aislado.
    const orden = this.cuadros.sort((a, b) => a - b);
    const mediana = orden[Math.floor(orden.length / 2)];
    this.reiniciarMedida(1);
    if (mediana > LIMITE_MS[this.nivel]) this.bajar();
  }

  bajar() {
    const i = NIVELES.indexOf(this.nivel);
    if (i >= NIVELES.length - 1) return;
    this.nivel = NIVELES[i + 1];
    console.info(`Calidad 3D: ${this.nivel}`);
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ grafica: nombreGrafica(this.renderer.getContext()), nivel: this.nivel }));
    } catch {
      // Sin almacenamiento (modo privado): se vuelve a medir en cada carga.
    }
    this.alCambiar?.(this.nivel);
    this.construir();
  }
}
