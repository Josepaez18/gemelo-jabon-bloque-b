// Cielo, sol y luna según la hora simulada (hora de Colombia).
// El sol sale por +x y se pone por -x; de noche queda una luz de luna tenue para que la maqueta se lea.
import * as THREE from 'three';

const AMANECER = 5.4;
const ANOCHECER = 18.2;
const HORA_FIJA = 10.5; // con el ciclo apagado

const suave = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const vertexCielo = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentCielo = /* glsl */ `
  uniform vec3 uCenit;
  uniform vec3 uHorizonte;
  uniform vec3 uSuelo;
  uniform vec3 uSolDir;
  uniform vec3 uSolColor;
  uniform float uSolBrillo;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0
      ? mix(uHorizonte, uCenit, pow(clamp(h, 0.0, 1.0), 0.5))
      : mix(uHorizonte, uSuelo, smoothstep(0.0, 0.2, -h));
    float s = max(dot(d, normalize(uSolDir)), 0.0);
    col += uSolColor * (pow(s, 900.0) * 3.0 + pow(s, 48.0) * 0.45 + pow(s, 5.0) * 0.18) * uSolBrillo;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function estadoSolar(hora) {
  const s = (hora - AMANECER) / (ANOCHECER - AMANECER);
  const alto = Math.sin(Math.PI * s); // > 0 de día
  const az = Math.PI * Math.min(1, Math.max(0, s));
  const dirSol = new THREE.Vector3(Math.cos(az), Math.max(alto, -0.2) * 1.6, 0.45).normalize();
  return { s, alto, dirSol, luzDia: suave(-0.12, 0.3, alto) };
}

export class Cielo {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uCenit: { value: new THREE.Color() },
      uHorizonte: { value: new THREE.Color() },
      uSuelo: { value: new THREE.Color() },
      uSolDir: { value: new THREE.Vector3(0, 1, 0) },
      uSolColor: { value: new THREE.Color(0xffe2b8) },
      uSolBrillo: { value: 1 },
    };
    this.domo = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: vertexCielo,
        fragmentShader: fragmentCielo,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      }),
    );
    this.domo.renderOrder = -10;
    this.domo.frustumCulled = false;
    this.domo.userData.sinAO = true;
    scene.add(this.domo);

    // Estrellas: solo se ven de noche.
    const n = 700;
    const pos = new Float32Array(n * 3);
    let semilla = 9;
    const r = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const u = r() * Math.PI * 2;
      const y = 0.08 + r() * 0.92;
      const rad = Math.sqrt(1 - y * y);
      pos.set([Math.cos(u) * rad * 850, y * 850, Math.sin(u) * rad * 850], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.matEstrellas = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.estrellas = new THREE.Points(geo, this.matEstrellas);
    this.estrellas.frustumCulled = false;
    this.estrellas.renderOrder = -9;
    scene.add(this.estrellas);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb8b2a6, 1);
    scene.add(this.hemi);
    const sol = (this.sol = new THREE.DirectionalLight(0xffffff, 2));
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    const c = sol.shadow.camera;
    c.left = -46;
    c.right = 46;
    c.top = 46;
    c.bottom = -46;
    c.near = 1;
    c.far = 240;
    sol.shadow.bias = -0.0005;
    sol.shadow.normalBias = 0.035;
    sol.shadow.radius = 3;
    sol.target.position.set(0, 10, 0);
    scene.add(sol, sol.target);

    scene.fog = new THREE.Fog(0xffffff, 170, 720);

    this.cDia = new THREE.Color();
    this.cAlba = new THREE.Color();
    this.cNoche = new THREE.Color();
    this.tmp = new THREE.Color();
    this.calido = new THREE.Color(0xffb27a);
    this.blanco = new THREE.Color(0xfff4e4);
    this.colorLuna = new THREE.Color(0x9db4ff);
    this.dirLuna = new THREE.Vector3(-0.45, 1.0, 0.6).normalize();
    this.dir = new THREE.Vector3();
  }

  // Mezcla los tres cielos de la paleta para una altura del sol.
  mezclar(destino, clave, cielo, alto) {
    this.cDia.setHex(cielo.dia[clave]);
    this.cAlba.setHex(cielo.alba[clave]);
    this.cNoche.setHex(cielo.noche[clave]);
    if (alto < 0) destino.copy(this.cNoche).lerp(this.cAlba, suave(-0.3, 0.02, alto));
    else destino.copy(this.cAlba).lerp(this.cDia, suave(0.0, 0.4, alto));
    return destino;
  }

  // hora: hora local decimal; ciclo: si sigue la hora simulada. Devuelve { luzDia, noche }.
  actualizar(hora, ciclo, paleta, camara) {
    const e = estadoSolar(ciclo ? hora : HORA_FIJA);
    const u = this.uniforms;
    this.mezclar(u.uCenit.value, 'cenit', paleta.cielo, e.alto);
    this.mezclar(u.uHorizonte.value, 'horizonte', paleta.cielo, e.alto);
    u.uSuelo.value.setHex(paleta.base).lerp(u.uHorizonte.value, 0.35);
    u.uSolDir.value.copy(e.dirSol);
    u.uSolColor.value.copy(this.calido).lerp(this.blanco, suave(0.05, 0.5, e.alto));
    u.uSolBrillo.value = suave(-0.15, 0.05, e.alto);
    this.scene.fog.color.copy(u.uHorizonte.value);
    this.matEstrellas.opacity = (1 - suave(-0.25, 0.05, e.alto)) * 0.85;
    this.domo.position.copy(camara.position);
    this.estrellas.position.copy(camara.position);

    const L = paleta.luz;
    const k = e.luzDia;
    this.dir.copy(this.dirLuna).lerp(e.dirSol, suave(-0.1, 0.12, e.alto)).normalize();
    this.dir.y = Math.max(this.dir.y, 0.32);
    this.dir.normalize();
    this.sol.position.copy(this.sol.target.position).addScaledVector(this.dir, 110);
    this.sol.color.copy(this.colorLuna).lerp(u.uSolColor.value, k);
    this.sol.intensity = L.luna + (L.sol - L.luna) * k;
    this.hemi.color.copy(u.uCenit.value).lerp(this.tmp.setHex(0xffffff), 0.55);
    this.hemi.groundColor.setHex(paleta.cesped).multiplyScalar(0.7);
    this.hemi.intensity = L.hemi * (0.35 + 0.65 * k);
    this.scene.environmentIntensity = L.entorno * (0.25 + 0.75 * k);
    return { luzDia: k, noche: 1 - k, horizonte: u.uHorizonte.value };
  }
}
