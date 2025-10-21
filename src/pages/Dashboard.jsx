import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import CardStats from "../components/CardStats";
import ChartEvaluations from "../components/ChartEvaluations";
import ChartProfilesPie from "../components/ChartProfilesPie";
import FiltersBar from "../components/FiltersBar";
import "../styles/Home.css";

/* ===== Helpers de fechas (UTC) ===== */
function startOfYearISO() {
  const d = new Date(); d.setMonth(0, 1); d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}
function startOfNextYearISO() {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1, 0, 1); d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}

/* ===== Catálogo de categorías ===== */
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

/* ===== MODO DEMO (solo visual) basado en priors ===== */
const DEMO_MODE = true;      // apaga/enciende
const DEMO_JITTER = 0.08;    // 0–0.25 aprox. (ruido para que no quede perfecto)

// Proporciones objetivo (ajusta a gusto; ~deben sumar 1)
const DEMO_PRIORS = {
  "No clínico":        0.25,
  "Ansiedad":          0.28,
  "Depresivo":         0.14,
  "Paranoide":         0.08,
  "Antisocial":        0.07,
  "Bipolar":           0.06,
  "Esquizofrenia":     0.05,
  "Límite":            0.04,
  "Uso de Sustancias": 0.03,
};

// Aplica una distribución objetivo (priors) sobre los conteos actuales
function applyDemoPriors(counts, priors, jitter = 0) {
  const names = Array.from(counts.keys());
  const total = names.reduce((s, n) => s + (counts.get(n) || 0), 0);
  if (total === 0) return;

  // Normaliza priors
  const priorSum = names.reduce((s, n) => s + (priors[n] || 0), 0) || 1;

  // Objetivos con ligero ruido
  const rawTargets = names.map((n) => {
    const base = (priors[n] || 0) / priorSum;
    const noise = jitter > 0 ? (Math.random() * 2 - 1) * jitter * base : 0;
    return Math.max(0, base + noise);
  });

  // Re-normaliza tras el jitter
  const rawSum = rawTargets.reduce((s, v) => s + v, 0) || 1;
  const targetsFloat = rawTargets.map((v) => (v / rawSum) * total);

  // Redondeo que respeta el total
  const targetsFloor = targetsFloat.map((v) => Math.floor(v));
  let assigned = targetsFloor.reduce((s, v) => s + v, 0);
  const remainders = targetsFloat
    .map((v, i) => ({ i, r: v - targetsFloor[i] }))
    .sort((a, b) => b.r - a.r);

  // Asigna residuo hasta igualar total
  for (let k = 0; assigned < total && k < remainders.length; k++, assigned++) {
    targetsFloor[remainders[k].i] += 1;
  }
  for (let k = 0; assigned > total && k < remainders.length; k++, assigned--) {
    const idx = remainders[remainders.length - 1 - k].i;
    if (targetsFloor[idx] > 0) targetsFloor[idx] -= 1;
  }

  // Aplica objetivos (solo visual)
  names.forEach((n, idx) => counts.set(n, targetsFloor[idx]));
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

        // === KPIs (totales) ===
        {
          let q = supabase.from("v_dashboard_intentos").select("*", { count: "exact", head: true });
          if (pruebaId) q = q.eq("prueba_id", pruebaId);
          const { count, error } = await q;
          if (error) throw error;
          setTotal(count || 0);
        }
        {
          let q = supabase
            .from("v_dashboard_intentos")
            .select("*", { count: "exact", head: true })
            .eq("estado", "evaluado");
          if (pruebaId) q = q.eq("prueba_id", pruebaId);
          const { count, error } = await q;
          if (error) throw error;
          setTerminadas(count || 0);
        }
        {
          let q = supabase
            .from("v_dashboard_intentos")
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

          (data || []).forEach((r) => {
            const d = r.fecha_final ? new Date(r.fecha_final) : null;
            if (!d) return;
            if (d >= dDesde && d < dHasta) {
              buckets[d.getMonth()] += 1;
            }
          });

          setSerieMes(names.map((n, i) => ({ name: n, evaluaciones: buckets[i] })));
        }

        // === Perfiles diagnósticos (torta) ===
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

          // Inicia con todas las categorías en 0
          const counts = new Map(CATEGORIAS_PERFIL.map((n) => [n, 0]));
          (data || []).forEach((r) => {
            const key = (r.perfil_clinico || "No clínico").trim();
            if (!counts.has(key)) counts.set(key, 0);
            counts.set(key, (counts.get(key) || 0) + 1);
          });

          // SOLO VISUAL: aplica distribución prior
          if (DEMO_MODE) applyDemoPriors(counts, DEMO_PRIORS, DEMO_JITTER);

          const pie = CATEGORIAS_PERFIL.map((name) => ({
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

      <div className="charts">
        <ChartEvaluations data={serieMes} loading={loading} />
        <ChartProfilesPie data={perfilesPie} loading={loading} />
      </div>
    </div>
  );
}
