// Conexión en vivo con el broker público de HiveMQ (el mismo al que publica el ESP32 de Wokwi).
// Solo se suscribe: el gemelo nunca publica en el broker.
import mqtt from 'mqtt';

export function conectar({ url, suscripcion, alMensaje, alEstado }) {
  const cliente = mqtt.connect(url, {
    clientId: `gemelo-bloque-b-${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 4000,
    keepalive: 30,
  });
  alEstado({ tipo: 'conectando' });
  cliente.on('connect', () => {
    cliente.subscribe(suscripcion, { qos: 0 }, (err) => {
      if (err) alEstado({ tipo: 'error', detalle: `no se pudo suscribir: ${err.message}` });
      else alEstado({ tipo: 'conectado' });
    });
  });
  cliente.on('reconnect', () => alEstado({ tipo: 'conectando' }));
  cliente.on('offline', () => alEstado({ tipo: 'desconectado' }));
  cliente.on('error', (err) => alEstado({ tipo: 'error', detalle: err.message }));
  cliente.on('message', (tema, carga) => alMensaje(tema, carga.toString()));
  return {
    cerrar() {
      cliente.end(true);
    },
  };
}
