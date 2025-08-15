-- BD: pruebas_psicologicas  (créala antes)
-- psql -U postgres -d pruebas_psicologicas -f sql/init.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tests (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS options (
  id SERIAL PRIMARY KEY,
  question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
  option_text VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_responses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
  selected_option_id INTEGER REFERENCES options(id),
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  completed BOOLEAN DEFAULT FALSE
);

-- Seed de tests
INSERT INTO tests (code, name) VALUES
('pai', 'Personality Assessment Inventory'),
('mcmi', 'Millon Clinical Multiaxial Inventory - IV'),
('mmpi', 'Minnesota Multiphasic Personality Inventory - 2')
ON CONFLICT (code) DO NOTHING;

-- Seed de preguntas + opciones (ejemplo corto para mcmi)
WITH t AS (SELECT id FROM tests WHERE code='mcmi' LIMIT 1)
INSERT INTO questions (test_id, question_number, text)
VALUES
((SELECT id FROM t), 1, 'Me esfuerzo demasiado por agradar a los demás.'),
((SELECT id FROM t), 2, 'Prefiero hacer las cosas por mi cuenta sin ayuda.'),
((SELECT id FROM t), 3, 'Me preocupo mucho por lo que los demás piensan de mí.')
ON CONFLICT DO NOTHING;

-- Opciones VF para las 3 preguntas
INSERT INTO options (question_id, option_text)
SELECT q.id, 'Verdadero' FROM questions q
WHERE q.test_id = (SELECT id FROM tests WHERE code='mcmi');

INSERT INTO options (question_id, option_text)
SELECT q.id, 'Falso' FROM questions q
WHERE q.test_id = (SELECT id FROM tests WHERE code='mcmi');
