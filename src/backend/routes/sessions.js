import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// Iniciar sesión de test
router.post("/start", async (req, res) => {
  const { userId, testCode } = req.body;

  const test = await pool.query("SELECT id FROM tests WHERE code=$1", [testCode]);
  if (!test.rows.length) return res.status(404).json({ error: "Test no encontrado" });

  const { rows } = await pool.query(
    `INSERT INTO test_sessions (user_id, test_id, started_at, completed)
     VALUES ($1,$2,NOW(),false) RETURNING id`,
    [userId, test.rows[0].id]
  );
  res.json({ sessionId: rows[0].id });
});

// Guardar respuesta
router.post("/:sessionId/answer", async (req, res) => {
  const { sessionId } = req.params;
  const { userId, questionId, selectedOptionId } = req.body;

  await pool.query(
    `INSERT INTO user_responses (user_id, question_id, selected_option_id, answered_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT DO NOTHING`,
    [userId, questionId, selectedOptionId]
  );

  res.json({ ok: true });
});

// Finalizar sesión
router.post("/:sessionId/finish", async (req, res) => {
  const { sessionId } = req.params;
  const { durationSeconds } = req.body;

  await pool.query(
    `UPDATE test_sessions SET ended_at=NOW(), duration_seconds=$1, completed=true
     WHERE id=$2`,
    [durationSeconds ?? null, sessionId]
  );

  res.json({ ok: true });
});

export default router;
