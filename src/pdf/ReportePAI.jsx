// src/components/ReportePAI.jsx
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import dayjs from "dayjs";

/** ===== Utilitario público para generar PDF del PAI ===== */
export function generarPDF_PAI(data) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const mm = (v) => v;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mapTtoX = (t, xMin, xMax) => {
    const tt = clamp(Number(t ?? 0), 20, 100);
    return xMin + ((tt - 20) / 80) * (xMax - xMin);
  };

  // Header
  doc.setFillColor(255, 204, 0);
  doc.rect(mm(0), mm(0), mm(210), mm(22), "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(50);
  doc.text(data?.informe?.titulo || "Perfil PAI", mm(12), mm(14));
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(String(data?.informe?.institucion || ""), mm(12), mm(20));

  // Ficha
  const y0 = 28;
  autoTable(doc, {
    startY: mm(y0),
    margin: { left: mm(12), right: mm(12) },
    head: [["Campo", "Valor"]],
    body: [
      ["Nombre", data?.evaluado?.nombre || ""],
      ["Edad", String(data?.evaluado?.edad ?? "")],
      ["Sexo", data?.evaluado?.sexo || ""],
      ["ID", data?.evaluado?.id || ""],
      ["Fecha", data?.informe?.fecha || ""],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [240, 240, 240], textColor: 20 },
  });

  const previousY = autoTable.previous.finalY + 8;

  // Helpers secciones
  const interpretT = (t) => (t>=70 ? "Alto (clínico)" : t>=60 ? "Moderado / Riesgo" : t>=40 ? "Promedio" : "Bajo");

  const drawSection = (section, startY) => {
    let y = startY;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(40);
    doc.text(section.titulo || "Sección", mm(12), mm(y));
    y += 3;

    autoTable(doc, {
      startY: mm(y + 2),
      margin: { left: mm(12), right: mm(12) },
      head: [["Subescala", "Bruto", "T", "Interpretación"]],
      body: (section.subescalas || []).map(s => [s.nombre, s.bruto ?? "", s.t ?? "", interpretT(Number(s.t ?? 0))]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [245, 245, 245], textColor: 30 },
      theme: "grid",
    });

    y = autoTable.previous.finalY + 4;

    // Minigráfico bandas
    const xLeft = 18, xRight = 200, h = 28;
    const x40 = mapTtoX(40, xLeft, xRight), x60 = mapTtoX(60, xLeft, xRight), x70 = mapTtoX(70, xLeft, xRight);
    // cuadro base
    doc.setDrawColor(200); doc.setLineWidth(0.2);
    doc.rect(mm(xLeft), mm(y), mm(xRight - xLeft), mm(h));
    // bandas
    doc.setFillColor(220,245,220); doc.rect(mm(x40), mm(y), mm(x60-x40), mm(h), "F");
    doc.setFillColor(255,250,205); doc.rect(mm(x60), mm(y), mm(x70-x60), mm(h), "F");
    doc.setFillColor(255,225,225); doc.rect(mm(x70), mm(y), mm(xRight-x70), mm(h), "F");

    // ticks
    doc.setFontSize(8); doc.setTextColor(70);
    [40,50,60,70,80,90].forEach(t=>{
      const x = mapTtoX(t, xLeft, xRight);
      doc.setDrawColor(150);
      doc.line(mm(x), mm(y), mm(x), mm(y+h));
      doc.text(String(t), mm(x-2.2), mm(y-1.2));
    });

    // serie
    const serie = section.graficoT || [];
    if (serie.length>1) {
      doc.setDrawColor(20); doc.setLineWidth(0.6);
      const stepY = h/(serie.length-1);
      const pts = serie.map((t,i)=>({ x: mapTtoX(t, xLeft, xRight), y: y + i*stepY + 2 }));
      for (let i=0;i<pts.length-1;i++) doc.line(mm(pts[i].x), mm(pts[i].y), mm(pts[i+1].x), mm(pts[i+1].y));
      pts.forEach(p=>doc.circle(mm(p.x), mm(p.y), 0.9, "F"));
    }
    doc.setFontSize(9); doc.setTextColor(50);
    doc.text("Tendencia (T)", mm(xLeft), mm(y+h+5));

    return y + h + 8;
  };

  // Pinta todas las secciones
  let yCursor = previousY;
  (data?.secciones || []).forEach((sec, i) => {
    if (yCursor > 240) { doc.addPage(); yCursor = 20; }
    yCursor = drawSection(sec, yCursor);
    if (i < data.secciones.length-1) {
      doc.setDrawColor(230);
      doc.line(mm(12), mm(yCursor), mm(198), mm(yCursor));
      yCursor += 6;
    }
  });

  // Pie
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Generado el ${dayjs().format("YYYY-MM-DD HH:mm")}`, mm(12), mm(287));

  const nombre = (data?.evaluado?.nombre || "informe").replace(/\s+/g,"_");
  doc.save(`${nombre}_PAI.pdf`);
}
