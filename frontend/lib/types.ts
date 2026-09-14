export type Reading = {
  deviceId: string;
  timestamp: string;
  voltage: number;
  current: number;
  powerW: number;
  energyKwh: number;
  frequency?: number;
  powerFactor?: number;
  temperature?: number;
  quality?: string | null;
};
export type Cabinet = {
  id: string;
  name: string;
  location: string;
  description: string;
};
export type Device = {
  id: string;
  cabinetId: string;
  name: string;
  type: string;
  ratedPowerW: number;
  thresholds: {
    minVoltage: number;
    maxVoltage: number;
    maxCurrent: number;
    maxTemperature: number;
  };
  latest: Reading | null;
  online: boolean;
};
export type Incident = {
  id: string;
  deviceId: string;
  cabinetId: string;
  message: string;
  severity: string;
  status: string;
  active: boolean;
  createdAt: string;
  recoveredAt: string | null;
  resolvedAt: string | null;
  note: string | null;
  resolvedBy?: string;
};
export type Snapshot = {
  cabinets: Cabinet[];
  devices: Device[];
  incidents: Incident[];
  todayKwh: number | null;
  monthKwh: number | null;
  dailyByDevice: Record<string, number | null>;
  serverTime: string;
};
export type EnergyRow = {
  date: string;
  cabinet1: number | null;
  cabinet2: number | null;
  total: number | null;
  coverageSeconds?: number;
};
export type Period = "week" | "month" | "year";
