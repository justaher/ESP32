import { z } from "zod";
export const telemetrySchema = z
  .object({
    sampleId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    deviceId: z.string().regex(/^[a-z0-9-]{1,50}$/),
    timestamp: z.iso.datetime(),
    voltage: z.number().finite().min(0).max(1000),
    current: z.number().finite().min(0).max(10000),
    powerW: z.number().finite().min(0).max(10000000),
    energyKwh: z.number().finite().min(0).max(1e12),
    frequency: z.number().finite().min(0).max(100).optional(),
    powerFactor: z.number().finite().min(0).max(1).optional(),
    temperature: z.number().finite().min(-50).max(200).optional(),
  })
  .strict();
const offset = 7 * 3600000;
export const localDay = (value = Date.now()) =>
  new Date(new Date(value).getTime() + offset).toISOString().slice(0, 10);
export function rangeFor(period, anchor) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(anchor) ||
    !Number.isFinite(Date.parse(anchor)) ||
    new Date(anchor).toISOString().slice(0, 10) !== anchor
  )
    throw new Error("Ngày không hợp lệ");
  const d = new Date(anchor + "T00:00:00Z");
  let start, end, labels;
  if (period === "year") {
    start = anchor.slice(0, 4) + "-01-01";
    end = anchor.slice(0, 4) + "-12-31";
    labels = Array.from(
      { length: 12 },
      (_, i) => `${anchor.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`,
    );
  } else {
    if (period === "week") {
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      start = d.toISOString().slice(0, 10);
      d.setUTCDate(d.getUTCDate() + 6);
    } else if (period === "month") {
      start = anchor.slice(0, 7) + "-01";
      d.setUTCMonth(d.getUTCMonth() + 1, 0);
    } else throw new Error("Khoảng thời gian không hợp lệ");
    end = d.toISOString().slice(0, 10);
    labels = [];
    for (let t = Date.parse(start); t <= Date.parse(end); t += 86400000)
      labels.push(new Date(t).toISOString().slice(0, 10));
  }
  return { start, end, labels };
}
// Assign cumulative meter delta proportionally across local midnight. Gaps >15 min and counter resets establish a new baseline.
export function energyDelta(previous, current, ratedPowerW) {
  if (!previous) return { portions: [], reason: "baseline" };
  const from = Date.parse(previous.timestamp),
    to = Date.parse(current.timestamp),
    elapsed = to - from;
  if (elapsed <= 0) throw new Error("OUT_OF_ORDER");
  const delta = current.energyKwh - previous.energyKwh;
  if (delta < 0) return { portions: [], reason: "counter_reset" };
  if (elapsed > 900000) return { portions: [], reason: "gap" };
  if (delta > (((ratedPowerW * 5) / 1000) * elapsed) / 3600000 + 0.01)
    throw new Error("ENERGY_JUMP");
  const portions = [];
  let cursor = from;
  while (cursor < to) {
    const date = localDay(cursor);
    const midnight = Date.parse(date + "T00:00:00+07:00") + 86400000;
    const stop = Math.min(to, midnight);
    portions.push({
      date,
      kwh: (delta * (stop - cursor)) / elapsed,
      coverageSeconds: (stop - cursor) / 1000,
    });
    cursor = stop;
  }
  return { portions, reason: null };
}
export function detectedFaults(reading, thresholds) {
  const faults = [];
  if (reading.voltage > thresholds.maxVoltage)
    faults.push({
      code: "overvoltage",
      message: "Điện áp vượt ngưỡng",
      severity: "critical",
    });
  if (reading.voltage < thresholds.minVoltage)
    faults.push({
      code: "undervoltage",
      message: "Điện áp dưới ngưỡng",
      severity: "warning",
    });
  if (reading.current > thresholds.maxCurrent)
    faults.push({
      code: "overcurrent",
      message: "Dòng điện vượt ngưỡng",
      severity: "critical",
    });
  if (
    reading.temperature !== undefined &&
    reading.temperature > thresholds.maxTemperature
  )
    faults.push({
      code: "overheat",
      message: "Nhiệt độ vượt ngưỡng",
      severity: "critical",
    });
  return faults;
}
export function aggregateEnergy(rows, range, period, catalog) {
  return range.labels.map((date) => {
    const matching = rows.filter(
      (r) => (period === "year" ? r.date.slice(0, 7) : r.date) === date,
    );
    const sum = (id) => {
      const selected = matching.filter(
        (r) => catalog.find((d) => d.id === r.deviceId)?.cabinetId === id,
      );
      return selected.length ? selected.reduce((s, r) => s + r.kwh, 0) : null;
    };
    return {
      date,
      cabinet1: sum("cabinet-1"),
      cabinet2: sum("cabinet-2"),
      total: matching.length ? matching.reduce((s, r) => s + r.kwh, 0) : null,
      coverageSeconds: matching.reduce(
        (s, r) => s + (r.coverageSeconds || 0),
        0,
      ),
    };
  });
}
