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

-- Quando o número de pacientes daquele dia específico foi diferente do
-- padrão do médico (ex: atendeu mais gente que o normal nessa reposição)
ALTER TABLE reposicoes ADD COLUMN IF NOT EXISTS pacientes_atendidos INTEGER;

-- Trava de segurança: nunca deixa existir duas reposições pro MESMO
-- consultório, na MESMA data e turno — impede o double-booking mesmo se
-- a tela deixar passar por algum bug.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reposicoes_sala_data_turno_unico'
  ) THEN
    ALTER TABLE reposicoes ADD CONSTRAINT reposicoes_sala_data_turno_unico UNIQUE (sala_id, data, turno);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reposicoes_data ON reposicoes(data);

-- "Foto" mensal da ocupação de cada consultório, tirada manualmente
-- (botão "Salvar snapshot do mês" na tela de Relatórios). É isso que
-- alimenta o histórico/gráfico de evolução mês a mês.
CREATE TABLE IF NOT EXISTS snapshots_mensais (
  id SERIAL PRIMARY KEY,
  mes TEXT NOT NULL, -- formato 'AAAA-MM'
  sala_id INTEGER REFERENCES salas(id) ON DELETE SET NULL,
  sala_nome TEXT NOT NULL, -- guardado separado, pra não perder o histórico se a sala for excluída depois
  instalada INTEGER NOT NULL,
  atual INTEGER NOT NULL,
  livre INTEGER NOT NULL,
  percentual NUMERIC NOT NULL,
  criado_em TIMESTAMP DEFAULT now(),
  UNIQUE (mes, sala_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_mes ON snapshots_mensais(mes);

-- Fechamento de agenda: quando um médico avisa que não vai atender numa
-- semana específica do horário fixo dele. O consultório fica livre por
-- 7 dias (data_inicio até data_fim) e depois volta sozinho pro médico de
-- sempre — a escala fixa (tabela "escala") NÃO é alterada, isso é só uma
-- exceção temporária por cima dela.
CREATE TABLE IF NOT EXISTS fechamentos_agenda (
  id SERIAL PRIMARY KEY,
  medico_id INTEGER NOT NULL REFERENCES medicos(id) ON DELETE CASCADE,
  sala_id INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  dia_semana TEXT NOT NULL CHECK (dia_semana IN
    ('Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado')),
  turno TEXT NOT NULL CHECK (turno IN ('08h às 12h','12h às 16h','16h às 20h')),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  motivo TEXT,
  criado_em TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fechamentos_datas ON fechamentos_agenda(data_inicio, data_fim);