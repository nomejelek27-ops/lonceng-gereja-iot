/*
  lonceng_esp32.ino
  ------------------------------------------------------------
  Sketch ESP32 untuk Sistem Kendali & Penjadwalan Lonceng Gereja.

  Cara kerja:
  1. ESP32 konek ke WiFi.
  2. Setiap POLL_INTERVAL_MS, ESP32 melakukan HTTP GET ke server
     (endpoint /api/device/poll) untuk menanyakan "ada perintah bunyi?".
  3. Jika ada perintah, ESP32 menyalakan relay selama RING_DURATION_MS,
     lalu melapor balik ke server (endpoint /api/device/ack).

  YANG PERLU DIISI SEBELUM UPLOAD:
  - WIFI_SSID, WIFI_PASSWORD
  - SERVER_HOST  (alamat/IP komputer yang menjalankan server, contoh: "192.168.1.10")
  - SERVER_PORT  (default 3000)
  - deviceKey    (ambil dari tombol "Pengaturan" di halaman web setelah login)

  Library yang dibutuhkan (install lewat Library Manager Arduino IDE):
  - WiFi.h        (bawaan board ESP32)
  - HTTPClient.h  (bawaan board ESP32)
  - ArduinoJson   (oleh Benoit Blanchon)
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---------- KONFIGURASI: SESUAIKAN DENGAN LOKASI KAMU ----------
const char* WIFI_SSID     = "NAMA_WIFI_GEREJA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI";

const char* SERVER_HOST = "192.168.1.10";   // IP komputer/server, cek dengan ipconfig/ifconfig
const int   SERVER_PORT = 3000;

const char* deviceKey = "TEMPEL_DEVICE_KEY_DI_SINI"; // dari halaman web > Pengaturan

const int RELAY_PIN = 26;         // pin GPIO yang tersambung ke modul relay
const bool RELAY_ACTIVE_LOW = true; // true jika modul relay aktif saat LOW (umum untuk modul relay murah)

const unsigned long POLL_INTERVAL_MS  = 3000;   // cek server setiap 3 detik
const unsigned long RING_DURATION_MS  = 4000;   // lonceng menyala selama 4 detik saat dibunyikan
// ----------------------------------------------------------------

unsigned long lastPollTime = 0;

void relayOn()  { digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? LOW  : HIGH); }
void relayOff() { digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? HIGH : LOW); }

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Menyambungkan ke WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Terhubung. IP ESP32: ");
  Serial.println(WiFi.localIP());
}

String buildUrl(const char* endpoint) {
  return "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + endpoint;
}

/** Tanya server: ada perintah bunyi yang menunggu? */
bool pollForCommand(String &commandId, String &label) {
  HTTPClient http;
  String url = buildUrl("/api/device/poll") + "?key=" + deviceKey;
  http.begin(url);
  int code = http.GET();

  bool hasCommand = false;
  if (code == 200) {
    String payload = http.getString();
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (!err && !doc["command"].isNull()) {
      commandId = doc["command"]["commandId"].as<String>();
      label     = doc["command"]["label"].as<String>();
      hasCommand = true;
    }
  } else {
    Serial.printf("Polling gagal, kode HTTP: %d\n", code);
  }
  http.end();
  return hasCommand;
}

/** Lapor ke server bahwa lonceng sudah dibunyikan */
void ackCommand(const String &commandId) {
  HTTPClient http;
  String url = buildUrl("/api/device/ack") + "?key=" + deviceKey;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> doc;
  doc["commandId"] = commandId;
  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  Serial.printf("ACK terkirim, kode HTTP: %d\n", code);
  http.end();
}

void ringBell(const String &label) {
  Serial.println("Membunyikan lonceng: " + label);
  relayOn();
  delay(RING_DURATION_MS);
  relayOff();
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  relayOff();
  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long now = millis();
  if (now - lastPollTime >= POLL_INTERVAL_MS) {
    lastPollTime = now;

    String commandId, label;
    if (pollForCommand(commandId, label)) {
      ringBell(label);
      ackCommand(commandId);
    }
  }
}
