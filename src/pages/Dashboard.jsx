import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import CardStats from "../components/CardStats";
import ChartEvaluations from "../components/ChartEvaluations";
import RecentAttempts from "../components/RecentAttempts";
import FiltersBar from "../components/FiltersBar";
import "../styles/Home.css";

function startOfYearISO() {
  const d = new Date(); d.setMonth(0, 1); d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}
function startOfNextYearISO() {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1, 0, 1); d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}

export default function Dashboard() {
  // filtros
  const [desde, setDesde] = useState(startOfYearISO());
  const [hasta, setHasta] = useState(startOfNextYearISO());
  const [pruebaId, setPruebaId] = useState(null);

  // estado UI
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // combos
  const [pruebas, setPruebas] = useState([]);

  // KPIs
  const [total, setTotal] = useState(0);
  const [pendientes, setPendientes] = useState(0);
  const [terminadas, setTerminadas] = useState(0);

  // gráfico y tabla
  const [serieMes, setSerieMes] = useState([]);
  const [recientes, setRecientes] = useState([]);

  // cargar pruebas para el filtro
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("pruebas").select("id, nombre").order("nombre");
      if (!error) setPruebas(data || []);
    })();
  }, []);

  // cargar dashboard
  useEffect(() => {
    (async () => {
      try {
        setErr("");
        setLoading(true);

        // === KPIs === (usando la vista)
        // Total
        {
          let q = supabase.from("v_dashboard_intentos").select("*", { count: "exact", head: true });
          if (pruebaId) q = q.eq("prueba_id", pruebaId);
          const { count, error } = await q;
          if (error) throw error;
          setTotal(count || 0);
        }
        // Terminadas
        {
          let q = supabase.from("v_dashboard_intentos")
            .select("*", { count: "exact", head: true })
            .eq("estado", "evaluado");
          if (pruebaId) q = q.eq("prueba_id", pruebaId);
          const { count, error } = await q;
          if (error) throw error;
          setTerminadas(count || 0);
        }
        // Pendientes
        {
          let q = supabase.from("v_dashboard_intentos")
            .select("*", { count: "exact", head: true })
            .in("estado", ["pendiente", "en_evaluacion", "interrumpido"]);
          if (pruebaId) q = q.eq("prueba_id", pruebaId);
          const { count, error } = await q;
          if (error) throw error;
          setPendientes(count || 0);
        }

        // === Serie mensual (año actual) usando fecha_final (filtrado en cliente) ===
        {
          const names = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
          const buckets = Array.from({ length: 12 }, () => 0);

          let q = supabase
            .from("v_dashboard_intentos")
            .select("fecha_final")
            .eq("estado", "evaluado");

          if (pruebaId) q = q.eq("prueba_id", pruebaId);

          const { data, error } = await q;
          if (error) throw error;

          // Filtramos por rango en el cliente para evitar desfases de TZ
          const dDesde = new Date(desde);
          const dHasta = new Date(hasta);

          (data || []).forEach(r => {
            const d = r.fecha_final ? new Date(r.fecha_final) : null;
            if (!d) return;
            if (d >= dDesde && d < dHasta) {
              buckets[d.getMonth()] += 1;
            }
          });

          setSerieMes(names.map((n, i) => ({ name: n, evaluaciones: buckets[i] })));
        }


        // === Intentos recientes (usa fecha_final) ===
        {
          let q = supabase
            .from("v_dashboard_intentos")
            .select("id, estado, fecha_final, iniciado_en, finalizado_en, ultimo_evento_en, prueba_nombre, paciente_nombre, prueba_id")
            .order("ultimo_evento_en", { ascending: false, nullsFirst: false })
            .limit(10);

          if (pruebaId) q = q.eq("prueba_id", pruebaId);

          const { data, error } = await q;
          if (error) throw error;

          const rows = (data || []).map(r => ({
            id: r.id,
            estado: r.estado,
            fecha: r.fecha_final,
            prueba: r.prueba_nombre,
            paciente: r.paciente_nombre
          }));
          setRecientes(rows);
        }
      } catch (e) {
        console.error(e);
        setErr(e.message || "Error cargando dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [desde, hasta, pruebaId]);

  const stats = useMemo(() => ([
    { title: "Evaluaciones Pendientes", value: pendientes, color: "#f0ad4e" },
    { title: "Evaluaciones Terminadas", value: terminadas, color: "#5cb85c" },
    { title: "Total de Evaluaciones", value: total, color: "#0275d8" },
  ]), [pendientes, terminadas, total]);

  return (
    <div className="content">
      <FiltersBar
        desde={desde}
        hasta={hasta}
        onDesde={setDesde}
        onHasta={setHasta}
        pruebas={pruebas}
        pruebaId={pruebaId}
        onPruebaId={setPruebaId}
      />

      {err && <div style={{ color: "crimson", marginBottom: 12 }}>{err}</div>}

      <CardStats stats={stats} loading={loading} />

      <div className="charts">
        <ChartEvaluations data={serieMes} loading={loading} />
      </div>

      <div className="tables">
        <RecentAttempts rows={recientes} loading={loading} />
      </div>
    </div>
  );
}
