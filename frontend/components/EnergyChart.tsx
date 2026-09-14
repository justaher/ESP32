"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EnergyRow } from "../lib/types";
export function EnergyChart({
  rows,
  device = false,
}: {
  rows: EnergyRow[];
  device?: boolean;
}) {
  if (!rows.some((r) => r.total !== null))
    return (
      <div className="empty chart-empty">
        Chưa có dữ liệu điện năng trong khoảng thời gian này.
      </div>
    );
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          barGap={3}
          margin={{ top: 10, right: 8, left: -16, bottom: 0 }}
        >
          <CartesianGrid
            stroke="#274035"
            vertical={false}
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="date"
            stroke="#83a392"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(s) =>
              s.length === 7
                ? "T" + Number(s.slice(5))
                : s.slice(8) + "/" + s.slice(5, 7)
            }
            minTickGap={18}
          />
          <YAxis
            stroke="#83a392"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#132c21",
              border: "1px solid #456150",
              borderRadius: 8,
              color: "#e3eee6",
            }}
            cursor={{ fill: "#294d342f" }}
            formatter={(v) => [
              `${Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} kWh`,
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 18 }} />
          {device ? (
            <Bar
              dataKey="total"
              name="Thiết bị đang chọn"
              fill="#8fc6a8"
              radius={[3, 3, 0, 0]}
            />
          ) : (
            <>
              <Bar
                dataKey="cabinet1"
                name="Tủ chiếu sáng"
                fill="#85baa0"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="cabinet2"
                name="Tủ động lực"
                fill="#e5ad68"
                radius={[3, 3, 0, 0]}
              />
            </>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
