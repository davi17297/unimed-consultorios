const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// GET /api/dados
// Retorna TUDO de uma vez, no MESMO formato que o frontend já usa
// no localStorage (mesma forma que banco.ler() devolve hoje).
// Isso deixa a futura troca do localStorage pela API bem simples.
// ============================================================
app.get('/api/dados', async (req, res) => {
  try {
    const [especialidades, medicos, salasRaw, salaEsp, escalaRaw] = await Promise.all([
      pool.query('SELECT * FROM especialidades ORDER BY nome'),
      pool.query('SELECT * FROM medicos ORDER BY nome'),
      pool.query('SELECT * FROM salas ORDER BY nome'),
      pool.query('SELECT * FROM sala_especialidades'),
      pool.query('SELECT * FROM escala')
    ]);

    const salas = salasRaw.rows.map(s => ({
      id: s.id,
      nome: s.nome,
      sala_espera: s.sala_espera,
      localizacao: s.localizacao,
      capacidade_por_turno: s.capacidade_por_turno,
      status: s.status,
      especialidades_permitidas: salaEsp.rows
        .filter(e => e.sala_id === s.id)
        .map(e => e.especialidade_id)
    }));

    const escala = {};
    escalaRaw.rows.forEach(e => {
      escala[`${e.sala_id}|${e.dia_semana}|${e.turno}`] = {
        medico_id: e.medico_id,
        obs: e.observacao || ''
      };
    });

    res.json({
      especialidades: especialidades.rows,
      medicos: medicos.rows,
      salas,
      escala
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao carregar os dados' });
  }
});

// ---------- ESPECIALIDADES ----------
app.post('/api/especialidades', async (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO especialidades (nome) VALUES ($1) RETURNING *',
      [nome]
    );
    res.status(201).json(rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao adicionar especialidade' });
  }
});

app.delete('/api/especialidades/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM especialidades WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao excluir especialidade' });
  }
});

app.put('/api/especialidades/:id', async (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  try {
    const { rows } = await pool.query(
      'UPDATE especialidades SET nome=$1 WHERE id=$2 RETURNING *',
      [nome, req.params.id]
    );
    res.json(rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao editar especialidade' });
  }
});

// ---------- MEDICOS ----------
app.post('/api/medicos', async (req, res) => {
  const { nome, especialidade_id } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO medicos (nome, especialidade_id) VALUES ($1,$2) RETURNING *',
      [nome, especialidade_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao adicionar médico' });
  }
});

app.delete('/api/medicos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM medicos WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao excluir médico' });
  }
});

app.put('/api/medicos/:id', async (req, res) => {
  const { nome, especialidade_id } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  try {
    const { rows } = await pool.query(
      'UPDATE medicos SET nome=$1, especialidade_id=$2 WHERE id=$3 RETURNING *',
      [nome, especialidade_id || null, req.params.id]
    );
    res.json(rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao editar médico' });
  }
});

// ---------- SALAS (consultórios) ----------
app.post('/api/salas', async (req, res) => {
  const { nome, sala_espera, localizacao, capacidade_por_turno, status, especialidades_permitidas } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO salas (nome, sala_espera, localizacao, capacidade_por_turno, status)
       VALUES ($1,$2,$3,COALESCE($4,16),COALESCE($5,'ativo')) RETURNING *`,
      [nome, sala_espera || null, localizacao || null, capacidade_por_turno || null, status || null]
    );
    const sala = rows[0];

    const ids = Array.isArray(especialidades_permitidas) ? especialidades_permitidas : [];
    for (const especialidadeId of ids) {
      await client.query(
        'INSERT INTO sala_especialidades (sala_id, especialidade_id) VALUES ($1,$2)',
        [sala.id, especialidadeId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...sala, especialidades_permitidas: ids });
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao adicionar consultório' });
  } finally {
    client.release();
  }
});

app.delete('/api/salas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM salas WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao excluir consultório' });
  }
});

// ---------- ESCALA ----------
// Upsert de uma célula da grade (mesmo comportamento do atualizarCelula do frontend):
// se não tiver médico nem observação, a linha é removida (encaixe fica "livre").
app.put('/api/escala', async (req, res) => {
  const { sala_id, dia_semana, turno, medico_id, obs } = req.body;
  if (!sala_id || !dia_semana || !turno) {
    return res.status(400).json({ erro: 'sala_id, dia_semana e turno são obrigatórios' });
  }

  try {
    if (!medico_id && !obs) {
      await pool.query(
        'DELETE FROM escala WHERE sala_id=$1 AND dia_semana=$2 AND turno=$3',
        [sala_id, dia_semana, turno]
      );
      return res.json({ sala_id, dia_semana, turno, medico_id: null, obs: '' });
    }

    const { rows } = await pool.query(
      `INSERT INTO escala (sala_id, dia_semana, turno, medico_id, observacao)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (sala_id, dia_semana, turno)
       DO UPDATE SET medico_id = $4, observacao = $5
       RETURNING *`,
      [sala_id, dia_semana, turno, medico_id || null, obs || null]
    );
    res.json(rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao atualizar a escala' });
  }
});

// ---------- Rota de teste (útil pra conferir que o backend está no ar) ----------
app.get('/api/status', (req, res) => {
  res.json({ ok: true, mensagem: 'Backend da Unimed Consultórios rodando.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));