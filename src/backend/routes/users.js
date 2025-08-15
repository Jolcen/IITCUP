import { Router } from "express";
import { pool } from "../db.js";
import crypto from "crypto";

const router = Router();

// Crea un usuario demo si no existe
router.post("/seed-admin", async (_req, res) => {
  try {
    const username = "admin@gmail.com";
    const password = "1234"; // demo
    const hash = crypto.createHash("sha256").update(password).digest("hex");

    await pool.query(
      `INSERT INTO users (username, password, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (username) DO NOTHING`,
      [username, hash]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const hash = crypto.createHash("sha256").update(password || "").digest("hex");

  const { rows } = await pool.query(
    "SELECT id, username, role FROM users WHERE username=$1 AND password=$2",
    [username, hash]
  );

  if (!rows.length) return res.status(401).json({ error: "Credenciales inválidas" });
  res.json({ user: rows[0] }); // en prod usar JWT
});

export default router;
