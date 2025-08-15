import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import "../styles/ChartEvaluations.css"

const data = [
  { name: "Ene", evaluaciones: 30 },
  { name: "Feb", evaluaciones: 45 },
  { name: "Mar", evaluaciones: 60 },
  { name: "Abr", evaluaciones: 38 },
  { name: "May", evaluaciones: 75 },
  { name: "Jun", evaluaciones: 50 },
]

export default function ChartEvaluations() {
  return (
    <div className="chart-box">
      <h3>Evaluaciones por Mes</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="evaluaciones" fill="#0275d8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
