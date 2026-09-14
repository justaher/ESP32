import { FieldValue } from "firebase-admin/firestore";
import { energyDelta, detectedFaults } from "./domain.js";
export function firestoreStore(db) {
  return {
    async ingest(sample, device) {
      const readingRef = db.collection("readings").doc(sample.deviceId);
      const sampleRef = db
        .collection("telemetry")
        .doc(`${sample.deviceId}_${sample.sampleId}`);
      const stateRef = db.collection("deviceStates").doc(sample.deviceId);
      return db.runTransaction(async (tx) => {
        const [previous, duplicate, stateDoc] = await tx.getAll(
          readingRef,
          sampleRef,
          stateRef,
        );
        if (duplicate.exists) return { accepted: true, duplicate: true };
        const delta = energyDelta(previous.data(), sample, device.ratedPowerW);
        const faults = detectedFaults(sample, device.thresholds);
        const active = { ...(stateDoc.data()?.active || {}) };
        const now = new Date().toISOString();
        for (const [code, id] of Object.entries(active)) {
          if (!faults.some((f) => f.code === code)) {
            tx.update(db.collection("incidents").doc(id), {
              active: false,
              recoveredAt: now,
            });
            delete active[code];
          }
        }
        for (const fault of faults) {
          if (active[fault.code])
            tx.update(db.collection("incidents").doc(active[fault.code]), {
              lastSeenAt: now,
            });
          else {
            const ref = db.collection("incidents").doc();
            active[fault.code] = ref.id;
            tx.set(ref, {
              ...fault,
              deviceId: device.id,
              cabinetId: device.cabinetId,
              status: "open",
              active: true,
              createdAt: now,
              lastSeenAt: now,
              recoveredAt: null,
              resolvedAt: null,
              note: null,
            });
          }
        }
        if (delta.reason === "counter_reset" || delta.reason === "gap") {
          tx.set(db.collection("incidents").doc(), {
            deviceId: device.id,
            cabinetId: device.cabinetId,
            code: delta.reason,
            message:
              delta.reason === "counter_reset"
                ? "Bộ đếm điện năng bị đặt lại"
                : "Khoảng đo bị gián đoạn trên 15 phút",
            severity: "warning",
            status: "open",
            active: false,
            createdAt: now,
            lastSeenAt: now,
            recoveredAt: now,
            resolvedAt: null,
            note: null,
          });
        }
        for (const part of delta.portions)
          tx.set(
            db.collection("energyDaily").doc(`${device.id}_${part.date}`),
            {
              deviceId: device.id,
              cabinetId: device.cabinetId,
              date: part.date,
              kwh: FieldValue.increment(part.kwh),
              coverageSeconds: FieldValue.increment(part.coverageSeconds),
            },
            { merge: true },
          );
        tx.set(readingRef, {
          ...sample,
          receivedAt: now,
          quality: delta.reason,
        });
        tx.set(sampleRef, {
          ...sample,
          receivedAt: now,
          expiresAt: new Date(Date.now() + 30 * 86400000),
        });
        tx.set(stateRef, { active });
        return {
          accepted: true,
          duplicate: false,
          energyQuality: delta.reason || "measured",
        };
      });
    },
    async snapshot(today) {
      const [readings, open, recent, days] = await Promise.all([
        db.collection("readings").get(),
        db.collection("incidents").where("status", "==", "open").get(),
        db
          .collection("incidents")
          .orderBy("createdAt", "desc")
          .limit(200)
          .get(),
        db
          .collection("energyDaily")
          .where("date", ">=", today.slice(0, 7) + "-01")
          .where("date", "<=", today)
          .get(),
      ]);
      const incidents = new Map(
        [...recent.docs, ...open.docs].map((d) => [
          d.id,
          { id: d.id, ...d.data() },
        ]),
      );
      return {
        readings: readings.docs.map((d) => d.data()),
        incidents: [...incidents.values()].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        ),
        days: days.docs.map((d) => d.data()),
      };
    },
    async energy(start, end) {
      return (
        await db
          .collection("energyDaily")
          .where("date", ">=", start)
          .where("date", "<=", end)
          .get()
      ).docs.map((d) => d.data());
    },
    async resolve(id, note, email) {
      return db.runTransaction(async (tx) => {
        const ref = db.collection("incidents").doc(id),
          doc = await tx.get(ref);
        if (!doc.exists) return "missing";
        if (doc.data().active) return "active";
        if (doc.data().status === "resolved") return "ok";
        tx.update(ref, {
          status: "resolved",
          note,
          resolvedBy: email,
          resolvedAt: new Date().toISOString(),
        });
        return "ok";
      });
    },
  };
}
