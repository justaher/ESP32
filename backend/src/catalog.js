export const cabinets = [
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
];
export const devices = [
  {
    id: "light-a",
    cabinetId: "cabinet-1",
    name: "Chiếu sáng khu A",
    type: "light",
    ratedPowerW: 3000,
  },
  {
    id: "light-b",
    cabinetId: "cabinet-1",
    name: "Chiếu sáng khu B",
    type: "light",
    ratedPowerW: 3000,
  },
  {
    id: "fan-1",
    cabinetId: "cabinet-1",
    name: "Quạt thông gió 01",
    type: "fan",
    ratedPowerW: 1500,
  },
  {
    id: "pump-1",
    cabinetId: "cabinet-2",
    name: "Máy bơm tuần hoàn",
    type: "pump",
    ratedPowerW: 5000,
  },
  {
    id: "fan-2",
    cabinetId: "cabinet-2",
    name: "Quạt hút công nghiệp",
    type: "fan",
    ratedPowerW: 3000,
  },
  {
    id: "motor-1",
    cabinetId: "cabinet-2",
    name: "Động cơ băng tải",
    type: "motor",
    ratedPowerW: 4000,
  },
].map((d) => ({
  ...d,
  thresholds: {
    minVoltage: 200,
    maxVoltage: 250,
    maxCurrent: 25,
    maxTemperature: 70,
  },
}));
// Default: single-phase 230 V sensors. Adjust ratings/thresholds to actual equipment before connecting.
