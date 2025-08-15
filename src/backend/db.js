import pg from "pg";
import dotenv from "dotenv";

dotenv.config();



const pool = new pg.Pool({
  user: process.env.DB_USER,        // Usuario de PostgreSQL
  host: process.env.DB_HOST,        // Ej: localhost
  database: process.env.DB_NAME,    // Nombre de la BD
  password: process.env.DB_PASSWORD,// Contraseña de PostgreSQL
  port: process.env.DB_PORT,        // Ej: 5432
});

export default pool;
