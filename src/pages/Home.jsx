import CardStats from "../components/CardStats"
import PieChartResults from "../components/PieChartResults"
import RecentTests from "../components/RecentTests"
import IndividualsStatus from "../components/IndividualsStatus"
import Sidebar from "../components/Sidebar"
import Topbar from "../components/Topbar"
import ChartEvaluations from "../components/ChartEvaluations"
import "../styles/Home.css" 

export default function Home() {
  return (
    <div className="dashboard">
      <Sidebar/>
      <div className="main-content">
        <Topbar/>
        <div className="content">
          <CardStats />
          <div className="charts">
            <ChartEvaluations/>
            <PieChartResults />
          </div>
          <div className="tables">
            <RecentTests />
            <IndividualsStatus />
          </div>
        </div>
      </div>
    </div>
  );
}
