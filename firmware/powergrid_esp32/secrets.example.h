#pragma once
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
// LAN development: use the PC LAN IP, NOT localhost. Set backend HOST=0.0.0.0.
const char* API_URL = "http://192.168.1.10:4000/api/telemetry";
const char* DEVICE_ID = "light-a";
const char* DEVICE_NAME = "Chieu sang khu A";
const char* CABINET_ID = "cabinet-1";
const char* DEVICE_TYPE = "light"; // light, fan, pump, motor, other
constexpr float RATED_POWER_W = 3000;
constexpr float MIN_VOLTAGE = 200;
constexpr float MAX_VOLTAGE = 250;
constexpr float MAX_CURRENT = 25;
constexpr float MAX_TEMPERATURE = 70;
const char* DEVICE_KEY = "replace-with-your-generated-device-key";
// For HTTPS, paste the server's trusted root CA PEM here. Never use setInsecure().
const char* ROOT_CA = "";
constexpr int PZEM_RX_PIN = 16;
constexpr int PZEM_TX_PIN = 17;
