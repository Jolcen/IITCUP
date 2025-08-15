import "../styles/CardStats.css"
import { FaClipboardCheck, FaCheckCircle, FaExclamationTriangle, FaChartBar } from "react-icons/fa"

export default function CardStats() {
  const stats = [
    {
      title: "Evaluaciones Pendientes",
      value: 6,
      icon: <FaClipboardCheck />,
      color: "#f0ad4e",
    },
    {
      title: "Evaluaciones Terminadas",
      value: 4,
      icon: <FaCheckCircle />,
      color: "#5cb85c",
    },
    {
      title: "Alerta",
      value: "!",
      icon: <FaExclamationTriangle />,
      color: "#d9534f",
    },
    {
      title: "Total de Evaluaciones",
      value: 1248,
      icon: <FaChartBar />,
      color: "#0275d8",
    },
  ]

  return (
    <div className="card-stats-container">
      {stats.map((stat, index) => (
        <div key={index} className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: stat.color }}>
            {stat.icon}
          </div>
          <div className="stat-info">
            <p className="stat-title">{stat.title}</p>
            <p className="stat-value">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
