-- ============================================================
-- Escala de Consultórios - Unimed Goiânia
-- Schema do banco de dados (PostgreSQL / Railway)
-- ============================================================

CREATE TABLE IF NOT EXISTS especialidades (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS medicos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  especialidade_id INTEGER REFERENCES especialidades(id) ON DELETE SET NULL
);

-- Adiciona as colunas novas mesmo se a tabela já existir (é seguro rodar de novo)
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS titulo TEXT;
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS pacientes_por_turno INTEGER;

-- Cada consultório físico. "sala_espera" é o agrupamento visual
-- (ex: "Sala de Espera 2") que já existe no frontend.
CREATE TABLE IF NOT EXISTS salas (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  sala_espera TEXT,
  localizacao TEXT,
  capacidade_por_turno INTEGER NOT NULL DEFAULT 16,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'manutencao'))
);

-- Quais especialidades cada consultório aceita (vazio = qualquer uma)
CREATE TABLE IF NOT EXISTS sala_especialidades (
  sala_id INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  especialidade_id INTEGER NOT NULL REFERENCES especialidades(id) ON DELETE CASCADE,
  PRIMARY KEY (sala_id, especialidade_id)
);

-- A grade: só existe uma linha aqui quando o encaixe tem médico ou observação
-- (os encaixes "livres" simplesmente não têm linha — igual funcionava no localStorage)
CREATE TABLE IF NOT EXISTS escala (
  id SERIAL PRIMARY KEY,
  sala_id INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  dia_semana TEXT NOT NULL CHECK (dia_semana IN
    ('Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado')),
  turno TEXT NOT NULL CHECK (turno IN ('08h às 12h','12h às 16h','16h às 20h')),
  medico_id INTEGER REFERENCES medicos(id) ON DELETE SET NULL,
  observacao TEXT,
  UNIQUE (sala_id, dia_semana, turno)
);

CREATE INDEX IF NOT EXISTS idx_escala_sala ON escala(sala_id);
CREATE INDEX IF NOT EXISTS idx_medicos_especialidade ON medicos(especialidade_id);

-- Reposições: quando um médico falta um plantão fixo e repõe em outro dia
-- COM DATA MARCADA (não é recorrente como a escala normal), usando
-- qualquer consultório que esteja vago naquela data/turno.
CREATE TABLE IF NOT EXISTS reposicoes (
  id SERIAL PRIMARY KEY,
  medico_id INTEGER NOT NULL REFERENCES medicos(id) ON DELETE CASCADE,
  sala_id INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  turno TEXT NOT NULL CHECK (turno IN ('08h às 12h','12h às 16h','16h às 20h')),
  motivo TEXT NOT NULL,
  observacao TEXT
);

CREATE INDEX IF NOT EXISTS idx_reposicoes_data ON reposicoes(data);