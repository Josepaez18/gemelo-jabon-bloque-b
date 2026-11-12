// SHA-256 y HMAC-SHA256 síncronos en JavaScript puro.
// Se usan en lugar de crypto.subtle (que es asíncrono) para que el receptor y la
// comparación de 7 días sean deterministas y rápidos, en el navegador y en las pruebas.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const W = new Uint32Array(64);
const codificador = new TextEncoder();

function comprimir(H, bytes, off) {
  for (let i = 0; i < 16; i++) {
    const j = off + i * 4;
    W[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
  }
  for (let i = 16; i < 64; i++) {
    const w15 = W[i - 15];
    const w2 = W[i - 2];
    const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
    const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0;
    d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  H[0] += a; H[1] += b; H[2] += c; H[3] += d;
  H[4] += e; H[5] += f; H[6] += g; H[7] += h;
}

// Termina un resumen que ya procesó `previos` bytes (múltiplo de 64) con estado H.
function terminar(Hinicial, previos, datos) {
  const H = Hinicial.slice();
  const largo = datos.length;
  const relleno = ((largo + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(relleno);
  buf.set(datos);
  buf[largo] = 0x80;
  const bits = (previos + largo) * 8;
  const vista = new DataView(buf.buffer);
  vista.setUint32(relleno - 8, Math.floor(bits / 0x100000000));
  vista.setUint32(relleno - 4, bits >>> 0);
  for (let off = 0; off < relleno; off += 64) comprimir(H, buf, off);
  return H;
}

function aBytes(H) {
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = H[i] >>> 24;
    out[i * 4 + 1] = (H[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (H[i] >>> 8) & 0xff;
    out[i * 4 + 3] = H[i] & 0xff;
  }
  return out;
}

function aHex(H) {
  let s = '';
  for (let i = 0; i < 8; i++) s += (H[i] >>> 0).toString(16).padStart(8, '0');
  return s;
}

function bytesDe(texto) {
  return typeof texto === 'string' ? codificador.encode(texto) : texto;
}

export function sha256Hex(texto) {
  return aHex(terminar(IV, 0, bytesDe(texto)));
}

// Prepara un HMAC para una clave fija; devuelve una función texto -> hex en minúsculas.
export function crearHmac(clave) {
  let k = bytesDe(clave);
  if (k.length > 64) k = aBytes(terminar(IV, 0, k));
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const b = i < k.length ? k[i] : 0;
    ipad[i] = b ^ 0x36;
    opad[i] = b ^ 0x5c;
  }
  const Hi = IV.slice();
  comprimir(Hi, ipad, 0);
  const Ho = IV.slice();
  comprimir(Ho, opad, 0);
  return (texto) => aHex(terminar(Ho, 64, aBytes(terminar(Hi, 64, bytesDe(texto)))));
}

export function hmacSha256Hex(clave, texto) {
  return crearHmac(clave)(texto);
}

// Comparación en tiempo constante para firmas hexadecimales.
export function igualesSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}
