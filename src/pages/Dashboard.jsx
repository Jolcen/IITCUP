import CardStats from "../components/CardStats"
import PieChartResults from "../components/PieChartResults"
import IndividualsStatus from "../components/IndividualsStatus"
import ChartEvaluations from "../components/ChartEvaluations"
import "../styles/Home.css" 

const Dashboard = () => {
  return (
    <div>
      <div className="content">
        <CardStats />
        <div className="charts">
          <ChartEvaluations/>
        </div>
        <div className="tables">
          <IndividualsStatus />
        </div>
      </div>
    </div>
  )
}

export default Dashboard