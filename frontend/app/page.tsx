"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import type { User } from "firebase/auth";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Bolt,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CircuitBoard,
  Download,
  Fan,
  LayoutDashboard,
  Lightbulb,
  LoaderCircle,
  LogOut,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Thermometer,
  Waves,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, auth, firebaseConfigured } from "../lib/firebase";
import { dayKey, demoEnergy, demoSnapshot } from "../lib/demo";
import type {
  Cabinet,
  Device,
  EnergyRow,
  Incident,
  Period,
  Snapshot,
} from "../lib/types";
import { EnergyChart } from "../components/EnergyChart";

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null
    ? "—"
    : n.toLocaleString("vi-VN", { maximumFractionDigits: digits });
const time = (s: string) =>
  new Date(s).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
const navigation: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "cabinet-1", label: "Tủ điện 01", icon: Server },
  { id: "cabinet-2", label: "Tủ điện 02", icon: CircuitBoard },
  { id: "analytics", label: "Phân tích điện năng", icon: ChartNoAxesCombined },
  { id: "incidents", label: "Cảnh báo & sự cố", icon: Bell },
];
const typeIcons: Record<string, LucideIcon> = {
  light: Lightbulb,
  fan: Fan,
  pump: Waves,
  motor: CircuitBoard,
};
const sum = (values: (number | null | undefined)[]) =>
  values.some((v) => v != null)
    ? values.reduce<number>((s, v) => s + (v ?? 0), 0)
    : null;

export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(!firebaseConfigured),
    [demo, setDemo] = useState(false);
  const [page, setPage] = useState("overview"),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0);
  const [period, setPeriod] = useState<Period>("week"),
    [anchor, setAnchor] = useState(dayKey());
  const [energyResult, setEnergyResult] = useState<{
    key: string;
    rows: EnergyRow[];
    error: string;
  } | null>(null);
  const energyKey = `${period}/${anchor}/${selectedId || "all"}/${tick}`;
  const rows = demo
    ? demoEnergy(period, anchor, selectedId || undefined)
    : energyResult?.key === energyKey
      ? energyResult.rows
      : [];
  const energyError =
    !demo && energyResult?.key === energyKey ? energyResult.error : "";
  const energyLoading = !demo && energyResult?.key !== energyKey;
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [resolveTarget, setResolveTarget] = useState<Incident | null>(null),
    [note, setNote] = useState(""),
    [saving, setSaving] = useState(false),
    [resolveError, setResolveError] = useState("");
  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(auth(), (u) => {
      setUser(u);
      setAuthReady(true);
      if (!u) setData(null);
    });
  }, []);
  const navigate = useCallback((next: string, id: string | null = null) => {
    setPage(next);
    setSelectedId(id);
    setQuery("");
    setFilter("all");
  }, []);
  useEffect(() => {
    if (demo || !user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    const refresh = async () => {
      controller = new AbortController();
      try {
        const result = await api<Snapshot>("/api/bootstrap", {
          signal: controller.signal,
        });
        if (!cancelled) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Không thể kết nối backend",
          );
      } finally {
        if (!cancelled) {
          setBusy(false);
          timer = setTimeout(refresh, 10000);
        }
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      controller?.abort();
      clearTimeout(timer);
    };
  }, [user, demo, tick]);
  useEffect(() => {
    if (demo || !user) return;
    let cancelled = false;
    const controller = new AbortController();
    const params = new URLSearchParams({ period, anchor });
    if (selectedId) params.set("deviceId", selectedId);
    api<{ rows: EnergyRow[] }>("/api/energy?" + params, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!cancelled)
          setEnergyResult({ key: energyKey, rows: result.rows, error: "" });
      })
      .catch((e) => {
        if (!cancelled)
          setEnergyResult({
            key: energyKey,
            rows: [],
            error: e instanceof Error ? e.message : "Không tải được biểu đồ",
          });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user, demo, period, anchor, selectedId, energyKey]);
  useEffect(() => {
    if (!user || demo) return;
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, [user, demo]);
  useEffect(() => {
    if (!resolveTarget) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) setResolveTarget(null);
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [resolveTarget, saving]);

  async function logout() {
    try {
      if (demo) setDemo(false);
      else await signOut(auth());
      setData(null);
      setEnergyResult(null);
      setError("");
      navigate("overview");
    } catch {
      setError("Chưa đăng xuất được. Vui lòng thử lại.");
    }
  }
  async function resolve(e: FormEvent) {
    e.preventDefault();
    if (!resolveTarget) return;
    setSaving(true);
    setResolveError("");
    try {
      if (demo)
        setData((previous) =>
          previous
            ? {
                ...previous,
                incidents: previous.incidents.map((i) =>
                  i.id === resolveTarget.id
                    ? {
                        ...i,
                        status: "resolved",
                        note: note.trim(),
                        resolvedAt: new Date().toISOString(),
                        resolvedBy: "Người xem thử",
                      }
                    : i,
                ),
              }
            : previous,
        );
      else {
        await api("/api/incidents/" + resolveTarget.id + "/resolve", {
          method: "PATCH",
          body: JSON.stringify({ note }),
        });
        setTick((t) => t + 1);
      }
      setResolveTarget(null);
      setNote("");
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : "Không thể lưu xử lý");
    } finally {
      setSaving(false);
    }
  }
  function openResolve(incident: Incident) {
    setResolveTarget(incident);
    setNote("");
    setResolveError("");
  }
  function exportCsv() {
    const content =
      "\uFEFFNgày,Tủ chiếu sáng (kWh),Tủ động lực (kWh),Tổng (kWh)\r\n" +
      rows
        .map((r) =>
          [r.date, r.cabinet1 ?? "", r.cabinet2 ?? "", r.total ?? ""].join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `powergrid-${demo ? "demo-" : ""}${period}-${anchor}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!authReady)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" /> Đang kiểm tra phiên đăng nhập…
      </div>
    );
  if (!user && !demo)
    return (
      <Login
        onDemo={() => {
          setError("");
          setData(demoSnapshot());
          setDemo(true);
        }}
      />
    );
  const openIncidents =
    data?.incidents.filter((i) => i.status === "open") || [];
  const cabinet = data?.cabinets.find((c) => c.id === page),
    device = data?.devices.find((d) => d.id === selectedId);
  const cabinetDevices =
    data?.devices.filter((d) => d.cabinetId === page) || [];
  const matchingDevices = (
    device ? [device] : cabinet ? cabinetDevices : data?.devices || []
  ).filter((d) =>
    (d.name + " " + d.id).toLowerCase().includes(query.toLowerCase()),
  );
  const incidents = (data?.incidents || []).filter(
    (i) =>
      (!device || i.deviceId === device.id) &&
      (!cabinet || i.cabinetId === cabinet.id) &&
      (filter === "all" || i.status === filter) &&
      (i.message + " " + data?.devices.find((d) => d.id === i.deviceId)?.name)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const title = device
    ? device.name
    : cabinet
      ? cabinet.name
      : page === "analytics"
        ? "Phân tích điện năng"
        : page === "incidents"
          ? "Cảnh báo & sự cố"
          : "Tổng quan hệ thống";
  const power = data
    ? sum(
        data.devices
          .filter((d) => d.online && !error)
          .map((d) => d.latest?.powerW),
      )
    : null;
  const chartPanel = (
    <section className="panel">
      <div className="section-title">
        <div>
          <h2>Điện năng tiêu thụ</h2>
          <p className="panel-caption">
            {device ? device.name : "So sánh hai tủ điện"} · kWh
          </p>
        </div>
        <div className="chart-controls">
          <div className="segmented">
            {(["week", "month", "year"] as Period[]).map((p, i) => (
              <button
                key={p}
                className={period === p ? "selected" : ""}
                onClick={() => setPeriod(p)}
              >
                {["Tuần", "Tháng", "Năm"][i]}
              </button>
            ))}
          </div>
          <input
            aria-label="Ngày trong khoảng thống kê"
            type="date"
            value={anchor}
            max={dayKey()}
            min="2020-01-01"
            onChange={(e) => {
              if (e.target.value) setAnchor(e.target.value);
            }}
          />
        </div>
      </div>
      {energyError ? (
        <div className="error-box" role="alert">
          {energyError}
        </div>
      ) : energyLoading ? (
        <div className="empty chart-empty">
          <LoaderCircle className="spin" /> Đang tải biểu đồ…
        </div>
      ) : (
        <EnergyChart rows={rows} device={!!device} />
      )}
      <div className="chart-note">
        {demo
          ? "Dữ liệu minh họa, không phản ánh mức tiêu thụ thực tế."
          : "Thời gian Việt Nam (UTC+7). Khoảng mất dữ liệu trên 15 phút không được tính; biểu đồ cập nhật mỗi phút."}
      </div>
    </section>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Bolt /> POWERGRID<small>INDUSTRIAL MONITOR</small>
        </div>
        <div className="workspace">
          <span className="dot" /> Hệ thống giám sát điện
          <small>Nhà máy · Khu vực A & B</small>
        </div>
        <p className="nav-label">KHÔNG GIAN LÀM VIỆC</p>
        <nav aria-label="Điều hướng chính">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "incidents" && openIncidents.length > 0 && (
                <b className="nav-count">{openIncidents.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Radio size={16} /> ESP32 Gateway{" "}
          <span className={"pill " + (demo ? "amber" : "gray")}>
            {demo ? "DEMO" : "HTTP"}
          </span>
          <p>
            {demo ? "Chưa kết nối phần cứng" : "Cập nhật số liệu mỗi 10 giây"}
          </p>
          <div className="account">
            <div className="avatar">
              {demo ? "KT" : user?.email?.slice(0, 2).toUpperCase()}
            </div>
            <div className="account-text">
              {demo ? "Kỹ thuật viên" : user?.email}
              <small>{demo ? "Chế độ xem thử" : "Tài khoản Firebase"}</small>
            </div>
            <button
              className="icon-button"
              title="Đăng xuất"
              aria-label="Đăng xuất"
              onClick={logout}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header>
          <span>
            Không gian làm việc{" "}
            <b>/ {navigation.find((n) => n.id === page)?.label}</b>
          </span>
          <div>
            <span className={"status-text " + (error ? "text-warning" : "")}>
              <span className="dot" />
              {demo
                ? "Dữ liệu minh họa"
                : error
                  ? "Mất kết nối API"
                  : "Chế độ trực tiếp"}
            </span>
            <button
              className="icon-button notification"
              aria-label={`${openIncidents.length} cảnh báo chưa xử lý`}
              onClick={() => {
                navigate("incidents");
                setFilter("open");
              }}
            >
              <Bell size={19} />
              {openIncidents.length > 0 && <i />}
            </button>
            <button
              className="icon-button mobile-logout"
              onClick={logout}
              aria-label="Đăng xuất"
            >
              <LogOut size={18} />
            </button>
            <div className="avatar">
              {demo ? "KT" : user?.email?.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>
        <main>
          <div className="eyebrow">
            POWER MONITORING /{" "}
            {device
              ? "DEVICE DETAILS"
              : page === "overview"
                ? "OVERVIEW"
                : page === "analytics"
                  ? "ANALYTICS"
                  : page === "incidents"
                    ? "INCIDENT CENTER"
                    : "CABINET DETAILS"}
          </div>
          {device && (
            <button className="back-button" onClick={() => setSelectedId(null)}>
              <ArrowLeft size={14} /> Quay lại {cabinet?.name}
            </button>
          )}
          <div className="heading-row">
            <div>
              <h1>{title}</h1>
              <p className="subtitle">
                {device
                  ? "Thông số vận hành, điện năng và lịch sử sự cố của thiết bị."
                  : cabinet
                    ? cabinet.description
                    : page === "incidents"
                      ? "Theo dõi, kiểm tra và lưu lại quá trình xử lý sự cố."
                      : page === "analytics"
                        ? "Hiểu mức tiêu thụ. Chủ động tối ưu vận hành."
                        : "Theo dõi vận hành và điện năng của bạn, trong một không gian."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="subtle-button"
                disabled={busy}
                onClick={() => setTick((t) => t + 1)}
              >
                <RefreshCw size={14} className={busy ? "spin" : ""} /> Làm mới
              </button>
              {page === "analytics" && (
                <button
                  className="primary-button compact"
                  onClick={exportCsv}
                  disabled={energyLoading || !rows.length}
                >
                  <Download size={14} /> Xuất CSV
                </button>
              )}
            </div>
          </div>
          {demo ? (
            <div className="demo-banner">
              <ShieldCheck size={17} /> Chế độ xem thử · Toàn bộ số liệu là dữ
              liệu mẫu. Các thay đổi sẽ mất khi tải lại trang.
            </div>
          ) : (
            <div className="live-banner">
              {data
                ? `Lần đồng bộ gần nhất: ${time(data.serverTime)}`
                : "Đang kết nối hệ thống…"}{" "}
              · UTC+7
            </div>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}{" "}
              {data &&
                "Số liệu hiển thị là bản đồng bộ gần nhất, không phải số liệu hiện tại."}
            </div>
          )}
          {!data ? (
            <div className="empty panel">
              {error ? (
                "Kiểm tra cấu hình backend và quyền truy cập Firebase, sau đó bấm Làm mới."
              ) : (
                <>
                  <LoaderCircle className="spin" /> Đang tải hệ thống…
                </>
              )}
            </div>
          ) : (
            <>
              {page === "overview" && (
                <>
                  <div className="stats">
                    <Stat
                      label="ĐIỆN NĂNG HÔM NAY"
                      value={data.todayKwh}
                      unit="kWh"
                      icon={Bolt}
                      caption="Tổng tiêu thụ ghi nhận của 2 tủ"
                    />
                    <Stat
                      label="CÔNG SUẤT HIỆN TẠI"
                      value={power == null ? null : power / 1000}
                      unit="kW"
                      icon={Activity}
                      caption={`${data.devices.filter((d) => d.online && !error).length}/${data.devices.length} thiết bị có dữ liệu mới`}
                    />
                    <Stat
                      label="ĐIỆN NĂNG THÁNG NÀY"
                      value={data.monthKwh}
                      unit="kWh"
                      icon={ChartNoAxesCombined}
                      caption="Tích lũy từ đầu tháng"
                    />
                    <Stat
                      label="CẢNH BÁO CHƯA XỬ LÝ"
                      value={openIncidents.length}
                      unit="sự cố"
                      icon={Bell}
                      caption="Xem danh sách cần kiểm tra"
                      warning
                      onClick={() => {
                        navigate("incidents");
                        setFilter("open");
                      }}
                    />
                  </div>
                  <div className="section-title">
                    <h2>
                      Hệ thống tủ điện <span>02 TỦ</span>
                    </h2>
                    <span>Chọn tủ để xem thiết bị ↗</span>
                  </div>
                  <div className="cabinet-grid">
                    {data.cabinets.map((c) => (
                      <CabinetCard
                        key={c.id}
                        cabinet={c}
                        devices={data.devices.filter(
                          (d) => d.cabinetId === c.id,
                        )}
                        daily={data.dailyByDevice}
                        incidents={
                          openIncidents.filter((i) => i.cabinetId === c.id)
                            .length
                        }
                        stale={!!error}
                        onClick={() => navigate(c.id)}
                      />
                    ))}
                  </div>
                  <div className="overview-bottom">
                    <div>{chartPanel}</div>
                    <section className="panel alert-panel">
                      <div className="section-title">
                        <h2>
                          Cần chú ý <span>{openIncidents.length}</span>
                        </h2>
                        <Bell size={16} />
                      </div>
                      {openIncidents.length ? (
                        openIncidents.slice(0, 3).map((i) => (
                          <button
                            key={i.id}
                            className="alert-item"
                            onClick={() => navigate(i.cabinetId, i.deviceId)}
                          >
                            <span
                              className={
                                "pill " +
                                (i.severity === "critical" ? "red" : "amber")
                              }
                            >
                              {i.active ? "Đang có lỗi" : "Chờ xác nhận"}
                            </span>
                            <h3>
                              {
                                data.devices.find((d) => d.id === i.deviceId)
                                  ?.name
                              }
                            </h3>
                            <p>{i.message}</p>
                            <small>{time(i.createdAt)}</small>
                            <ArrowUpRight size={16} />
                          </button>
                        ))
                      ) : (
                        <div className="empty">
                          <ShieldCheck />
                          Không có cảnh báo chưa xử lý.
                        </div>
                      )}
                      <button
                        className="text-button"
                        onClick={() => navigate("incidents")}
                      >
                        Xem tất cả sự cố <ChevronRight size={14} />
                      </button>
                    </section>
                  </div>
                </>
              )}
              {cabinet && !device && (
                <>
                  <div className="cabinet-summary">
                    <div>
                      <span className="eyebrow">VỊ TRÍ LẮP ĐẶT</span>
                      <strong>{cabinet.location}</strong>
                    </div>
                    <div>
                      <span className="eyebrow">CÔNG SUẤT HIỆN TẠI</span>
                      <strong>
                        {fmt(
                          sum(
                            cabinetDevices
                              .filter((d) => d.online && !error)
                              .map((d) =>
                                d.latest?.powerW == null
                                  ? null
                                  : d.latest.powerW / 1000,
                              ),
                          ),
                        )}{" "}
                        <small>kW</small>
                      </strong>
                    </div>
                    <div>
                      <span className="eyebrow">TIÊU THỤ HÔM NAY</span>
                      <strong>
                        {fmt(
                          sum(
                            cabinetDevices.map((d) => data.dailyByDevice[d.id]),
                          ),
                        )}{" "}
                        <small>kWh</small>
                      </strong>
                    </div>
                    <div>
                      <span className="eyebrow">KẾT NỐI</span>
                      <strong>
                        {
                          cabinetDevices.filter((d) => d.online && !error)
                            .length
                        }
                        /{cabinetDevices.length} <small>thiết bị</small>
                      </strong>
                    </div>
                  </div>
                  <section className="panel schematic">
                    <div className="section-title">
                      <h2>Sơ đồ thiết bị</h2>
                      <span>Chọn thiết bị để xem thông số</span>
                    </div>
                    <div className="bus-source">
                      <Server size={23} />
                      <strong>{cabinet.name}</strong>
                      <small>ESP32 · Giám sát phụ tải</small>
                    </div>
                    <div className="bus-line" />
                    <div className="device-grid">
                      {cabinetDevices.map((d) => (
                        <DeviceCard
                          key={d.id}
                          device={d}
                          daily={data.dailyByDevice[d.id]}
                          issues={
                            openIncidents.filter((i) => i.deviceId === d.id)
                              .length
                          }
                          stale={!!error}
                          onClick={() => setSelectedId(d.id)}
                        />
                      ))}
                    </div>
                  </section>
                  <div className="section-title">
                    <h2>Danh sách thiết bị</h2>
                    <SearchBox value={query} onChange={setQuery} />
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Thiết bị</th>
                          <th>Kết nối</th>
                          <th>Điện áp</th>
                          <th>Dòng điện</th>
                          <th>Công suất</th>
                          <th>Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matchingDevices.map((d) => (
                          <tr key={d.id}>
                            <td>
                              {d.name}
                              <small>{d.id}</small>
                            </td>
                            <td>
                              <Connection device={d} stale={!!error} />
                            </td>
                            <td>{fmt(d.latest?.voltage)} V</td>
                            <td>{fmt(d.latest?.current)} A</td>
                            <td>
                              {fmt(
                                d.latest?.powerW == null
                                  ? null
                                  : d.latest.powerW / 1000,
                              )}{" "}
                              kW
                            </td>
                            <td>
                              <button
                                className="text-button"
                                onClick={() => setSelectedId(d.id)}
                              >
                                Xem <ArrowUpRight size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!matchingDevices.length && (
                      <div className="empty">Không tìm thấy thiết bị.</div>
                    )}
                  </div>
                </>
              )}
              {device && (
                <>
                  <div className="device-heading">
                    <span className="device-code">
                      {device.id.toUpperCase()}
                    </span>
                    <Connection device={device} stale={!!error} />
                    <span>
                      Lần đo:{" "}
                      {device.latest
                        ? time(device.latest.timestamp)
                        : "Chưa nhận dữ liệu"}
                    </span>
                  </div>
                  {(!device.online || error) && (
                    <div className="demo-banner">
                      Thiết bị chưa có dữ liệu mới. Thông số dưới đây là lần đo
                      gần nhất, nếu có.
                    </div>
                  )}
                  <div className="stats">
                    <Stat
                      label="ĐIỆN ÁP"
                      value={device.latest?.voltage}
                      unit="V"
                      icon={Bolt}
                      caption={`Ngưỡng ${device.thresholds.minVoltage}–${device.thresholds.maxVoltage} V`}
                    />
                    <Stat
                      label="DÒNG ĐIỆN"
                      value={device.latest?.current}
                      unit="A"
                      icon={Activity}
                      caption={`Giới hạn ${device.thresholds.maxCurrent} A`}
                    />
                    <Stat
                      label="CÔNG SUẤT"
                      value={device.latest ? device.latest.powerW / 1000 : null}
                      unit="kW"
                      icon={ChartNoAxesCombined}
                      caption="Công suất tác dụng lần đo cuối"
                    />
                    <Stat
                      label="ĐIỆN NĂNG HÔM NAY"
                      value={data.dailyByDevice[device.id]}
                      unit="kWh"
                      icon={Bolt}
                      caption="Điện năng đã ghi nhận"
                    />
                  </div>
                  <div className="secondary-metrics">
                    <div>
                      <Waves size={16} /> Tần số{" "}
                      <strong>{fmt(device.latest?.frequency)} Hz</strong>
                    </div>
                    <div>
                      <Activity size={16} /> Hệ số công suất{" "}
                      <strong>{fmt(device.latest?.powerFactor)}</strong>
                    </div>
                    <div>
                      <Thermometer size={16} /> Nhiệt độ{" "}
                      <strong>{fmt(device.latest?.temperature)} °C</strong>
                    </div>
                    <div>
                      <Bolt size={16} /> Bộ đếm tích lũy{" "}
                      <strong>{fmt(device.latest?.energyKwh)} kWh</strong>
                    </div>
                  </div>
                  {chartPanel}
                </>
              )}
              {page === "analytics" && (
                <>
                  <div className="stats analytics-stats">
                    <Stat
                      label="TỔNG KỲ ĐANG CHỌN"
                      value={sum(rows.map((r) => r.total))}
                      unit="kWh"
                      icon={Bolt}
                      caption="Theo khoảng thời gian bên dưới"
                    />
                    <Stat
                      label="TỦ ĐIỆN CHIẾU SÁNG"
                      value={sum(rows.map((r) => r.cabinet1))}
                      unit="kWh"
                      icon={Lightbulb}
                      caption="Khu vực A"
                    />
                    <Stat
                      label="TỦ ĐIỆN ĐỘNG LỰC"
                      value={sum(rows.map((r) => r.cabinet2))}
                      unit="kWh"
                      icon={CircuitBoard}
                      caption="Khu vực B"
                    />
                  </div>
                  {chartPanel}
                  <section className="panel">
                    <div className="section-title">
                      <h2>Bảng thống kê điện năng</h2>
                      <span>Đơn vị: kWh</span>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{period === "year" ? "Tháng" : "Ngày"}</th>
                            <th>Tủ chiếu sáng</th>
                            <th>Tủ động lực</th>
                            <th>Tổng tiêu thụ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.date}>
                              <td>{r.date}</td>
                              <td>{fmt(r.cabinet1)}</td>
                              <td>{fmt(r.cabinet2)}</td>
                              <td className="number-highlight">
                                {fmt(r.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="chart-note">
                      Dấu “—” nghĩa là chưa có số liệu. Tổng kỳ chỉ bao gồm điện
                      năng đã ghi nhận.
                    </p>
                  </section>
                </>
              )}
              {(page === "incidents" || device) && (
                <section className="panel">
                  <div className="section-title">
                    <div>
                      <h2>
                        {device
                          ? "Lịch sử sự cố thiết bị"
                          : "Trung tâm cảnh báo"}{" "}
                        <span>{incidents.length}</span>
                      </h2>
                      <p className="panel-caption">
                        Tất cả cảnh báo đang mở và tối đa 200 sự cố gần nhất
                        toàn hệ thống.
                      </p>
                    </div>
                    <div className="chart-controls">
                      <SearchBox value={query} onChange={setQuery} />
                      <select
                        aria-label="Lọc trạng thái sự cố"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="all">Tất cả trạng thái</option>
                        <option value="open">Chưa xử lý</option>
                        <option value="resolved">Đã xử lý</option>
                      </select>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Thời gian</th>
                          <th>Thiết bị / Sự cố</th>
                          <th>Mức độ</th>
                          <th>Trạng thái</th>
                          <th>Xử lý</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incidents.map((i) => (
                          <tr key={i.id}>
                            <td className="nowrap">{time(i.createdAt)}</td>
                            <td>
                              <button
                                className="device-link"
                                onClick={() =>
                                  navigate(i.cabinetId, i.deviceId)
                                }
                              >
                                {
                                  data.devices.find((d) => d.id === i.deviceId)
                                    ?.name
                                }
                              </button>
                              <small>{i.message}</small>
                              {i.note && (
                                <small className="resolution-note">
                                  Ghi chú: {i.note}
                                  {i.resolvedAt && ` · ${time(i.resolvedAt)}`}
                                  {i.resolvedBy && ` · ${i.resolvedBy}`}
                                </small>
                              )}
                            </td>
                            <td>
                              <span
                                className={
                                  "pill " +
                                  (i.severity === "critical" ? "red" : "amber")
                                }
                              >
                                {i.severity === "critical"
                                  ? "Nghiêm trọng"
                                  : "Cảnh báo"}
                              </span>
                            </td>
                            <td>
                              <span
                                className={
                                  "pill " +
                                  (i.status === "resolved"
                                    ? ""
                                    : i.active
                                      ? "red"
                                      : "amber")
                                }
                              >
                                {i.status === "resolved"
                                  ? "Đã xử lý"
                                  : i.active
                                    ? "Đang có lỗi"
                                    : "Chờ xác nhận"}
                              </span>
                            </td>
                            <td>
                              {i.status === "resolved" ? (
                                <Check size={17} color="#71d9ac" />
                              ) : (
                                <button
                                  className="subtle-button"
                                  disabled={i.active}
                                  title={
                                    i.active
                                      ? "Chờ thiết bị trở về ngưỡng bình thường"
                                      : "Nhập ghi chú xử lý"
                                  }
                                  onClick={() => openResolve(i)}
                                >
                                  Hoàn tất xử lý
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!incidents.length && (
                      <div className="empty">
                        <ShieldCheck /> Không có sự cố phù hợp bộ lọc.
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
          <footer>
            <span>
              <span className="dot" /> PowerGrid · Industrial Power Monitor
            </span>
            <span>Giám sát thông minh. Vận hành chủ động.</span>
          </footer>
        </main>
      </div>
      {resolveTarget && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolve-title"
            className="modal"
          >
            <button
              className="icon-button modal-close"
              disabled={saving}
              onClick={() => setResolveTarget(null)}
              aria-label="Đóng"
            >
              <X size={19} />
            </button>
            <div className="eyebrow">INCIDENT RESOLUTION</div>
            <h2 id="resolve-title">Hoàn tất xử lý sự cố</h2>
            <p>{resolveTarget.message}</p>
            <form onSubmit={resolve}>
              <label htmlFor="resolution">Ghi chú xử lý</label>
              <textarea
                id="resolution"
                autoFocus
                required
                minLength={5}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Mô tả nguyên nhân và công việc đã thực hiện…"
              />
              {resolveError && (
                <div className="error-box" role="alert">
                  {resolveError}
                </div>
              )}
              <button
                className="primary-button"
                disabled={saving || note.trim().length < 5}
              >
                {saving ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Check size={17} />
                )}{" "}
                Lưu kết quả xử lý
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function Login({ onDemo }: { onDemo: () => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [registering, setRegistering] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (registering && password !== confirmation) {
      setError("Mật khẩu nhập lại chưa khớp.");
      return;
    }
    if (!firebaseConfigured) {
      setError(
        "Chưa cấu hình Firebase. Bạn có thể dùng chế độ xem thử bên dưới.",
      );
      return;
    }
    setBusy(true);
    try {
      if (registering) {
        await createUserWithEmailAndPassword(auth(), email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth(), email.trim(), password);
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(
        code === "auth/email-already-in-use"
          ? "Email này đã có tài khoản. Hãy đăng nhập hoặc đặt lại mật khẩu."
          : code === "auth/weak-password" ||
              code === "auth/password-does-not-meet-requirements"
            ? "Mật khẩu chưa đủ mạnh. Dùng ít nhất 6 ký tự và đáp ứng chính sách mật khẩu của hệ thống."
            : code === "auth/invalid-email"
              ? "Địa chỉ email không hợp lệ."
              : code === "auth/operation-not-allowed"
                ? "Chức năng email/mật khẩu chưa được bật trong Firebase Authentication."
                : code === "auth/too-many-requests"
                  ? "Có quá nhiều yêu cầu. Vui lòng thử lại sau."
                  : code === "auth/network-request-failed"
                    ? "Không thể kết nối Firebase. Kiểm tra mạng."
                    : registering
                      ? "Không thể tạo tài khoản. Vui lòng thử lại hoặc kiểm tra cấu hình Firebase."
                      : "Không thể đăng nhập. Kiểm tra tài khoản, mật khẩu và cấu hình Firebase.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setError("");
    setNotice("");
    if (!firebaseConfigured) {
      setError("Chưa cấu hình Firebase.");
      return;
    }
    if (!email.trim()) {
      setError("Nhập email trước khi yêu cầu đặt lại mật khẩu.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth(), email.trim());
      setNotice(
        "Nếu email hợp lệ, hướng dẫn đặt lại mật khẩu sẽ được gửi đến hộp thư.",
      );
    } catch {
      setError("Chưa gửi được yêu cầu. Kiểm tra email hoặc thử lại sau.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-shell">
      <section className="login-story">
        <div className="brand">
          <Bolt /> POWERGRID<small>INDUSTRIAL MONITOR</small>
        </div>
        <div className="login-copy">
          <div className="eyebrow">KẾT NỐI THIẾT BỊ. HIỂU NĂNG LƯỢNG.</div>
          <h1>
            Mỗi chỉ số.
            <br />
            Một góc nhìn
            <br />
            <em>toàn diện.</em>
          </h1>
          <p>
            Không gian giám sát tủ điện, theo dõi tiêu thụ và quản lý sự cố dành
            cho đội ngũ vận hành.
          </p>
          <div className="login-system">
            <div className="system-node">
              <Server />
              <span>Tủ điện 01</span>
            </div>
            <div className="system-link">
              <i />
              <Bolt />
              <i />
            </div>
            <div className="system-node">
              <CircuitBoard />
              <span>Tủ điện 02</span>
            </div>
          </div>
          <div className="login-features">
            <span>
              <Check size={14} /> Theo dõi thiết bị
            </span>
            <span>
              <Check size={14} /> Thống kê điện năng
            </span>
            <span>
              <Check size={14} /> Cảnh báo sự cố
            </span>
          </div>
        </div>
        <p className="login-footnote">POWERGRID / INDUSTRIAL POWER MONITOR</p>
      </section>
      <section className="login-form-area">
        <div className="login-form">
          <span className="login-symbol">
            <Bolt size={26} />
          </span>
          <div className="eyebrow">
            {registering ? "BẮT ĐẦU VỚI POWERGRID" : "CHÀO MỪNG TRỞ LẠI"}
          </div>
          <h2>{registering ? "Tạo tài khoản" : "Đăng nhập hệ thống"}</h2>
          <p>
            {registering
              ? "Đăng ký để theo dõi hệ thống tủ điện của bạn."
              : "Sẵn sàng cho một ngày vận hành chủ động."}
          </p>
          <form onSubmit={submit}>
            <label htmlFor="email">Địa chỉ email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              disabled={busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ban@congty.com"
            />
            <div className="password-label">
              <label htmlFor="password">Mật khẩu</label>
              {!registering && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={reset}
                >
                  Quên mật khẩu?
                </button>
              )}
            </div>
            <input
              id="password"
              type="password"
              autoComplete={registering ? "new-password" : "current-password"}
              required
              disabled={busy}
              minLength={registering ? 6 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
            />
            {registering && (
              <>
                <div className="password-label">
                  <label htmlFor="password-confirmation">
                    Nhập lại mật khẩu
                  </label>
                </div>
                <input
                  id="password-confirmation"
                  type="password"
                  autoComplete="new-password"
                  required
                  disabled={busy}
                  minLength={6}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                />
                <p className="login-help">
                  Mật khẩu tối thiểu 6 ký tự. Đăng ký thành công sẽ tự đăng
                  nhập.
                </p>
              </>
            )}
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="demo-banner" role="status">
                {notice}
              </div>
            )}
            <button className="primary-button" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={18} /> : null}
              {registering ? "Đăng ký tài khoản" : "Đăng nhập"}{" "}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {registering ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setRegistering(!registering);
                setPassword("");
                setConfirmation("");
                setError("");
                setNotice("");
              }}
            >
              {registering ? "Đăng nhập" : "Đăng ký ngay"}
            </button>
          </p>
          <div className="login-divider">
            <span>KHÁM PHÁ TRƯỚC KHI KẾT NỐI</span>
          </div>
          <button className="demo-button" onClick={onDemo}>
            Xem thử bảng điều khiển <ChevronRight size={17} />
          </button>
          <p className="login-help">
            {firebaseConfigured
              ? "Tài khoản và mật khẩu được quản lý bằng Firebase Authentication."
              : "Chưa kết nối Firebase. Chế độ xem thử dùng dữ liệu minh họa."}
          </p>
        </div>
        <div className="login-security">
          <ShieldCheck size={14} /> Xác thực bằng Firebase Authentication
        </div>
      </section>
    </div>
  );
}
function Stat({
  label,
  value,
  unit,
  icon: Icon,
  caption,
  warning = false,
  onClick,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  icon: LucideIcon;
  caption: string;
  warning?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div>
        {label}
        <Icon size={17} />
      </div>
      <h2>
        {fmt(value)} <small>{unit}</small>
      </h2>
      <p>
        {caption}
        {onClick && <ArrowUpRight size={13} />}
      </p>
      <div className="stat-rule" />
    </>
  );
  return onClick ? (
    <button
      className={"stat stat-click " + (warning ? "warning" : "")}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <article className={"stat " + (warning ? "warning" : "")}>
      {content}
    </article>
  );
}
function Connection({
  device,
  stale = false,
}: {
  device: Device;
  stale?: boolean;
}) {
  return (
    <span className={"pill " + (!device.online || stale ? "gray" : "")}>
      {device.online && !stale
        ? "● Trực tuyến"
        : device.latest
          ? "● Mất kết nối"
          : "● Chưa có dữ liệu"}
    </span>
  );
}
function CabinetCard({
  cabinet,
  devices,
  daily,
  incidents,
  stale,
  onClick,
}: {
  cabinet: Cabinet;
  devices: Device[];
  daily: Record<string, number | null>;
  incidents: number;
  stale: boolean;
  onClick: () => void;
}) {
  const online = devices.filter((d) => d.online && !stale).length;
  return (
    <button className="cabinet-card" onClick={onClick}>
      <div className="cabinet-top">
        <span className="cabinet-icon">
          <Server size={26} />
        </span>
        <span className={"pill " + (online === devices.length ? "" : "amber")}>
          {online}/{devices.length} thiết bị trực tuyến
        </span>
      </div>
      <div className="eyebrow">
        {cabinet.id.toUpperCase().replace("-", " ")} /{" "}
        {cabinet.location.toUpperCase()}
      </div>
      <h2>
        {cabinet.name}
        <ArrowUpRight size={21} />
      </h2>
      <p>{cabinet.description}</p>
      <div className="cabinet-metrics">
        <div>
          Công suất
          <strong>
            {fmt(
              sum(
                devices
                  .filter((d) => d.online && !stale)
                  .map((d) => (d.latest ? d.latest.powerW / 1000 : null)),
              ),
            )}{" "}
            <small>kW</small>
          </strong>
        </div>
        <div>
          Hôm nay
          <strong>
            {fmt(sum(devices.map((d) => daily[d.id])))} <small>kWh</small>
          </strong>
        </div>
        <div>
          Cảnh báo
          <strong className={incidents ? "text-warning" : ""}>
            {String(incidents).padStart(2, "0")} <small>chưa xử lý</small>
          </strong>
        </div>
      </div>
    </button>
  );
}
function DeviceCard({
  device,
  daily,
  issues,
  stale,
  onClick,
}: {
  device: Device;
  daily: number | null;
  issues: number;
  stale: boolean;
  onClick: () => void;
}) {
  const Icon = typeIcons[device.type] || CircuitBoard;
  return (
    <button
      className={"device-card " + (issues ? "has-issue" : "")}
      onClick={onClick}
    >
      <div className="device-card-top">
        <Icon size={27} />
        <ArrowUpRight size={16} />
      </div>
      <span className="eyebrow">{device.id.toUpperCase()}</span>
      <h3>{device.name}</h3>
      <Connection device={device} stale={stale} />
      <div className="device-reading">
        {fmt(device.latest ? device.latest.powerW / 1000 : null)}{" "}
        <small>kW · Lần đo cuối</small>
      </div>
      <p>
        Hôm nay <b>{fmt(daily)} kWh</b>
      </p>
      {issues > 0 && (
        <div className="device-issue">
          <Bell size={12} />
          {issues} cảnh báo chưa xử lý
        </div>
      )}
    </button>
  );
}
function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="search-box">
      <Search size={14} />
      <input
        aria-label="Tìm thiết bị hoặc sự cố"
        placeholder="Tìm thiết bị, sự cố…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
