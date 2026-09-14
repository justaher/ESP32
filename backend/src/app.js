import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createHash, timingSafeEqual } from "node:crypto";
import { cabinets } from "./catalog.js";
import { deviceDefinition } from "./registry.js";
import {
  telemetrySchema,
  localDay,
  rangeFor,
  aggregateEnergy,
} from "./domain.js";

export function createApp({
  store,
  verifyToken,
  allowedEmails = [],
  accessMode = "allowlist",
  deviceKeys,
  frontendOrigin,
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: frontendOrigin.split(",").map((s) => s.trim()),
      methods: ["GET", "POST", "PATCH"],
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get("/health", (_, res) =>
    res.json({ status: "ok", service: "powergrid-api" }),
  );
  function validDeviceKey(id, submitted) {
    const key = Object.hasOwn(deviceKeys, id) ? deviceKeys[id] : null;
    const hash = (s) => createHash("sha256").update(s).digest();
    return (
      typeof key === "string" &&
      timingSafeEqual(hash(key), hash(submitted || ""))
    );
  }
  // A provisioned device announces its identity before sending measurements.
  app.post("/api/devices/register", async (req, res) => {
    const parsed = deviceDefinition.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          error: "Khai báo thiết bị không hợp lệ",
          details: parsed.error.issues,
        });
    if (!validDeviceKey(parsed.data.id, req.get("x-device-key")))
      return res.status(401).json({ error: "Khóa thiết bị không hợp lệ" });
    const result = await store.registerDevice(parsed.data);
    if (result === "conflict")
      return res
        .status(409)
        .json({
          error:
            "ID đã đăng ký với cấu hình khác. Kiểm tra khai báo hoặc cập nhật cấu hình trong Firestore.",
        });
    res
      .status(result === "created" ? 201 : 200)
      .json({ ok: true, status: result });
  });
  app.post("/api/telemetry", async (req, res) => {
    const result = telemetrySchema.safeParse(req.body);
    if (!result.success)
      return res.status(400).json({
        error: "Dữ liệu đo không hợp lệ",
        details: result.error.issues,
      });
    const sample = result.data;
    if (!validDeviceKey(sample.deviceId, req.get("x-device-key")))
      return res.status(401).json({ error: "Khóa thiết bị không hợp lệ" });
    const device = await store.getDevice(sample.deviceId);
    if (!device)
      return res
        .status(409)
        .json({
          error: "DEVICE_NOT_REGISTERED",
          message: "Gọi /api/devices/register trước khi gửi số liệu.",
        });
    if (Math.abs(Date.now() - Date.parse(sample.timestamp)) > 600000)
      return res
        .status(400)
        .json({ error: "Đồng hồ thiết bị lệch quá 10 phút. Hãy đồng bộ NTP." });
    try {
      res.status(202).json(await store.ingest(sample, device));
    } catch (error) {
      if (["OUT_OF_ORDER", "ENERGY_JUMP"].includes(error.message))
        return res.status(409).json({ error: error.message });
      throw error;
    }
  });
  app.use("/api", async (req, res, next) => {
    const token = req.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return res.status(401).json({ error: "Vui lòng đăng nhập" });
    try {
      req.user = await verifyToken(token);
    } catch {
      return res
        .status(401)
        .json({ error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn" });
    }
    if (
      !req.user.email ||
      (accessMode !== "registered" &&
        !allowedEmails.includes(req.user.email.toLowerCase()))
    )
      return res
        .status(403)
        .json({ error: "Tài khoản chưa được cấp quyền giám sát hệ thống" });
    next();
  });
  app.get("/api/bootstrap", async (req, res) => {
    const devices = await store.listDevices();
    const today = localDay();
    const data = await store.snapshot(today);
    res.json({
      cabinets,
      devices: devices.map((d) => {
        const latest = data.readings.find((r) => r.deviceId === d.id);
        return {
          ...d,
          latest: latest || null,
          online: !!latest && Date.now() - Date.parse(latest.timestamp) < 60000,
        };
      }),
      incidents: data.incidents,
      incidentHistoryLimit: 200,
      todayKwh: data.days.some((r) => r.date === today)
        ? data.days
            .filter((r) => r.date === today)
            .reduce((s, r) => s + r.kwh, 0)
        : null,
      monthKwh: data.days.length
        ? data.days.reduce((s, r) => s + r.kwh, 0)
        : null,
      dailyByDevice: Object.fromEntries(
        devices.map((d) => {
          const rows = data.days.filter(
            (r) => r.date === today && r.deviceId === d.id,
          );
          return [
            d.id,
            rows.length ? rows.reduce((s, r) => s + r.kwh, 0) : null,
          ];
        }),
      ),
      serverTime: new Date().toISOString(),
    });
  });
  app.get("/api/energy", async (req, res) => {
    const devices = await store.listDevices();
    const period = req.query.period || "week",
      anchor = req.query.anchor || localDay();
    let range;
    try {
      range = rangeFor(period, anchor);
    } catch {
      return res
        .status(400)
        .json({ error: "Khoảng thời gian/ngày không hợp lệ" });
    }
    const deviceId = req.query.deviceId;
    if (deviceId && !devices.some((d) => d.id === deviceId))
      return res.status(400).json({ error: "Thiết bị không tồn tại" });
    const rows = await store.energy(range.start, range.end);
    res.json({
      period,
      anchor,
      rows: aggregateEnergy(
        deviceId ? rows.filter((r) => r.deviceId === deviceId) : rows,
        range,
        period,
        devices,
      ),
      note: "Chỉ tính khoảng đo hợp lệ; khoảng mất dữ liệu trên 15 phút bị bỏ qua. Khoảng qua nửa đêm được phân bổ theo thời gian.",
    });
  });
  app.patch("/api/incidents/:id/resolve", async (req, res) => {
    if (!/^[a-zA-Z0-9_-]{1,150}$/.test(req.params.id))
      return res.status(400).json({ error: "Mã sự cố không hợp lệ" });
    const note = req.body?.note;
    if (
      typeof note !== "string" ||
      note.trim().length < 5 ||
      note.length > 1000
    )
      return res
        .status(400)
        .json({ error: "Nhập ghi chú xử lý từ 5 đến 1000 ký tự" });
    const status = await store.resolve(
      req.params.id,
      note.trim(),
      req.user.email,
    );
    if (status === "missing")
      return res.status(404).json({ error: "Không tìm thấy sự cố" });
    if (status === "active")
      return res.status(409).json({
        error:
          "Thiết bị vẫn đang báo lỗi. Chờ thông số trở về bình thường trước khi hoàn tất xử lý.",
      });
    res.json({ ok: true });
  });
  app.use((req, res) => res.status(404).json({ error: "Không tìm thấy API" }));
  app.use((error, req, res, next) => {
    console.error(error.message);
    res.status(error.status === 400 ? 400 : 500).json({
      error:
        error.status === 400
          ? "JSON không hợp lệ"
          : "Không thể xử lý yêu cầu. Vui lòng thử lại.",
    });
  });
  return app;
}
