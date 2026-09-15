import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createApp } from "./app.js";
import { firestoreStore } from "./store.js";

for (const key of [
  "FIREBASE_PROJECT_ID",
  "DEVICE_KEYS_JSON",
  "FRONTEND_ORIGIN",
])
  if (!process.env[key])
    throw new Error(`Thiếu ${key}. Xem backend/.env.example`);
const accessMode = process.env.ACCESS_MODE || "allowlist";
if (!["registered", "allowlist"].includes(accessMode))
  throw new Error("ACCESS_MODE phải là registered hoặc allowlist");
const allowedEmails = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
if (accessMode === "allowlist" && !allowedEmails.length)
  throw new Error("ALLOWED_EMAILS không được trống khi ACCESS_MODE=allowlist");
const deviceKeys = JSON.parse(process.env.DEVICE_KEYS_JSON);
for (const [id, key] of Object.entries(deviceKeys))
  if (
    !/^[a-z0-9-]{1,50}$/.test(id) ||
    typeof key !== "string" ||
    key.length < 32 ||
    key.startsWith("replace-")
  )
    throw new Error(`Khóa thiết bị ${id} chưa hợp lệ`);
initializeApp({
  credential: applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
});
const app = createApp({
  store: firestoreStore(getFirestore()),
  verifyToken: (token) => getAuth().verifyIdToken(token, true),
  allowedEmails,
  accessMode,
  deviceKeys,
  frontendOrigin: process.env.FRONTEND_ORIGIN,
});
const server = app.listen(
  Number(process.env.PORT || 4000),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      `PowerGrid API: http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 4000}`,
    ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
