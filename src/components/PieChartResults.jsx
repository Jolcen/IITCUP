import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import "../styles/PieChartResults.css"

const data = [
  { name: "Normal", value: 40 },
  { name: "Ansiedad", value: 25 },
  { name: "Depresión", value: 20 },
  { name: "Otros", value: 15 },
]

const COLORS = ["#5cb85c", "#f0ad4e", "#d9534f", "#0275d8"]

export default function PieChartResults() {
  return (
    <div className="pie-box">
      <h3>Resultados Clínicos</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={70}
            dataKey="value"
            label
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend verticalAlign="bottom" height={36} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
