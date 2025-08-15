import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// Lista de tests
router.get("/", async (_req, res) => {
  const { rows } = await pool.query("SELECT id, code, name FROM tests ORDER BY id");
  res.json(rows);
});

// Test con preguntas por code (pai, mcmi, mmpi)
router.get("/:code", async (req, res) => {
  const { code } = req.params;

  const test = await pool.query("SELECT * FROM tests WHERE code=$1", [code]);
  if (!test.rows.length) return res.status(404).json({ error: "Test no encontrado" });

  const testId = test.rows[0].id;
  const preguntas = await pool.query(
    `SELECT id, question_number, text
     FROM questions WHERE test_id=$1 ORDER BY question_number`,
    [testId]
  );

  const { rows: opciones } = await pool.query(
    `SELECT o.id, o.question_id, o.option_text
     FROM options o
     JOIN questions q ON q.id = o.question_id
     WHERE q.test_id=$1
     ORDER BY o.id`,
    [testId]
  );

  // unir opciones por pregunta
  const preguntasConOpciones = preguntas.rows.map(q => ({
    ...q,
    options: opciones.filter(o => o.question_id === q.id).map(o => ({ id: o.id, text: o.option_text }))
  }));

  res.json({
    id: test.rows[0].id,
    code: test.rows[0].code,
    name: test.rows[0].name,
    preguntas: preguntasConOpciones
  });
});

export default router;
