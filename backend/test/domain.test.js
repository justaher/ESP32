import test from "node:test";
import assert from "node:assert/strict";
import {
  energyDelta,
  localDay,
  rangeFor,
  detectedFaults,
  telemetrySchema,
  aggregateEnergy,
} from "../src/domain.js";
const sample = (timestamp, energyKwh) => ({ timestamp, energyKwh });
test("calendar uses Vietnam midnight; week starts Monday and leap month has 29 days", () => {
  assert.equal(localDay("2026-09-13T17:00:00Z"), "2026-09-14");
  assert.deepEqual(rangeFor("week", "2026-09-14").labels, [
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
    "2026-09-20",
  ]);
  assert.equal(rangeFor("month", "2024-02-12").labels.length, 29);
  assert.equal(rangeFor("year", "2026-09-14").labels.length, 12);
  assert.throws(() => rangeFor("month", "2026-02-31"));
});
test("cumulative kWh is differenced and split correctly at UTC+7 midnight", () => {
  const result = energyDelta(
    sample("2026-09-13T16:59:00Z", 10),
    sample("2026-09-13T17:01:00Z", 10.1),
    5000,
  );
  assert.equal(result.portions.length, 2);
  assert.equal(result.portions[0].date, "2026-09-13");
  assert.equal(result.portions[1].date, "2026-09-14");
  for (const part of result.portions) {
    assert.ok(Math.abs(part.kwh - 0.05) < 1e-8);
    assert.equal(part.coverageSeconds, 60);
  }
});
test("first readings, meter resets and long gaps do not fabricate consumption", () => {
  assert.equal(
    energyDelta(null, sample("2026-09-14T00:00:00Z", 100), 5000).reason,
    "baseline",
  );
  assert.equal(
    energyDelta(
      sample("2026-09-14T00:00:00Z", 100),
      sample("2026-09-14T00:01:00Z", 0),
      5000,
    ).reason,
    "counter_reset",
  );
  const gap = energyDelta(
    sample("2026-09-14T00:00:00Z", 100),
    sample("2026-09-14T01:00:00Z", 102),
    5000,
  );
  assert.equal(gap.reason, "gap");
  assert.deepEqual(gap.portions, []);
});
test("old samples and impossible energy jumps are rejected", () => {
  assert.throws(
    () =>
      energyDelta(
        sample("2026-09-14T01:00:00Z", 2),
        sample("2026-09-14T00:00:00Z", 3),
        1000,
      ),
    /OUT_OF_ORDER/,
  );
  assert.throws(
    () =>
      energyDelta(
        sample("2026-09-14T00:00:00Z", 2),
        sample("2026-09-14T00:00:01Z", 3),
        1000,
      ),
    /ENERGY_JUMP/,
  );
});
test("threshold alarms detect multiple simultaneous faults", () => {
  const faults = detectedFaults(
    { voltage: 260, current: 30, temperature: 80 },
    { minVoltage: 200, maxVoltage: 250, maxCurrent: 25, maxTemperature: 70 },
  );
  assert.deepEqual(
    faults.map((f) => f.code),
    ["overvoltage", "overcurrent", "overheat"],
  );
  assert.equal(
    detectedFaults(
      { voltage: 230, current: 10 },
      { minVoltage: 200, maxVoltage: 250, maxCurrent: 25, maxTemperature: 70 },
    ).length,
    0,
  );
});
test("API telemetry validation rejects strings, traversal and invalid measurement values", () => {
  const good = {
    sampleId: "boot_1",
    deviceId: "light-a",
    timestamp: "2026-09-14T00:00:00Z",
    voltage: 230,
    current: 1,
    powerW: 230,
    energyKwh: 1,
  };
  assert.equal(telemetrySchema.safeParse(good).success, true);
  for (const patch of [
    { deviceId: "../admin" },
    { current: -1 },
    { powerW: "200" },
    { powerFactor: 2 },
    { sampleId: "x/y" },
  ])
    assert.equal(
      telemetrySchema.safeParse({ ...good, ...patch }).success,
      false,
    );
});
test("aggregation preserves missing data and distinguishes measured zero", () => {
  const range = rangeFor("week", "2026-09-14");
  const result = aggregateEnergy(
    [
      { date: "2026-09-14", deviceId: "a", kwh: 0 },
      { date: "2026-09-15", deviceId: "b", kwh: 3 },
    ],
    range,
    "week",
    [
      { id: "a", cabinetId: "cabinet-1" },
      { id: "b", cabinetId: "cabinet-2" },
    ],
  );
  assert.equal(result[0].total, 0);
  assert.equal(result[0].cabinet2, null);
  assert.equal(result[1].total, 3);
  assert.equal(result[2].total, null);
});
