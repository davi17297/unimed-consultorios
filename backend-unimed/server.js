const express = require('express');
const cors = require('cors');
const pool = require('./db');
const ExcelJS = require('exceljs');
const { PNG } = require('pngjs');
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
    const [especialidades, medicos, salasRaw, salaEsp, escalaRaw, reposicoes, fechamentos] = await Promise.all([
      pool.query('SELECT * FROM especialidades ORDER BY nome'),
      pool.query('SELECT * FROM medicos ORDER BY nome'),
      pool.query('SELECT * FROM salas ORDER BY nome'),
      pool.query('SELECT * FROM sala_especialidades'),
      pool.query('SELECT * FROM escala'),
      pool.query("SELECT id, medico_id, sala_id, to_char(data, 'YYYY-MM-DD') AS data, turno, motivo, observacao, pacientes_atendidos FROM reposicoes ORDER BY data DESC"),
      pool.query("SELECT id, medico_id, sala_id, dia_semana, turno, to_char(data_inicio,'YYYY-MM-DD') AS data_inicio, to_char(data_fim,'YYYY-MM-DD') AS data_fim, motivo FROM fechamentos_agenda ORDER BY data_inicio DESC")
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
      reposicoes: reposicoes.rows,
      fechamentos: fechamentos.rows
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
// ---------- FECHAMENTOS DE AGENDA ----------
// Um médico fecha o horário fixo dele por uma semana (7 dias a partir da
// data informada). Não mexe na tabela "escala" — é só uma exceção temporária.
app.post('/api/fechamentos', async (req, res) => {
  const { medico_id, sala_id, dia_semana, turno, data_inicio, motivo } = req.body;
  if (!medico_id || !sala_id || !dia_semana || !turno || !data_inicio) {
    return res.status(400).json({ erro: 'medico_id, sala_id, dia_semana, turno e data_inicio são obrigatórios' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO fechamentos_agenda (medico_id, sala_id, dia_semana, turno, data_inicio, data_fim, motivo)
       VALUES ($1,$2,$3,$4,$5, ($5::date + INTERVAL '6 days')::date, $6) RETURNING *`,
      [medico_id, sala_id, dia_semana, turno, data_inicio, motivo || null]
    );
    res.status(201).json(rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao registrar fechamento' });
  }
});

app.delete('/api/fechamentos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM fechamentos_agenda WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao excluir fechamento' });
  }
});

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
const VERDE_UNIMED = 'FF00995D'; // Verde Primária oficial da Unimed (Pantone 348C)
const LARANJA_UNIMED = 'FFF47920'; // Laranja Secundária (Pantone 1585C), usado pra "Livres"

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

// ---------- RELATÓRIOS (snapshots mensais) ----------
// O frontend calcula a ocupação atual (mesma conta que já usa no
// Dashboard) e manda pra cá salvar como o "retrato" daquele mês.
app.post('/api/snapshots', async (req, res) => {
  const { mes, itens } = req.body;
  if (!mes || !Array.isArray(itens)) {
    return res.status(400).json({ erro: 'mes e itens são obrigatórios' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of itens) {
      await client.query(
        `INSERT INTO snapshots_mensais (mes, sala_id, sala_nome, instalada, atual, livre, percentual)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (mes, sala_id)
         DO UPDATE SET sala_nome=$3, instalada=$4, atual=$5, livre=$6, percentual=$7, criado_em=now()`,
        [mes, item.sala_id, item.sala_nome, item.instalada, item.atual, item.livre, item.percentual]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ ok: true, mes, quantidade: itens.length });
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao salvar snapshot' });
  } finally {
    client.release();
  }
});

app.get('/api/snapshots', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM snapshots_mensais ORDER BY mes ASC, sala_nome ASC');
    res.json(rows);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao carregar snapshots' });
  }
});

app.delete('/api/snapshots/:mes', async (req, res) => {
  try {
    await pool.query('DELETE FROM snapshots_mensais WHERE mes=$1', [req.params.mes]);
    res.status(204).end();
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao excluir snapshot' });
  }
});

// Desenha um gráfico de linha simples num bitmap (sem depender de nenhuma
// biblioteca nativa de canvas — só matemática de pixel, puro JavaScript).
function gerarGraficoLinhaPNG(valores, largura = 640, altura = 300) {
  const png = new PNG({ width: largura, height: altura });
  const margem = { topo: 20, baixo: 30, esquerda: 10, direita: 20 };
  const areaLargura = largura - margem.esquerda - margem.direita;
  const areaAltura = altura - margem.topo - margem.baixo;

  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255; png.data[i + 3] = 255;
  }

  function setPixel(x, y, r, g, b) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= largura || y < 0 || y >= altura) return;
    const idx = (largura * y + x) << 2;
    png.data[idx] = r; png.data[idx + 1] = g; png.data[idx + 2] = b; png.data[idx + 3] = 255;
  }

  function linha(x0, y0, x1, y1, r, g, b, espessura = 2) {
    const dx = x1 - x0, dy = y1 - y0;
    const passos = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= passos; i++) {
      const x = x0 + (dx * i) / passos;
      const y = y0 + (dy * i) / passos;
      for (let ox = -espessura; ox <= espessura; ox++) {
        for (let oy = -espessura; oy <= espessura; oy++) {
          if (ox * ox + oy * oy <= espessura * espessura) setPixel(x + ox, y + oy, r, g, b);
        }
      }
    }
  }

  for (let f = 0; f <= 4; f++) {
    const y = margem.topo + areaAltura - (f / 4) * areaAltura;
    linha(margem.esquerda, y, largura - margem.direita, y, 231, 235, 233, 0);
  }
  linha(margem.esquerda, margem.topo, margem.esquerda, altura - margem.baixo, 231, 235, 233, 1);
  linha(margem.esquerda, altura - margem.baixo, largura - margem.direita, altura - margem.baixo, 231, 235, 233, 1);

  if (valores.length > 0) {
    const pontos = valores.map((v, i) => ({
      x: margem.esquerda + (valores.length === 1 ? areaLargura / 2 : (i / (valores.length - 1)) * areaLargura),
      y: margem.topo + areaAltura - v * areaAltura
    }));
    for (let i = 0; i < pontos.length - 1; i++) {
      linha(pontos[i].x, pontos[i].y, pontos[i + 1].x, pontos[i + 1].y, 0, 153, 93, 3);
    }
    pontos.forEach(p => linha(p.x, p.y, p.x, p.y, 0, 153, 93, 5));
  }

  return PNG.sync.write(png);
}

// ---------- EXPORTAR RELATÓRIO (com "gráfico" via barras de dados do Excel) ----------
const NOMES_MESES_EXPORT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function nomeMesExport(mesISO) {
  const [ano, mes] = mesISO.split('-').map(Number);
  return `${NOMES_MESES_EXPORT[mes - 1]} de ${ano}`;
}

app.get('/api/exportar-relatorio', async (req, res) => {
  try {
    const [{ rows }, salasRaw, salaEsp, especialidades] = await Promise.all([
      pool.query('SELECT * FROM snapshots_mensais ORDER BY mes ASC, sala_nome ASC'),
      pool.query('SELECT id, localizacao FROM salas'),
      pool.query('SELECT * FROM sala_especialidades'),
      pool.query('SELECT * FROM especialidades')
    ]);

    // Descobre o "grupo clássico" de cada consultório, do mesmo jeito que
    // a planilha antiga da Unimed organizava: consultório com UMA especialidade
    // só vira "Consultório Fixo - X"; com várias/nenhuma vira "Consultórios mistos"
    // (separado por local quando for ESB/Marista).
    function grupoClassico(salaId, salaNomeFallback) {
      const sala = salasRaw.rows.find(s => s.id === salaId);
      const idsEsp = salaEsp.rows.filter(e => e.sala_id === salaId).map(e => e.especialidade_id);
      const nomesEsp = especialidades.rows.filter(e => idsEsp.includes(e.id)).map(e => e.nome);
      if (nomesEsp.length === 1) return `Consultório Fixo - ${nomesEsp[0]}`;
      const loc = ((sala && sala.localizacao) || '').toLowerCase();
      if (loc.includes('esb')) return 'Consultórios mistos - ESB';
      if (loc.includes('marista')) return 'Consultórios mistos - Marista';
      return 'Consultórios mistos';
    }
    function prioridadeGrupo(nome) {
      if (nome === 'Consultórios mistos') return 0;
      if (nome.startsWith('Consultório Fixo - ')) return 1;
      return 2;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema Unimed Goiânia';
    workbook.created = new Date();

    // ---- Aba 1: Evolução mensal (uma linha por mês, com barra de % nativa) ----
    const wsEvolucao = workbook.addWorksheet('Evolução Mensal');
    wsEvolucao.columns = [
      { header: 'Mês', width: 22 },
      { header: 'Capacidade Instalada', width: 20 },
      { header: 'Capacidade Atual', width: 18 },
      { header: 'Capacidade Livre', width: 18 },
      { header: '% Ocupação', width: 14 },
      { header: '', width: 3 },
      { header: 'Ocupados', width: 16 },
      { header: 'Livres', width: 16 }
    ];
    wsEvolucao.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsEvolucao.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_UNIMED } };
    wsEvolucao.getCell('F1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_UNIMED } };

    const meses = [...new Set(rows.map(r => r.mes))].sort();
    const percentuaisParaGrafico = [];

    meses.forEach((mes, i) => {
      const doMes = rows.filter(r => r.mes === mes);
      const totalInstalada = doMes.reduce((s, r) => s + r.instalada, 0);
      const totalAtual = doMes.reduce((s, r) => s + r.atual, 0);
      const totalLivre = totalInstalada - totalAtual;
      const percentual = totalInstalada > 0 ? totalAtual / totalInstalada : 0;
      percentuaisParaGrafico.push(percentual);

      const linha = i + 2;
      wsEvolucao.getCell(`A${linha}`).value = nomeMesExport(mes);
      wsEvolucao.getCell(`B${linha}`).value = totalInstalada;
      wsEvolucao.getCell(`C${linha}`).value = totalAtual;
      wsEvolucao.getCell(`D${linha}`).value = totalLivre;
      const celPct = wsEvolucao.getCell(`E${linha}`);
      celPct.value = percentual;
      celPct.numFmt = '0.0%';

      // Caixinhas coloridas Ocupados (verde) / Livres (laranja), como na
      // planilha original
      const celOcupados = wsEvolucao.getCell(`G${linha}`);
      celOcupados.value = `Ocupados ${(percentual * 100).toFixed(0)}%`;
      celOcupados.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      celOcupados.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_UNIMED } };
      celOcupados.alignment = { horizontal: 'center' };

      const celLivres = wsEvolucao.getCell(`H${linha}`);
      celLivres.value = `Livres ${((1 - percentual) * 100).toFixed(0)}%`;
      celLivres.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      celLivres.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA_UNIMED } };
      celLivres.alignment = { horizontal: 'center' };
    });

    if (meses.length > 0) {
      wsEvolucao.addConditionalFormatting({
        ref: `E2:E${meses.length + 1}`,
        rules: [{
          type: 'dataBar', minLength: 0, maxLength: 100,
          color: { argb: VERDE_UNIMED },
          cfvo: [{ type: 'min' }, { type: 'max' }],
          priority: 1
        }]
      });

      // Gráfico de linha de verdade (imagem gerada em JS), colocado à
      // direita das tabelas
      const bufferGrafico = gerarGraficoLinhaPNG(percentuaisParaGrafico);
      const imgId = workbook.addImage({ buffer: bufferGrafico, extension: 'png' });
      const primeiraLinhaGrafico = meses.length + 4;
      wsEvolucao.getCell(`A${primeiraLinhaGrafico}`).value = 'Evolução da % de Ocupação';
      wsEvolucao.getCell(`A${primeiraLinhaGrafico}`).font = { bold: true };
      wsEvolucao.addImage(imgId, {
        tl: { col: 0, row: primeiraLinhaGrafico },
        ext: { width: 640, height: 300 }
      });
    }

    // ---- Aba 2: Detalhe por consultório em cada mês ----
    const wsDetalhe = workbook.addWorksheet('Detalhe por Consultório');
    wsDetalhe.columns = [
      { header: 'Mês', width: 20 },
      { header: 'Consultório', width: 34 },
      { header: 'Instalada', width: 14 },
      { header: 'Atual', width: 14 },
      { header: 'Livre', width: 14 },
      { header: '% Ocupação', width: 16 }
    ];
    wsDetalhe.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsDetalhe.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_UNIMED } };

    rows.forEach((r, i) => {
      const linha = i + 2;
      wsDetalhe.getCell(`A${linha}`).value = nomeMesExport(r.mes);
      wsDetalhe.getCell(`B${linha}`).value = r.sala_nome;
      wsDetalhe.getCell(`C${linha}`).value = r.instalada;
      wsDetalhe.getCell(`D${linha}`).value = r.atual;
      wsDetalhe.getCell(`E${linha}`).value = r.livre;
      const celPct = wsDetalhe.getCell(`F${linha}`);
      celPct.value = Number(r.percentual);
      celPct.numFmt = '0.0%';
    });

    if (rows.length > 0) {
      wsDetalhe.addConditionalFormatting({
        ref: `F2:F${rows.length + 1}`,
        rules: [{
          type: 'dataBar', minLength: 0, maxLength: 100,
          color: { argb: VERDE_UNIMED },
          cfvo: [{ type: 'min' }, { type: 'max' }],
          priority: 1
        }]
      });
    }

    // ---- Aba 3: Formato clássico da Unimed (agrupado, um bloco de colunas por mês) ----
    const TOTAL_ENCAIXES_EXPORT = 16;
    const wsClassico = workbook.addWorksheet('Histórico Mensal (Unimed)');

    // Agrega instalada/atual/livre por [mes][grupo]
    const dadosPorMesGrupo = {};
    rows.forEach(r => {
      const grupo = grupoClassico(r.sala_id, r.sala_nome);
      dadosPorMesGrupo[r.mes] = dadosPorMesGrupo[r.mes] || {};
      if (!dadosPorMesGrupo[r.mes][grupo]) {
        dadosPorMesGrupo[r.mes][grupo] = { instalada: 0, atual: 0, livre: 0, numSalas: 0 };
      }
      dadosPorMesGrupo[r.mes][grupo].instalada += r.instalada;
      dadosPorMesGrupo[r.mes][grupo].atual += r.atual;
      dadosPorMesGrupo[r.mes][grupo].livre += r.livre;
      dadosPorMesGrupo[r.mes][grupo].numSalas += 1;
    });

    const mesesClassico = Object.keys(dadosPorMesGrupo).sort();
    const gruposUnicos = [...new Set(rows.map(r => grupoClassico(r.sala_id, r.sala_nome)))]
      .sort((a, b) => {
        const pa = prioridadeGrupo(a), pb = prioridadeGrupo(b);
        return pa !== pb ? pa - pb : a.localeCompare(b);
      });

    const LARGURA_BLOCO = 9; // 5 colunas de dados + 1 vazia + 2 da caixinha % + 1 vazia antes do próximo mês

    mesesClassico.forEach((mes, indiceMes) => {
      const colBase = indiceMes * LARGURA_BLOCO + 1;
      wsClassico.getColumn(colBase).width = 16;
      wsClassico.getColumn(colBase + 1).width = 10;
      wsClassico.getColumn(colBase + 2).width = 20;
      wsClassico.getColumn(colBase + 3).width = 10;
      wsClassico.getColumn(colBase + 4).width = 14;
      wsClassico.getColumn(colBase + 6).width = 12;
      wsClassico.getColumn(colBase + 7).width = 10;

      gruposUnicos.forEach((grupo, indiceGrupo) => {
        const linhaBase = indiceGrupo * 6 + 1;
        const dadosGrupo = dadosPorMesGrupo[mes][grupo];

        // Título do bloco (mesmo sem dado nesse mês, mostra o cabeçalho vazio)
        wsClassico.mergeCells(linhaBase, colBase, linhaBase, colBase + 4);
        const celTitulo = wsClassico.getCell(linhaBase, colBase);
        celTitulo.value = `${grupo} - ${nomeMesExport(mes)}`;
        celTitulo.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        celTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_UNIMED } };
        celTitulo.alignment = { horizontal: 'center', vertical: 'middle' };

        const celPctHeader = wsClassico.getCell(linhaBase, colBase + 6);
        celPctHeader.value = '%';
        celPctHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        celPctHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_UNIMED } };
        celPctHeader.alignment = { horizontal: 'center' };

        if (!dadosGrupo) return; // esse grupo não tem dado registrado nesse mês

        const periodosTotais = dadosGrupo.numSalas * TOTAL_ENCAIXES_EXPORT;
        const percentual = dadosGrupo.instalada > 0 ? dadosGrupo.atual / dadosGrupo.instalada : 0;
        const ocupadosAprox = Math.round(percentual * periodosTotais);
        const livresAprox = periodosTotais - ocupadosAprox;

        // Linha "N Períodos | | Capacidade instalada: | valor | agendamentos"
        wsClassico.getCell(linhaBase + 2, colBase).value = `${periodosTotais} Períodos`;
        wsClassico.getCell(linhaBase + 2, colBase + 2).value = 'Capacidade instalada:';
        wsClassico.getCell(linhaBase + 2, colBase + 3).value = dadosGrupo.instalada;
        wsClassico.getCell(linhaBase + 2, colBase + 4).value = 'agendamentos';

        // Linha "Ocupados | contagem | Capacidade atual: | valor | agendamentos"
        wsClassico.getCell(linhaBase + 3, colBase).value = 'Ocupados';
        wsClassico.getCell(linhaBase + 3, colBase + 1).value = ocupadosAprox;
        wsClassico.getCell(linhaBase + 3, colBase + 2).value = 'Capacidade atual:';
        wsClassico.getCell(linhaBase + 3, colBase + 3).value = dadosGrupo.atual;
        wsClassico.getCell(linhaBase + 3, colBase + 4).value = 'agendamentos';

        // Linha "Livres: | contagem | Capacidade livre: | valor | agendamentos"
        wsClassico.getCell(linhaBase + 4, colBase).value = 'Livres:';
        wsClassico.getCell(linhaBase + 4, colBase + 1).value = livresAprox;
        wsClassico.getCell(linhaBase + 4, colBase + 2).value = 'Capacidade livre:';
        wsClassico.getCell(linhaBase + 4, colBase + 3).value = dadosGrupo.livre;
        wsClassico.getCell(linhaBase + 4, colBase + 4).value = 'agendamentos';

        // Caixinha colorida de % (Ocupados verde / Livres laranja)
        const celOcupadosPct = wsClassico.getCell(linhaBase + 3, colBase + 6);
        celOcupadosPct.value = 'Ocupados';
        celOcupadosPct.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        celOcupadosPct.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_UNIMED } };
        const celOcupadosPctValor = wsClassico.getCell(linhaBase + 3, colBase + 7);
        celOcupadosPctValor.value = percentual;
        celOcupadosPctValor.numFmt = '0%';
        celOcupadosPctValor.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        celOcupadosPctValor.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_UNIMED } };

        const celLivresPct = wsClassico.getCell(linhaBase + 4, colBase + 6);
        celLivresPct.value = 'Livres';
        celLivresPct.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        celLivresPct.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA_UNIMED } };
        const celLivresPctValor = wsClassico.getCell(linhaBase + 4, colBase + 7);
        celLivresPctValor.value = 1 - percentual;
        celLivresPctValor.numFmt = '0%';
        celLivresPctValor.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        celLivresPctValor.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA_UNIMED } };
      });
    });

    const nomeArquivo = `relatorio-ocupacao-unimed-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao gerar o relatório' });
  }
});

// ---------- Rota de teste (útil pra conferir que o backend está no ar) ----------
app.get('/api/status', (req, res) => {
  res.json({ ok: true, mensagem: 'Backend da Unimed Consultórios rodando.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));