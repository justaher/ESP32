import type { Snapshot, EnergyRow, Period } from "./types";
export const dayKey = (date = new Date()) =>
  new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
export function demoSnapshot(): Snapshot {
  const now = new Date();
  const ago = (hours: number) =>
    new Date(now.getTime() - hours * 3600000).toISOString();
  const definitions = [
    ["light-a", "Chiếu sáng khu A", "light"],
    ["light-b", "Chiếu sáng khu B", "light"],
    ["fan-1", "Quạt thông gió 01", "fan"],
    ["pump-1", "Máy bơm tuần hoàn", "pump"],
    ["fan-2", "Quạt hút công nghiệp", "fan"],
    ["motor-1", "Động cơ băng tải", "motor"],
  ];
  const power = [2640, 2380, 1220, 4800, 2880, 4500],
    energy = [24.1, 22.44, 9.78, 28.26, 17.22, 22.78];
  return {
    cabinets: [
      {
        id: "cabinet-1",
        name: "Tủ điện chiếu sáng",
        location: "Khu vực A",
        description: "Hệ thống đèn & phụ tải chiếu sáng",
      },
      {
        id: "cabinet-2",
        name: "Tủ điện động lực",
        location: "Khu vực B",
        description: "Hệ thống bơm & thông gió",
      },
    ],
    devices: definitions.map(([id, name, type], i) => ({
      id,
      name,
      type,
      cabinetId: i < 3 ? "cabinet-1" : "cabinet-2",
      ratedPowerW: i < 3 ? 3000 : 5000,
      thresholds: {
        minVoltage: 200,
        maxVoltage: 250,
        maxCurrent: 25,
        maxTemperature: 70,
      },
      online: i !== 1,
      latest: {
        deviceId: id,
        timestamp: i === 1 ? ago(2) : now.toISOString(),
        voltage: 229.4 + i * 0.3,
        current: i === 5 ? 27.1 : power[i] / 230,
        powerW: power[i],
        energyKwh: 1500 + i * 129,
        frequency: 50.02,
        powerFactor: 0.96,
        temperature: 34.5 + i * 2,
      },
    })),
    incidents: [
      {
        id: "demo-1",
        deviceId: "motor-1",
        cabinetId: "cabinet-2",
        message: "Dòng điện vượt ngưỡng",
        severity: "critical",
        status: "open",
        active: true,
        createdAt: ago(0.4),
        recoveredAt: null,
        resolvedAt: null,
        note: null,
      },
      {
        id: "demo-2",
        deviceId: "fan-1",
        cabinetId: "cabinet-1",
        message: "Nhiệt độ vượt ngưỡng",
        severity: "warning",
        status: "open",
        active: false,
        createdAt: ago(1.2),
        recoveredAt: ago(0.7),
        resolvedAt: null,
        note: null,
      },
      {
        id: "demo-3",
        deviceId: "pump-1",
        cabinetId: "cabinet-2",
        message: "Điện áp dưới ngưỡng",
        severity: "warning",
        status: "resolved",
        active: false,
        createdAt: ago(26),
        recoveredAt: ago(25),
        resolvedAt: ago(24),
        note: "Kiểm tra nguồn cấp và siết lại đầu nối.",
        resolvedBy: "operator@powergrid.demo",
      },
      {
        id: "demo-4",
        deviceId: "light-a",
        cabinetId: "cabinet-1",
        message: "Khoảng đo bị gián đoạn trên 15 phút",
        severity: "warning",
        status: "resolved",
        active: false,
        createdAt: ago(51),
        recoveredAt: ago(50),
        resolvedAt: ago(49),
        note: "Khôi phục kết nối Wi-Fi của gateway.",
      },
    ],
    todayKwh: energy.reduce((s, n) => s + n, 0),
    monthKwh: 1842.6,
    dailyByDevice: Object.fromEntries(
      definitions.map(([id], i) => [id, energy[i]]),
    ),
    serverTime: now.toISOString(),
  };
}
export function demoEnergy(
  period: Period,
  anchor: string,
  deviceId?: string,
): EnergyRow[] {
  const date = new Date(anchor + "T00:00:00Z");
  let count = 12;
  if (period === "week") {
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    count = 7;
  }
  if (period === "month") {
    date.setUTCDate(1);
    count = new Date(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      0,
    ).getDate();
  }
  return Array.from({ length: count }, (_, i) => {
    const key =
      period === "year"
        ? `${anchor.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`
        : new Date(date.getTime() + i * 86400000).toISOString().slice(0, 10);
    const future = key > (period === "year" ? dayKey().slice(0, 7) : dayKey());
    const multiplier = period === "year" ? 24 : 1;
    let a = (42 + Math.sin(i * 1.8 + 2) * 12 + (i % 4) * 3) * multiplier,
      b = (55 + Math.cos(i * 1.3) * 13 + (i % 3) * 5) * multiplier;
    if (deviceId) {
      a = ["light-a", "light-b", "fan-1"].includes(deviceId) ? a / 3 : 0;
      b = ["pump-1", "fan-2", "motor-1"].includes(deviceId) ? b / 3 : 0;
    }
    return {
      date: key,
      cabinet1: future ? null : Math.round(a * 100) / 100,
      cabinet2: future ? null : Math.round(b * 100) / 100,
      total: future ? null : Math.round((a + b) * 100) / 100,
    };
  });
}
