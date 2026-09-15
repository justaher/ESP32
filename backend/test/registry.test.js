import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { exampleDevices } from "../src/catalog.js";
import { firestoreStore } from "../src/store.js";

test("live registry starts empty and accepts more than three devices per cabinet", async (t) => {
  const records = new Map();
  const key = "provisioned-device-key-of-at-least-32-characters";
  const store = {
    listDevices: async () => [...records.values()],
    getDevice: async (id) => records.get(id),
    registerDevice: async (d) => {
      if (records.has(d.id))
        return JSON.stringify(records.get(d.id)) === JSON.stringify(d)
          ? "existing"
          : "conflict";
      records.set(d.id, d);
      return "created";
    },
    snapshot: async () => ({ readings: [], incidents: [], days: [] }),
    energy: async () => [{ deviceId: "real-7", date: "2026-09-14", kwh: 2 }],
    ingest: async () => ({ accepted: true }),
  };
  const app = createApp({
    store,
    verifyToken: async () => ({ email: "operator@example.com" }),
    accessMode: "registered",
    deviceKeys: Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`real-${i}`, key]),
    ),
    frontendOrigin: "http://localhost:3000",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: "Bearer valid" };
  const post = (url, body, secret = key) =>
    fetch(base + url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Key": secret },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await (await fetch(base + "/api/bootstrap", { headers })).json()).devices
      .length,
    0,
  );
  const definition = { ...exampleDevices[0], id: "real-0" };
  assert.equal(
    (await post("/api/devices/register", definition, "wrong")).status,
    401,
  );
  assert.equal(
    (
      await post("/api/devices/register", {
        ...definition,
        cabinetId: "unknown",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post("/api/telemetry", {
        sampleId: "s1",
        deviceId: "real-0",
        timestamp: new Date().toISOString(),
        voltage: 230,
        current: 1,
        powerW: 230,
        energyKwh: 10,
      })
    ).status,
    409,
  );
  for (let i = 0; i < 8; i++)
    assert.equal(
      (await post("/api/devices/register", { ...definition, id: `real-${i}` }))
        .status,
      201,
    );
  assert.equal((await post("/api/devices/register", definition)).status, 200);
  assert.equal(
    (
      await post("/api/devices/register", {
        ...definition,
        cabinetId: "cabinet-2",
      })
    ).status,
    409,
  );
  const data = await (await fetch(base + "/api/bootstrap", { headers })).json();
  assert.equal(data.devices.length, 8);
  assert.equal(
    data.devices.filter((d) => d.cabinetId === "cabinet-1").length,
    8,
  );
  assert.ok(data.devices.every((d) => !d.online));
  const energy = await (
    await fetch(
      base + "/api/energy?period=week&anchor=2026-09-14&deviceId=real-7",
      { headers },
    )
  ).json();
  assert.equal(energy.rows[0].total, 2);
});

test("Firestore registration is idempotent and does not reassign an existing device", async () => {
  const records = new Map();
  const db = {
    collection: () => ({ doc: (id) => ({ id }) }),
    runTransaction: async (fn) =>
      fn({
        get: async (ref) => ({
          exists: records.has(ref.id),
          data: () => records.get(ref.id),
        }),
        set: (ref, data) => records.set(ref.id, data),
      }),
  };
  const store = firestoreStore(db),
    definition = exampleDevices[0];
  assert.equal(await store.registerDevice(definition), "created");
  assert.equal(
    await store.registerDevice({
      ...definition,
      thresholds: { ...definition.thresholds },
    }),
    "existing",
  );
  assert.equal(
    await store.registerDevice({ ...definition, cabinetId: "cabinet-2" }),
    "conflict",
  );
  assert.equal(records.get(definition.id).cabinetId, "cabinet-1");
});
