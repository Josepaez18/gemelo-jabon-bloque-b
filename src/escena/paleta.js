// Colores de la maqueta para el tema claro y el oscuro.
// El cielo tiene tres momentos (día, alba/ocaso y noche); la escena los mezcla según la hora simulada.

export const PALETAS = {
  claro: {
    cielo: {
      dia: { cenit: 0x9fc3e7, horizonte: 0xeaf0f5 },
      alba: { cenit: 0x7486b8, horizonte: 0xf4c9a6 },
      noche: { cenit: 0x0c1528, horizonte: 0x27365a },
    },
    luz: { sol: 2.9, hemi: 1.0, entorno: 0.55, luna: 0.35 },
    // Sin bloom: con luz de día los muros blancos superan cualquier umbral y la imagen se lava.
    brillo: { acento: 0.55, medidor: 1.25, bloom: 0, umbralBloom: 1.0 },
    base: 0xe3e8ed,
    rejilla: 0x8a98ab,
    plataforma: 0xd3dae2,
    cesped: 0xc4d7b2,
    plaza: 0xebe7e0,
    camino: 0xdbd5cb,
    seto: 0x9fbf8f,
    arboles: [0x8fb882, 0x7aab70, 0xa3c68f, 0x6b9f66],
    tronco: 0x8a6d55,
    losa: 0xefece6,
    canto: 0xd4cec4,
    muro: 0xfbfaf7,
    columna: 0xf3f1ec,
    corte: 0x333b4a,
    pasillo: 0xe1e4e8,
    piso: 0xe8d8bd,
    banoM: 0xf6e5e8,
    banoH: 0xe0eaf5,
    loza: 0xffffff,
    meson: 0xc8c0b3,
    madera: 0xcdb08a,
    silla: 0x8d9bb0,
    tabique: 0x8fb2cc,
    metal: 0x8c96a3,
    espejo: 0xbad2e6,
    ducto: 0x8b929d,
    vidrio: 0xdcefff,
    acento: 0x2f7bf6,
    seleccion: 0x2563eb,
  },
  oscuro: {
    cielo: {
      dia: { cenit: 0x14223a, horizonte: 0x2a3b58 },
      alba: { cenit: 0x1b2242, horizonte: 0x5b4153 },
      noche: { cenit: 0x04070e, horizonte: 0x101a2c },
    },
    luz: { sol: 1.7, hemi: 0.75, entorno: 0.32, luna: 0.4 },
    brillo: { acento: 2.4, medidor: 1.35, bloom: 0.7, umbralBloom: 0.72 },
    base: 0x0b111a,
    rejilla: 0x2d6fb3,
    plataforma: 0x131b26,
    cesped: 0x1a2a29,
    plaza: 0x29313c,
    camino: 0x222a34,
    seto: 0x22392f,
    arboles: [0x2f5a44, 0x29503c, 0x3a6650, 0x244736],
    tronco: 0x3c3029,
    losa: 0x3a4453,
    canto: 0x2a323e,
    muro: 0x6f7b8b,
    columna: 0x646f7e,
    corte: 0xc4cfdc,
    pasillo: 0x454f5d,
    piso: 0x5a5041,
    banoM: 0x5b5363,
    banoH: 0x46546a,
    loza: 0xc9d1db,
    meson: 0x6c7482,
    madera: 0x8a7556,
    silla: 0x5f6a7c,
    tabique: 0x5f7690,
    metal: 0x7c8794,
    espejo: 0x5d7a93,
    ducto: 0x252b33,
    vidrio: 0x9fc4ff,
    acento: 0x38bdf8,
    seleccion: 0x60a5fa,
  },
};

// Paleta de estado (fija en ambos temas). Siempre va acompañada de texto en la etiqueta.
const ESTADO = { normal: 0x0ca30c, bajo: 0xfab219, vacio: 0xd03b3b };
export const COLOR_ESTADO = {
  claro: { ...ESTADO, sin_dato: 0x8b93a1, esperando: 0xb3bac6 },
  oscuro: { ...ESTADO, sin_dato: 0x7d8696, esperando: 0x5c6575 },
};

export const COLOR_REVISAR = { claro: 0x7c3aed, oscuro: 0xa78bfa };

// Mensajes MQTT que viajan del dispensador al broker.
export const COLOR_PAQUETE = { aceptado: 0x38bdf8, rechazado: 0xef4444 };
