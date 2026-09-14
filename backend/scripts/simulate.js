// Writes explicitly simulated data into YOUR configured Firebase via the real API.
// Run only against a separate test Firebase project.
import { randomUUID } from "node:crypto";
import { exampleDevices } from "../src/catalog.js";
const id = process.env.SIMULATOR_DEVICE_ID || "light-a";
const keys = JSON.parse(process.env.DEVICE_KEYS_JSON || "{}");
if (!keys[id]) throw Error(`Missing DEVICE_KEYS_JSON entry for ${id}`);
const url =
  process.env.SIMULATOR_API_URL ||
  `http://127.0.0.1:${process.env.PORT || 4000}/api/telemetry`;
if (process.env.ALLOW_SIMULATED_WRITES !== "true")
  throw Error(
    "Set ALLOW_SIMULATED_WRITES=true only for a TEST Firebase project. This writes real database records.",
  );
let kwh = Number(process.env.SIMULATOR_START_KWH || 100),
  last = Date.now();
const boot = randomUUID();
let seq = 0;
console.log("SIMULATION -> " + url + " / " + id + " (Ctrl+C to stop)");
const definition = exampleDevices.find((d) => d.id === id) || {
  ...exampleDevices[0],
  id,
  name: `Thiết bị mô phỏng ${id}`,
};
const registration = await fetch(
  url.replace(/\/api\/telemetry$/, "/api/devices/register"),
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Key": keys[id] },
    body: JSON.stringify(definition),
    signal: AbortSignal.timeout(5000),
  },
);
if (!registration.ok)
  throw Error(
    `Registration failed: ${registration.status} ${await registration.text()}`,
  );
async function send() {
  const now = Date.now(),
    powerW = 800 + Math.sin(seq / 5) * 150;
  kwh += ((powerW / 1000) * (now - last)) / 3600000;
  last = now;
  const sample = {
    sampleId: `${boot}_${seq++}`,
    deviceId: id,
    timestamp: new Date(now).toISOString(),
    voltage: 230,
    current: powerW / 230,
    powerW,
    energyKwh: kwh,
    frequency: 50,
    powerFactor: 0.97,
    temperature: 35,
  };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Key": keys[id] },
      body: JSON.stringify(sample),
      signal: AbortSignal.timeout(5000),
    });
    console.log(response.status, await response.text());
  } catch (e) {
    console.error(e.message);
  }
  setTimeout(send, 10000);
}
await send();
