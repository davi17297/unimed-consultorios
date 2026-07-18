const express = require('express');
const cors = require('cors');
const pool = require('./db');
const ExcelJS = require('exceljs');
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
    const [especialidades, medicos, salasRaw, salaEsp, escalaRaw, reposicoes] = await Promise.all([
      pool.query('SELECT * FROM especialidades ORDER BY nome'),
      pool.query('SELECT * FROM medicos ORDER BY nome'),
      pool.query('SELECT * FROM salas ORDER BY nome'),
      pool.query('SELECT * FROM sala_especialidades'),
      pool.query('SELECT * FROM escala'),
      pool.query("SELECT id, medico_id, sala_id, to_char(data, 'YYYY-MM-DD') AS data, turno, motivo, observacao, pacientes_atendidos FROM reposicoes ORDER BY data DESC")
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
      escala,
      reposicoes: reposicoes.rows
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
  const { nome, especialidade_id, titulo, pacientes_por_turno } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO medicos (nome, especialidade_id, titulo, pacientes_por_turno) VALUES ($1,$2,$3,$4) RETURNING *',
      [nome, especialidade_id || null, titulo || null, pacientes_por_turno || null]
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
  const { nome, especialidade_id, titulo, pacientes_por_turno } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  try {
    const { rows } = await pool.query(
      'UPDATE medicos SET nome=$1, especialidade_id=$2, titulo=$3, pacientes_por_turno=$4 WHERE id=$5 RETURNING *',
      [nome, especialidade_id || null, titulo || null, pacientes_por_turno || null, req.params.id]
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

// ---------- REPOSIÇÕES ----------
// Um médico que faltou um plantão fixo e repõe em outra data específica
// (não recorrente), em qualquer consultório vago naquele dia/turno.
app.post('/api/reposicoes', async (req, res) => {
  const { medico_id, sala_id, data, turno, motivo, observacao, pacientes_atendidos } = req.body;
  if (!medico_id || !sala_id || !data || !turno || !motivo) {
    return res.status(400).json({ erro: 'medico_id, sala_id, data, turno e motivo são obrigatórios' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO reposicoes (medico_id, sala_id, data, turno, motivo, observacao, pacientes_atendidos)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [medico_id, sala_id, data, turno, motivo, observacao || null, pacientes_atendidos || null]
    );
    res.status(201).json(rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao adicionar reposição' });
  }
});

app.put('/api/reposicoes/:id', async (req, res) => {
  const { medico_id, sala_id, data, turno, motivo, observacao, pacientes_atendidos } = req.body;
  if (!medico_id || !sala_id || !data || !turno || !motivo) {
    return res.status(400).json({ erro: 'medico_id, sala_id, data, turno e motivo são obrigatórios' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE reposicoes SET medico_id=$1, sala_id=$2, data=$3, turno=$4, motivo=$5, observacao=$6, pacientes_atendidos=$7
       WHERE id=$8 RETURNING *`,
      [medico_id, sala_id, data, turno, motivo, observacao || null, pacientes_atendidos || null, req.params.id]
    );
    res.json(rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao editar reposição' });
  }
});

app.delete('/api/reposicoes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM reposicoes WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao excluir reposição' });
  }
});

// ---------- EXPORTAR PLANILHA ----------
// Gera um .xlsx no mesmo "espírito visual" da planilha original da Unimed
// (uma aba por local, um bloco colorido por consultório, grade Dia x Turno),
// mas com os dados atuais do banco. Os consultórios saem empilhados (um
// embaixo do outro) em vez de lado a lado, pra simplificar a geração.
const DIAS_EXPORT = ['Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira'];
const TURNOS_EXPORT = [
  { chave: '08h às 12h', rotulo: '08H ÀS 12H' },
  { chave: '12h às 16h', rotulo: '12H ÀS 16H' },
  { chave: '16h às 20h', rotulo: '16H ÀS 20H' }
];
const VERDE_UNIMED = 'FF00693E';

function sanitizarNomeAba(nome) {
  const limpo = (nome || 'Geral').replace(/[/\\?*[\]:]/g, ' ').trim();
  return limpo.slice(0, 31) || 'Geral';
}

function formatarNomeMedicoExport(medico) {
  if (!medico) return '';
  const titulo = (medico.titulo || '').trim();
  const nome = (medico.nome || '').trim();
  if (!titulo || nome.toLowerCase().startsWith(titulo.toLowerCase())) return nome;
  return `${titulo} ${nome}`;
}

app.get('/api/exportar-planilha', async (req, res) => {
  try {
    const [especialidades, medicos, salasRaw, salaEsp, escalaRaw] = await Promise.all([
      pool.query('SELECT * FROM especialidades ORDER BY nome'),
      pool.query('SELECT * FROM medicos ORDER BY nome'),
      pool.query('SELECT * FROM salas ORDER BY nome'),
      pool.query('SELECT * FROM sala_especialidades'),
      pool.query('SELECT * FROM escala')
    ]);

    const escalaMapa = {};
    escalaRaw.rows.forEach(e => {
      escalaMapa[`${e.sala_id}|${e.dia_semana}|${e.turno}`] = e;
    });

    // Agrupa as salas por localização (cada uma vira uma aba)
    const grupos = new Map();
    salasRaw.rows.forEach(s => {
      const local = s.localizacao || 'Sem local definido';
      if (!grupos.has(local)) grupos.set(local, []);
      grupos.get(local).push(s);
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema Unimed Goiânia';
    workbook.created = new Date();

    grupos.forEach((salasDoGrupo, nomeLocal) => {
      const ws = workbook.addWorksheet(sanitizarNomeAba(nomeLocal));
      ws.columns = [
        { width: 20 }, { width: 26 }, { width: 26 }, { width: 26 }
      ];

      let linhaAtual = 1;

      salasDoGrupo.forEach(sala => {
        const idsEspecialidades = salaEsp.rows.filter(e => e.sala_id === sala.id).map(e => e.especialidade_id);
        const nomesEspecialidades = especialidades.rows
          .filter(e => idsEspecialidades.includes(e.id))
          .map(e => e.nome)
          .join(' | ');

        // ---- Linha do título do bloco (colorida, com especialidades + nome) ----
        const linhaTitulo = linhaAtual;
        ws.mergeCells(linhaTitulo, 1, linhaTitulo, 4);
        const celTitulo = ws.getCell(linhaTitulo, 1);
        celTitulo.value = nomesEspecialidades ? `${nomesEspecialidades}\n${sala.nome}` : sala.nome;
        celTitulo.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        celTitulo.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
        celTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_UNIMED } };
        ws.getRow(linhaTitulo).height = 34;
        linhaAtual++;

        // ---- Linha de cabeçalho: DIA | Turno 1 | Turno 2 | Turno 3 ----
        const linhaCabecalho = linhaAtual;
        ws.getCell(linhaCabecalho, 1).value = 'DIA';
        TURNOS_EXPORT.forEach((t, i) => {
          ws.getCell(linhaCabecalho, i + 2).value = t.rotulo;
        });
        ws.getRow(linhaCabecalho).eachCell(cel => {
          cel.font = { bold: true };
          cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4F5EC' } };
          cel.alignment = { horizontal: 'center' };
        });
        linhaAtual++;

        // ---- Segunda a Sexta ----
        DIAS_EXPORT.forEach(dia => {
          const linha = linhaAtual;
          ws.getCell(linha, 1).value = dia;
          ws.getCell(linha, 1).font = { bold: true };
          TURNOS_EXPORT.forEach((t, i) => {
            const entrada = escalaMapa[`${sala.id}|${dia}|${t.chave}`];
            if (entrada && entrada.medico_id) {
              const medico = medicos.rows.find(m => m.id === entrada.medico_id);
              let texto = formatarNomeMedicoExport(medico);
              if (entrada.observacao) texto += ` (${entrada.observacao})`;
              ws.getCell(linha, i + 2).value = texto;
            }
          });
          linhaAtual++;
        });

        // ---- Sábado (só o primeiro turno) ----
        const linhaSabadoLabel = linhaAtual;
        ws.getCell(linhaSabadoLabel, 1).value = 'Sábado';
        ws.getCell(linhaSabadoLabel, 1).font = { bold: true };
        ws.getCell(linhaSabadoLabel, 2).value = TURNOS_EXPORT[0].rotulo;
        linhaAtual++;

        const linhaSabadoMedico = linhaAtual;
        const entradaSabado = escalaMapa[`${sala.id}|Sábado|${TURNOS_EXPORT[0].chave}`];
        if (entradaSabado && entradaSabado.medico_id) {
          const medico = medicos.rows.find(m => m.id === entradaSabado.medico_id);
          let texto = formatarNomeMedicoExport(medico);
          if (entradaSabado.observacao) texto += ` (${entradaSabado.observacao})`;
          ws.getCell(linhaSabadoMedico, 2).value = texto;
        }
        linhaAtual++;

        linhaAtual++; // linha em branco entre um consultório e o próximo
      });
    });

    const nomeArquivo = `escala-unimed-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao gerar a planilha' });
  }
});

// ---------- Rota de teste (útil pra conferir que o backend está no ar) ----------
app.get('/api/status', (req, res) => {
  res.json({ ok: true, mensagem: 'Backend da Unimed Consultórios rodando.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));