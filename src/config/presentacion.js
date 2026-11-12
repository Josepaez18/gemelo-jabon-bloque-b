// Textos del modo presentación, en el orden de los 7 pasos del Momento 3.
// Están aquí para que el equipo los ajuste con sus propias palabras sin tocar el código.
// Los datos del momento (el último mensaje, la lista de aseo, la prueba de fallo) los agrega el gemelo.

export const PRESENTACION = {
  // Paso 3: qué corrigieron respecto al Momento 2 y por qué. Se muestra solo si hay algo escrito.
  correccionesMomento2: [
    // 'Ejemplo: ahora el momento lleva la zona -05:00 y el receptor lo exige (R5).',
  ],

  // Paso 7: enlace al proyecto de Wokwi o al repositorio. Se muestra solo si no está vacío.
  enlace: 'https://github.com/Josepaez18/gemelo-jabon-bloque-b',

  pasos: {
    idea: {
      titulo: 'La idea',
      texto: 'Un sistema que avisa dónde falta jabón en los baños del Bloque B.',
      columnas: [
        { titulo: 'Problema', items: ['Un dispensador se queda sin jabón y nadie se entera hasta la siguiente ronda de aseo.'] },
        { titulo: 'Quién lo usa', items: ['El personal de aseo y quien administra el edificio.'] },
        { titulo: 'Qué medimos', items: ['Cuánto jabón queda en cada uno de los 12 dispensadores.'] },
      ],
    },
    dato: {
      titulo: 'El dato',
      texto: 'Un ESP32-C3 con un sensor ultrasónico HC-SR04 mide la distancia al jabón: 4 cm es lleno y 20 cm es vacío.',
    },
    viaje: {
      titulo: 'El viaje del dato',
      texto: 'El ESP32 arma un JSON de 7 campos, lo firma y lo publica por Wi-Fi en un broker MQTT. El gemelo está suscrito y recibe cada mensaje: azul si el receptor lo acepta, rojo si lo rechaza.',
    },
    guardar: {
      titulo: 'Qué hacemos con el dato',
      texto: 'Antes de guardarlo, el receptor revisa 8 reglas (R1–R8): formato, firma, hora y que el valor sea posible. Solo cuentan los datos que pasan.',
    },
    decision: {
      titulo: 'La decisión',
      texto: 'Si un dispensador pasa a bajo o vacío, entra a la lista de aseo, con los vacíos primero. El personal va directo al baño que lo necesita, sin rondas a ciegas.',
    },
    falla: {
      titulo: 'Cuando algo falla',
      columnas: [
        {
          titulo: 'Respuesta segura',
          items: [
            'Un dato imposible no cambia el nivel: R6 lo rechaza.',
            'Si el sensor deja de enviar: «sin dato» a los 3 latidos, nunca 0 %.',
            'Un mensaje con firma falsa se descarta (R3).',
          ],
        },
      ],
    },
    seguridad: {
      titulo: 'Seguridad y límites',
      texto: 'Lo que el sistema protege hoy, lo que todavía no puede hacer y lo que mejoraríamos con más tiempo.',
      columnas: [
        {
          titulo: 'Protegemos',
          items: [
            'Cada mensaje va firmado con HMAC-SHA256 y una clave por dispensador: uno falso se rechaza (R3).',
            'Solo valen mensajes recientes y en orden (R5).',
            'El gemelo solo escucha: no publica nada en el broker.',
          ],
        },
        {
          titulo: 'Hoy no puede',
          items: [
            'El broker es público: cualquiera puede leer los mensajes, y las claves están escritas en el código.',
            'Los datos viven en el navegador: se pierden al recargar.',
            'Solo d2 viene de un ESP32 (simulado en Wokwi); los otros 11 los simula el gemelo.',
          ],
        },
        {
          titulo: 'Con más tiempo',
          items: ['Broker propio con usuario, contraseña y TLS.', 'Guardar el historial en una base de datos.', 'Avisar al celular del personal de aseo.'],
        },
      ],
    },
  },
};
