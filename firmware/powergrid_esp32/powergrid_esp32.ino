// ESP32 + PZEM-004T v3 example. Adapt readMeasurements() if using another sensor.
// Arduino libraries: PZEM004Tv30 (mandulaj), ArduinoJson 7, ESP32 board package.
// Copy secrets.example.h to secrets.h and fill in local values before compiling.
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>
#include <time.h>
#include <esp_system.h>
#include "secrets.h"

PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);
String bootId, pendingPayload;
bool deviceRegistered = false;
unsigned long sequence = 0, lastAttempt = 0, pendingCreated = 0;
constexpr unsigned long INTERVAL_MS = 10000;

bool readMeasurements(JsonDocument &doc) {
  float voltage = pzem.voltage();
  float current = pzem.current();
  float powerW = pzem.power();
  float energyKwh = pzem.energy();
  float frequency = pzem.frequency();
  float powerFactor = pzem.pf();
  if (isnan(voltage) || isnan(current) || isnan(powerW) || isnan(energyKwh) || isnan(frequency) || isnan(powerFactor)) {
    Serial.println("Sensor unavailable; no fabricated values sent.");
    return false;
  }
  doc["voltage"] = voltage;
  doc["current"] = current;
  doc["powerW"] = powerW;
  doc["energyKwh"] = energyKwh; // PZEM library returns kWh, cumulative; do not reset after sending.
  doc["frequency"] = frequency;
  doc["powerFactor"] = powerFactor;
  return true;
}

bool prepareSample() {
  time_t now = time(nullptr);
  if (now < 1700000000) { Serial.println("Waiting for NTP clock."); return false; }
  JsonDocument doc;
  if (!readMeasurements(doc)) return false;
  struct tm utc;
  gmtime_r(&now, &utc);
  char timestamp[25];
  strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", &utc);
  doc["timestamp"] = timestamp;
  doc["deviceId"] = DEVICE_ID;
  doc["sampleId"] = bootId + "_" + String(sequence++);
  pendingPayload = "";
  serializeJson(doc, pendingPayload);
  pendingCreated = millis();
  return true;
}

int postJson(const String &url, const String &payload) {
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  HTTPClient http;
  bool started;
  if (url.startsWith("https://")) {
    if (strlen(ROOT_CA) == 0) { Serial.println("Configure ROOT_CA for HTTPS."); return -1; }
    secureClient.setCACert(ROOT_CA);
    started = http.begin(secureClient, url);
  } else {
    started = http.begin(plainClient, url); // Local trusted LAN development only.
  }
  if (!started) { Serial.println("Could not start HTTP request."); return -1; }
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int status = http.POST(payload);
  http.end();
  return status;
}

bool registerDevice() {
  String url = API_URL;
  if (!url.endsWith("/api/telemetry")) { Serial.println("API_URL must end with /api/telemetry"); return false; }
  url.remove(url.length() - String("/api/telemetry").length());
  url += "/api/devices/register";
  JsonDocument doc;
  doc["id"] = DEVICE_ID;
  doc["name"] = DEVICE_NAME;
  doc["cabinetId"] = CABINET_ID;
  doc["type"] = DEVICE_TYPE;
  doc["ratedPowerW"] = RATED_POWER_W;
  doc["thresholds"]["minVoltage"] = MIN_VOLTAGE;
  doc["thresholds"]["maxVoltage"] = MAX_VOLTAGE;
  doc["thresholds"]["maxCurrent"] = MAX_CURRENT;
  doc["thresholds"]["maxTemperature"] = MAX_TEMPERATURE;
  String payload;
  serializeJson(doc, payload);
  int status = postJson(url, payload);
  Serial.printf("Registration HTTP status: %d\n", status);
  if (status == 409) Serial.println("Device ID already exists with different configuration.");
  return status == 200 || status == 201;
}

void sendPending() {
  int status = postJson(API_URL, pendingPayload);
  Serial.printf("Telemetry HTTP status: %d\n", status);
  // A lost response is retried with the SAME sampleId so the backend can deduplicate.
  if ((status >= 200 && status < 300) || status == 400 || status == 409) pendingPayload = "";
  if (status == 401) Serial.println("Check DEVICE_ID / DEVICE_KEY on device and server.");
  if (status == 409) deviceRegistered = false;
}

void setup() {
  Serial.begin(115200);
  bootId = String(esp_random(), HEX) + String(esp_random(), HEX);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.println("PowerGrid telemetry sender ready.");
}

void loop() {
  if (millis() - lastAttempt < INTERVAL_MS) { delay(20); return; }
  lastAttempt = millis();
  if (WiFi.status() != WL_CONNECTED) { WiFi.reconnect(); return; }
  if (!deviceRegistered) { deviceRegistered = registerDevice(); if (!deviceRegistered) return; }
  // Discard stale queued sample; next cumulative reading establishes continuity or a documented gap.
  if (pendingPayload.length() && millis() - pendingCreated > 9 * 60 * 1000) pendingPayload = "";
  if (!pendingPayload.length() && !prepareSample()) return;
  sendPending();
}
