import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import "../styles/ChartEvaluations.css"; // reutiliza estilos .panel/.chart-box

const COLORS = [
  "#2563eb","#10b981","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#84cc16","#f43f5e","#6366f1",
];

export default function ChartProfilesPie({ data = [], loading = false }) {
  const safe = loading ? [] : data;
  return (
    <div className="chart-box panel">
      <h3>Perfiles diagnósticos</h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={safe}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            labelLine={false}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
          >
            {safe.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(val) => [`${val}`, "Cantidad"]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
