import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import CardStats from "../components/CardStats";
import ChartEvaluations from "../components/ChartEvaluations";
import ChartProfilesPie from "../components/ChartProfilesPie"; // ⬅️ nuevo
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

// categorías esperadas (así controlamos el orden y mostramos 0 si no hay)
const CATEGORIAS_PERFIL = [
  "Antisocial",
  "Ansiedad",
  "Bipolar",
  "Depresivo",
  "Esquizofrenia",
  "Límite",
  "No clínico",
  "Paranoide",
  "Uso de Sustancias",
];

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

  // gráficos
  const [serieMes, setSerieMes] = useState([]);
  const [perfilesPie, setPerfilesPie] = useState([]);

  // cargar pruebas
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

        // === KPIs (vista v_dashboard_intentos) ===
        {
          let q = supabase.from("v_dashboard_intentos").select("*", { count: "exact", head: true });
          if (pruebaId) q = q.eq("prueba_id", pruebaId);
          const { count, error } = await q;
          if (error) throw error;
          setTotal(count || 0);
        }
        {
          let q = supabase.from("v_dashboard_intentos")
            .select("*", { count: "exact", head: true })
            .eq("estado", "evaluado");
          if (pruebaId) q = q.eq("prueba_id", pruebaId);
          const { count, error } = await q;
          if (error) throw error;
          setTerminadas(count || 0);
        }
        {
          let q = supabase.from("v_dashboard_intentos")
            .select("*", { count: "exact", head: true })
            .in("estado", ["pendiente", "en_evaluacion", "interrumpido"]);
          if (pruebaId) q = q.eq("prueba_id", pruebaId);
          const { count, error } = await q;
          if (error) throw error;
          setPendientes(count || 0);
        }

        // === Serie mensual (barras) ===
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

        // === Perfiles diagnósticos (torta) ===
        // Requiere la FK: perfiles_caso.intento_id -> intentos_prueba.id
        {
          let q = supabase
            .from("perfiles_caso")
            .select("perfil_clinico, generated_at, intentos_prueba!inner(prueba_id)")
            .not("perfil_clinico", "is", null)
            .gte("generated_at", desde)
            .lt("generated_at", hasta);

          if (pruebaId) q = q.eq("intentos_prueba.prueba_id", pruebaId);

          const { data, error } = await q;
          if (error) throw error;

          // Iniciamos con todas las categorías en 0
          const counts = new Map(CATEGORIAS_PERFIL.map(n => [n, 0]));

          (data || []).forEach(r => {
            const key = (r.perfil_clinico || "No clínico").trim();
            counts.set(key, (counts.get(key) || 0) + 1);
          });

          const pie = CATEGORIAS_PERFIL.map(name => ({
            name,
            value: counts.get(name) || 0,
          }));

          setPerfilesPie(pie);
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

      {/* Gráficos: barras + torta */}
      <div className="charts">
        <ChartEvaluations data={serieMes} loading={loading} />
        <ChartProfilesPie data={perfilesPie} loading={loading} />
      </div>
    </div>
  );
}
