import express from "express";
import pool from "./db.js";

const app = express();

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error conectando a la BD");
  }
});

app.listen(3000, () => {
  console.log("Servidor en http://localhost:3000");
});
