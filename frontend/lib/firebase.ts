import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const firebaseConfigured = !!(
  config.apiKey &&
  config.authDomain &&
  config.projectId &&
  config.appId
);
export function auth() {
  return getAuth(getApps().length ? getApp() : initializeApp(config));
}
export const apiOrigin = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
).replace(/\/$/, "");
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const user = auth().currentUser;
  if (!user) throw new Error("Vui lòng đăng nhập để tiếp tục.");
  const token = await user.getIdToken();
  const response = await fetch(apiOrigin + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Không thể tải dữ liệu.",
    );
  return data as T;
}
