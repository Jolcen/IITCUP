import "../styles/CardStats.css";

export default function CardStats({ stats = [], loading = false }) {
  return (
    <div className="card-stats-container">
      {stats.map((stat, idx) => (
        <div key={idx} className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: stat.color }} />
          <div className="stat-info">
            <p className="stat-title">{stat.title}</p>
            <p className="stat-value">{loading ? "…" : stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
