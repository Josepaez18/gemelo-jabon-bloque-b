/*
  Sensor de nivel de jabón — Momento 3
  Internet de las Cosas · Universidad Cooperativa de Colombia · Grupo 7788

  SIMULACIÓN DECLARADA (Wokwi):
    - La placa es un ESP32-C3 DevKitM-1 simulado en Wokwi.
    - El HC-SR04 va en la tapa del dispensador y mide la distancia hasta el jabón:
      4 cm = lleno (100 %), 20 cm = vacío (0 %). En Wokwi: clic sobre el sensor → deslizador de distancia.
    - El pulsador rojo (GPIO4, tecla "f") simula algo que tapa el sensor: mientras está activo,
      la lectura queda en 1,5 cm, un nivel imposible (116 %) que el receptor rechaza (R6).
      Se activa y desactiva con cada pulsación.

  Qué hace:
    1. Mide la distancia con el HC-SR04 y la convierte a % del volumen útil.
    2. Arma el mensaje JSON del contrato (versión 1) y lo firma con HMAC-SHA256.
    3. Lo publica por MQTT en ucc7788/jabon/<id>:
         - de inmediato si el nivel cambió 2 puntos o más (como mínimo cada 2 s),
         - y además un "latido" cada 10 s (cada 5 s si el nivel está bajo, < 30 %),
           para que el receptor sepa que el dispensador sigue vivo.
    4. Si el sensor no devuelve eco, no envía nada: el receptor lo marca "sin dato", nunca 0 %.

  Cambios respecto al sketch del Momento 2:
    - El potenciómetro se reemplazó por el HC-SR04, el sensor que iría en el dispensador real.
    - La clave de firma sigue la regla del gemelo digital: "clave-prueba-<id>".
    - El pulsador ya no deja la lectura en 0 %: ahora simula una obstrucción (dato imposible).

  Librería: PubSubClient (en Wokwi va en libraries.txt).
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <time.h>
#include "mbedtls/md.h"

// ------------------------- Configuración -------------------------
const char* WIFI_RED   = "Wokwi-GUEST";        // red de Wokwi; con la placa real, la red del equipo
const char* WIFI_CLAVE = "";
const char* BROKER     = "broker.hivemq.com";  // broker MQTT público (el mismo que escucha el gemelo)
const int   PUERTO     = 1883;
const char* PREFIJO_TEMA = "ucc7788/jabon/";

const char* ID_DISPENSADOR = "bano-bloque-b-d2";
const char* CLAVE_FIRMA    = "clave-prueba-bano-bloque-b-d2";  // la misma que usa el gemelo para d2

const int PIN_TRIG  = 5;   // HC-SR04 TRIG
const int PIN_ECHO  = 6;   // HC-SR04 ECHO (con la placa real: divisor de voltaje, el eco sale a 5 V)
const int PIN_FALLA = 4;   // pulsador a GND (entrada con pull-up)

const float D_LLENO_CM       = 4.0;    // distancia al jabón con el dispensador lleno
const float D_VACIO_CM       = 20.0;   // distancia al fondo con el dispensador vacío
const float D_OBSTRUCCION_CM = 1.5;    // algo pegado al sensor: lectura imposible (~116 %)
const int   TOLERANCIA       = 3;      // puntos de error que se absorben (entre -3 y 103)

const unsigned long LATIDO_NORMAL_MS    = 10000;  // latido cada 10 s con nivel normal
const unsigned long LATIDO_BAJO_MS      = 5000;   // latido cada 5 s con nivel bajo
const unsigned long MIN_ENTRE_ENVIOS_MS = 2000;   // nunca dos envíos en menos de 2 s (R5 pide momentos crecientes)
const unsigned long LECTURA_CADA_MS     = 200;    // el HC-SR04 necesita unos 60 ms entre medidas
const int CAMBIO_MINIMO  = 2;    // puntos de % que disparan un envío inmediato
const int UMBRAL_RECARGA = 30;   // % por debajo del cual el nivel es "bajo"
const int VERSION_CONTRATO = 1;

// ===================== CONTRATO INICIO =====================
// (Funciones sin dependencias de Arduino: se pueden probar en un PC.)

// Texto que se firma: campos del contrato en orden fijo, separados por '|'.
// Debe ser idéntico al de src/modelo/contrato.js en el gemelo.
void armarTextoFirmado(char* out, size_t n, const char* id, const char* variable, int valor,
                       const char* unidad, const char* momento, int version) {
  snprintf(out, n, "%s|%s|%d|%s|%s|%d", id, variable, valor, unidad, momento, version);
}

// HMAC-SHA256 del texto con la clave del dispensador, en hexadecimal (64 caracteres).
void firmarHMAC(const char* clave, const char* texto, char* hex65) {
  unsigned char mac[32];
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_hmac(info, (const unsigned char*)clave, strlen(clave),
                  (const unsigned char*)texto, strlen(texto), mac);
  for (int i = 0; i < 32; i++) snprintf(hex65 + 2 * i, 3, "%02x", mac[i]);
  hex65[64] = '\0';
}

// Arma el JSON completo del contrato, ya firmado. Devuelve la longitud escrita.
int armarMensaje(char* out, size_t n, const char* id, int valor, const char* momento,
                 const char* clave, int version) {
  char texto[192];
  char firma[65];
  armarTextoFirmado(texto, sizeof(texto), id, "nivel_jabon", valor, "%", momento, version);
  firmarHMAC(clave, texto, firma);
  return snprintf(out, n,
    "{\"id\":\"%s\",\"variable\":\"nivel_jabon\",\"valor\":%d,\"unidad\":\"%%\","
    "\"momento\":\"%s\",\"version\":%d,\"firma\":\"%s\"}",
    id, valor, momento, version, firma);
}

// Distancia → nivel: round((20 - d) / 16 * 100). Solo se absorben 3 puntos de error;
// fuera de -3..103 el valor queda imposible y se envía igual, para que el receptor lo rechace (R6).
int nivelDesdeDistancia(float d) {
  int n = (int)lround((D_VACIO_CM - d) / (D_VACIO_CM - D_LLENO_CM) * 100.0);
  if (n < 0 && n >= -TOLERANCIA) return 0;
  if (n > 100 && n <= 100 + TOLERANCIA) return 100;
  return n;
}
// ====================== CONTRATO FIN ======================

WiFiClient red;
PubSubClient mqtt(red);
char tema[96];

bool fallaSimulada = false;
int ultimoEstadoBoton = HIGH;
unsigned long ultimoCambioBoton = 0;

float distancia = -1;        // última distancia medida, en cm (-1 = sin eco)
int nivel = 0;
unsigned long ultimaLecturaMs = 0;

int ultimoEnviado = -1000;   // -1000 = todavía no se ha enviado nada
unsigned long ultimoEnvioMs = 0;
unsigned long ultimaImpresionMs = 0;
unsigned long ultimaSincroniaMs = 0;
const unsigned long RESINCRONIZAR_MS = 300000;   // pide la hora otra vez cada 5 min (Wokwi puede ir más lento que el reloj real)

// Mide la distancia con el HC-SR04, en cm. Devuelve -1 si no hubo eco.
// El pulso de ECHO se mide con micros() y no con pulseIn(): en el ESP32-C3, pulseIn() cuenta ciclos
// de la CPU, y en Wokwi esa cuenta no avanza al ritmo real (4 cm se leían como 0,2 cm).
const unsigned long ESPERA_ECO_US = 30000;   // hasta 30 ms (unos 5 m)
float medirDistanciaCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long t0 = micros();
  while (digitalRead(PIN_ECHO) == LOW) {
    if (micros() - t0 > ESPERA_ECO_US) return -1;      // el eco nunca empezó
  }
  unsigned long inicio = micros();
  while (digitalRead(PIN_ECHO) == HIGH) {
    if (micros() - inicio > ESPERA_ECO_US) return -1;  // el eco nunca terminó
  }
  return (micros() - inicio) / 58.0;                   // ida y vuelta del sonido: 58 µs por cm
}

// Hora actual en formato ISO 8601 con la zona de Colombia. Falla si aún no hay hora por NTP.
bool momentoActual(char* buf, size_t n) {
  struct tm t;
  if (!getLocalTime(&t, 100)) return false;
  strftime(buf, n, "%Y-%m-%dT%H:%M:%S-05:00", &t);
  return true;
}

void conectarWiFi() {
  Serial.print("Conectando a WiFi ");
  Serial.print(WIFI_RED);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_RED, WIFI_CLAVE);
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }
  Serial.print(" conectado. IP: ");
  Serial.println(WiFi.localIP());
}

void conectarMQTT() {
  while (!mqtt.connected()) {
    char idCliente[64];
    snprintf(idCliente, sizeof(idCliente), "ucc7788-%s-%04lx", ID_DISPENSADOR,
             (unsigned long)(esp_random() & 0xFFFF));
    Serial.printf("Conectando al broker %s:%d ... ", BROKER, PUERTO);
    if (mqtt.connect(idCliente)) {
      Serial.println("conectado.");
    } else {
      Serial.printf("falló (estado %d). Reintento en 2 s.\n", mqtt.state());
      delay(2000);
    }
  }
}

void revisarPulsador() {
  int e = digitalRead(PIN_FALLA);
  if (e != ultimoEstadoBoton && millis() - ultimoCambioBoton > 50) {
    ultimoCambioBoton = millis();
    ultimoEstadoBoton = e;
    if (e == LOW) {
      fallaSimulada = !fallaSimulada;
      Serial.println(fallaSimulada
        ? ">>> FALLA SIMULADA ACTIVADA: algo tapa el sensor (lectura de 1,5 cm, nivel imposible)."
        : ">>> Falla simulada desactivada: vuelve la lectura del HC-SR04.");
    }
  }
}

void enviar(int valor) {
  char momento[32];
  if (!momentoActual(momento, sizeof(momento))) {
    Serial.println("Sin hora (NTP) todavía: no envío, porque el contrato exige 'momento'.");
    return;
  }
  char mensaje[384];
  armarMensaje(mensaje, sizeof(mensaje), ID_DISPENSADOR, valor, momento, CLAVE_FIRMA, VERSION_CONTRATO);
  bool ok = mqtt.publish(tema, mensaje);
  Serial.printf("%s %s -> %s\n", ok ? "PUBLICADO" : "NO SE PUDO PUBLICAR", tema, mensaje);
  if (ok) {
    ultimoEnviado = valor;
    ultimoEnvioMs = millis();
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("== Sensor de nivel de jabón · ESP32-C3 + HC-SR04 (SIMULACIÓN EN WOKWI) · Grupo 7788 ==");
  Serial.printf("Dispensador: %s\n", ID_DISPENSADOR);

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_FALLA, INPUT_PULLUP);

  conectarWiFi();
  configTime(-5 * 3600, 0, "pool.ntp.org", "time.google.com");   // hora de Colombia (UTC-5)
  Serial.print("Esperando la hora por NTP");
  struct tm t;
  while (!getLocalTime(&t, 1000)) Serial.print(".");
  char momento[32];
  momentoActual(momento, sizeof(momento));
  Serial.printf(" listo: %s\n", momento);
  ultimaSincroniaMs = millis();

  snprintf(tema, sizeof(tema), "%s%s", PREFIJO_TEMA, ID_DISPENSADOR);
  mqtt.setServer(BROKER, PUERTO);
  mqtt.setBufferSize(512);   // el mensaje firmado ocupa ~230 bytes; el valor por defecto (256) queda justo
  conectarMQTT();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) conectarWiFi();
  if (!mqtt.connected()) conectarMQTT();
  mqtt.loop();
  revisarPulsador();

  unsigned long ahora = millis();

  if (ahora - ultimaSincroniaMs >= RESINCRONIZAR_MS) {
    ultimaSincroniaMs = ahora;
    configTime(-5 * 3600, 0, "pool.ntp.org", "time.google.com");
    Serial.println("Resincronizando la hora por NTP.");
  }

  if (ahora - ultimaLecturaMs >= LECTURA_CADA_MS) {
    ultimaLecturaMs = ahora;
    distancia = fallaSimulada ? D_OBSTRUCCION_CM : medirDistanciaCm();
    if (distancia >= 0) nivel = nivelDesdeDistancia(distancia);
  }

  // Lectura en el monitor serial, con su unidad, una vez por segundo.
  if (ahora - ultimaImpresionMs >= 1000) {
    ultimaImpresionMs = ahora;
    if (distancia < 0) {
      Serial.println("Lectura: sin eco del HC-SR04 -> no envío (el receptor lo verá como 'sin dato').");
    } else {
      Serial.printf("Lectura: distancia = %5.1f cm  ->  nivel = %3d %%%s\n", distancia, nivel,
                    fallaSimulada ? "  [FALLA SIMULADA]" : "");
    }
  }

  if (distancia < 0) {   // sin eco: no se inventa un dato
    delay(20);
    return;
  }

  // ¿Toca enviar? Por cambio (>= 2 puntos) o por latido.
  unsigned long latido = (nivel < UMBRAL_RECARGA) ? LATIDO_BAJO_MS : LATIDO_NORMAL_MS;
  bool primero   = (ultimoEnviado == -1000);
  bool cambio    = primero || abs(nivel - ultimoEnviado) >= CAMBIO_MINIMO;
  bool porCambio = cambio && (primero || ahora - ultimoEnvioMs >= MIN_ENTRE_ENVIOS_MS);
  bool porLatido = !primero && (ahora - ultimoEnvioMs >= latido);
  if (porCambio || porLatido) enviar(nivel);

  delay(20);
}
