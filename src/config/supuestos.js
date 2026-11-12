// Supuestos del gemelo digital. Todo lo que se puede discutir o calibrar vive aquí.
// La interfaz los muestra en la pestaña "Supuestos". Cambia un valor, guarda y recarga la página.

export const SUPUESTOS = {
  semilla: 20261020,
  // Lunes 19 de octubre de 2026, 06:00 hora de Colombia.
  inicio: '2026-10-19T06:00:00-05:00',
  zonaHorariaMin: -300, // -05:00

  jabon: {
    mlPorUso: 0.9,
    capacidadMl: 1000,
    nivelInicialMin: 45, // % al empezar la simulación (al azar entre min y max)
    nivelInicialMax: 100,
  },

  // Afluencia: usos por hora en UN baño del piso 1 en la hora pico de un día entre semana.
  afluencia: {
    usosHoraPico: 120,
    // Fracción de la hora pico para cada hora (hora local). Las horas que no aparecen valen 0.
    perfilHora: {
      6: 0.15, 7: 0.45, 8: 0.6, 9: 0.75, 10: 1.0, 11: 0.8,
      12: 1.0, 13: 0.9, 14: 0.6, 15: 0.55, 16: 0.55, 17: 0.5,
      18: 0.6, 19: 0.45, 20: 0.3, 21: 0.15,
    },
    // Factor por piso (índice 0 = piso 1). El piso 1 es el más concurrido.
    factorPiso: [1.0, 0.75, 0.65, 0.55, 0.5, 0.4],
  },

  // Horario por día de la semana (0 = domingo … 6 = sábado).
  horario: {
    abre: 6,
    cierra: 22,
    dias: {
      0: { abierto: false, factor: 0, nombre: 'domingo' },
      1: { abierto: true, factor: 1, nombre: 'lunes' },
      2: { abierto: true, factor: 1, nombre: 'martes' },
      3: { abierto: true, factor: 1, nombre: 'miércoles' },
      4: { abierto: true, factor: 1, nombre: 'jueves' },
      5: { abierto: true, factor: 1, nombre: 'viernes' },
      6: { abierto: true, factor: 0.3, nombre: 'sábado' },
    },
  },

  // ESP32 + HC-SR04 (igual que el sketch de Wokwi).
  dispositivo: {
    dLlenoCm: 4,
    dVacioCm: 20,
    toleranciaPuntos: 3,
    cambioMinimo: 2,
    latidoS: 300,
    latidoBajoS: 30,
    umbralLatidoBajo: 30,
    lecturaCadaS: 10, // paso de la simulación
    ruidoCm: 0.02, // desviación estándar del ruido del sensor (Wokwi no tiene ruido)
  },

  // Cómo se comportan las fallas simulables.
  fallas: {
    espumaCm: 2, // la espuma acerca el eco: la lectura sube ~12 puntos
    obstruccionCm: 1.5, // algo tapa el sensor: lectura imposible (~116 %)
    avisoFalsoCadaS: 900, // un intruso envía un aviso firmado con clave inventada
    avisoFalsoClave: 'clave-inventada',
  },

  receptor: {
    temaBase: 'ucc7788/jabon',
    futuroMaxS: 60,
    edadMaxS: 900,
    subidaMaxPuntos: 5,
    umbralCaidaR8: 10,
    umbralBajo: 30,
    umbralVacio: 5,
    latidosSinDato: 3,
    confirmacionRecargaS: 600,
    // Tiempos de la demo con Wokwi (solo para el dispensador en vivo).
    envivo: {
      sinDatoS: 45,
      confirmacionRecargaS: 120,
    },
  },

  aseo: {
    personas: 1,
    velocidadMS: 1.2,
    esperaAscensorS: 25,
    ascensorSPorPiso: 4,
    recargaS: 180,
    revisionS: 45,
    umbralRecarga: 30, // en las rondas solo recarga si el nivel real está por debajo
    reVisitaMin: 60, // con sensores: no vuelve al mismo baño antes de este tiempo
    rondasCada4h: [6, 10, 14, 18],
    rondas2AlDia: [6, 14],
  },

  envivo: {
    url: 'wss://broker.hivemq.com:8884/mqtt',
    suscripcion: 'ucc7788/jabon/#',
    idEnVivo: 'bano-bloque-b-d2',
    ignorar: ['bano-bloque-a-d1'],
  },

  // (Opcional) ruta a un modelo .glb dentro de public/, por ejemplo '/modelos/edificio.glb'.
  modeloGlb: null,
};

export const ESTRATEGIAS = {
  sensores: {
    nombre: 'Con sensores',
    descripcion: 'Aseo atiende la lista del receptor: primero los vacíos, luego los bajos, luego revisar y sin dato.',
  },
  rondas4h: {
    nombre: 'Rondas cada 4 h',
    descripcion: 'Aseo recorre los 12 baños a las 6, 10, 14 y 18 h y recarga si el nivel está por debajo de 30 %.',
  },
  rondas2: {
    nombre: 'Rondas 2 veces al día',
    descripcion: 'Aseo recorre los 12 baños a las 6 y 14 h y recarga si el nivel está por debajo de 30 %.',
  },
};
