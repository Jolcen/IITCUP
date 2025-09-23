import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import "../styles/ChartEvaluations.css";

export default function ChartEvaluations({ data = [], loading = false }) {
  return (
    <div className="chart-box panel">
      <h3>Evaluaciones finalizadas por mes (año actual)</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={loading ? [] : data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="evaluaciones" fill="#2563eb" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
