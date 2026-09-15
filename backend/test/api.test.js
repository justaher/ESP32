import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { exampleDevices as devices } from "../src/catalog.js";
const key = "test-device-key-with-at-least-32-characters";
test("registered mode admits new email accounts but rejects missing or invalid tokens and anonymous accounts", async (t) => {
  const app = createApp({
    store: {
      listDevices: async () => [],
      snapshot: async () => ({ readings: [], incidents: [], days: [] }),
      resolve: async () => "ok",
    },
    verifyToken: async (token) => {
      if (token === "invalid") throw Error("invalid token");
      return token === "anonymous" ? {} : { email: "new-user@example.com" };
    },
    accessMode: "registered",
    allowedEmails: [],
    deviceKeys: {},
    frontendOrigin: "http://localhost:3000",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + "/api/bootstrap")).status, 401);
  for (const [token, expected] of [
    ["invalid", 401],
    ["anonymous", 403],
    ["new-user", 200],
  ]) {
    assert.equal(
      (
        await fetch(url + "/api/bootstrap", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
      expected,
    );
  }
  assert.equal(
    (
      await fetch(url + "/api/incidents/recovered/resolve", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer new-user",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ note: "Checked and repaired" }),
      })
    ).status,
    200,
  );
});
test("API protects data, validates ingestion, enforces resolution and preserves missing data", async (t) => {
  let ingested = 0;
  const store = {
    listDevices: async () => devices,
    getDevice: async (id) => devices.find((d) => d.id === id),
    ingest: async () => {
      ingested++;
      return { accepted: true };
    },
    snapshot: async () => ({ readings: [], incidents: [], days: [] }),
    energy: async () => [],
    resolve: async (id) =>
      id === "active" ? "active" : id === "missing" ? "missing" : "ok",
  };
  const app = createApp({
    store,
    verifyToken: async (token) => {
      if (token === "invalid") throw Error("invalid");
      return {
        email:
          token === "allowed" ? "allowed@example.com" : "other@example.com",
      };
    },
    allowedEmails: ["allowed@example.com"],
    deviceKeys: { "light-a": key },
    frontendOrigin: "http://localhost:3000",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = "http://127.0.0.1:" + server.address().port;
  const request = (path, options = {}) => fetch(origin + path, options);
  const headers = {
    Authorization: "Bearer allowed",
    "Content-Type": "application/json",
  };
  assert.equal((await request("/health")).status, 200);
  assert.equal((await request("/api/bootstrap")).status, 401);
  assert.equal(
    (
      await request("/api/bootstrap", {
        headers: { Authorization: "Bearer invalid" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/api/bootstrap", {
        headers: { Authorization: "Bearer other" },
      })
    ).status,
    403,
  );
  const state = await (await request("/api/bootstrap", { headers })).json();
  assert.equal(state.cabinets.length, 2);
  assert.equal(state.devices.length, 6);
  assert.equal(state.todayKwh, null);
  assert.ok(state.devices.every((d) => !d.online));
  assert.equal(
    (await request("/api/energy?period=bad", { headers })).status,
    400,
  );
  assert.equal(
    (await request("/api/energy?anchor=2026-02-31", { headers })).status,
    400,
  );
  assert.equal(
    (await request("/api/energy?deviceId=unknown", { headers })).status,
    400,
  );
  const sample = {
    sampleId: "boot-1",
    deviceId: "light-a",
    timestamp: new Date().toISOString(),
    voltage: 230,
    current: 1,
    powerW: 230,
    energyKwh: 10,
  };
  const post = (payload, deviceKey = key) =>
    request("/api/telemetry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Key": deviceKey,
      },
      body: JSON.stringify(payload),
    });
  assert.equal((await post(sample, "wrong")).status, 401);
  assert.equal((await post({ ...sample, deviceId: "motor-1" })).status, 401);
  assert.equal((await post({ ...sample, current: -2 })).status, 400);
  assert.equal(
    (await post({ ...sample, timestamp: "2020-01-01T00:00:00Z" })).status,
    400,
  );
  assert.equal((await post(sample)).status, 202);
  assert.equal(ingested, 1);
  const resolve = (id, note) =>
    request("/api/incidents/" + id + "/resolve", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ note }),
    });
  assert.equal((await resolve("closed", "ok")).status, 400);
  assert.equal((await resolve("active", "Checked equipment")).status, 409);
  assert.equal((await resolve("missing", "Checked equipment")).status, 404);
  assert.equal((await resolve("closed", "Checked equipment")).status, 200);
});
