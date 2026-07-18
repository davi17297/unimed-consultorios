// ============================================================
// importar.js — lê a planilha modelo preenchida, mostra uma
// prévia, e cria tudo (especialidades, médicos, consultórios,
// escala) no backend. Depende de dados.js e da biblioteca SheetJS
// (carregada no importar.html).
// ============================================================

let linhasImportacao = []; // linhas normalizadas, vindas do Excel
let resumoImportacao = null; // { novasEspecialidades, novosMedicos, novasSalas, linhasValidas }

function removerAcentos(txt) {
  return (txt || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function normalizarDia(valor) {
  const bruto = (valor || '').toString().trim();
  const achado = DIAS.find(d => d === bruto);
  if (achado) return achado;
  const semAcento = removerAcentos(bruto);
  const mapa = {
    'segunda': 'Segunda-Feira', 'segunda-feira': 'Segunda-Feira',
    'terca': 'Terça-Feira', 'terca-feira': 'Terça-Feira',
    'quarta': 'Quarta-Feira', 'quarta-feira': 'Quarta-Feira',
    'quinta': 'Quinta-Feira', 'quinta-feira': 'Quinta-Feira',
    'sexta': 'Sexta-Feira', 'sexta-feira': 'Sexta-Feira',
    'sabado': 'Sábado'
  };
  return mapa[semAcento] || null;
}

function normalizarTurno(valor) {
  const bruto = (valor || '').toString().trim();
  const turnosValidos = ['08h às 12h', '12h às 16h', '16h às 20h'];
  if (turnosValidos.includes(bruto)) return bruto;
  if (bruto.includes('08') || bruto.includes('8h')) return '08h às 12h';
  if (bruto.includes('12') && (bruto.includes('16') || bruto.includes('às 1'))) return '12h às 16h';
  if (bruto.includes('16') && bruto.includes('20')) return '16h às 20h';
  return null;
}

function normalizarStatus(valor) {
  const semAcento = removerAcentos(valor);
  return semAcento.includes('manuten') ? 'manutencao' : 'ativo';
}

function listaDeEspecialidades(valor) {
  return (valor || '').toString().split(',').map(s => s.trim()).filter(Boolean);
}

function nomeCompletoSala(salaEspera, consultorio) {
  const se = (salaEspera || '').trim();
  const co = (consultorio || '').trim();
  if (!se) return co;
  if (!co) return se;
  return co.toLowerCase().includes(se.toLowerCase()) ? co : `${se} - ${co}`;
}

// Separa "Dr. Fulano - (13:00 - 16:00) até 23/03" em nome + observação,
// usando o primeiro parêntese como divisor. Se não achar parêntese,
// o texto inteiro vira o nome.
function separarNomeEObservacao(texto) {
  const bruto = (texto || '').toString().trim();
  const idx = bruto.indexOf('(');
  if (idx === -1) return { nome: bruto, obs: '' };
  let nome = bruto.slice(0, idx).trim().replace(/[-–]\s*$/, '').trim();
  const obs = bruto.slice(idx).trim();
  return { nome: nome || bruto, obs };
}

// ---------- Reconhecimento do formato "real" (planilha original da Unimed) ----------
// Identificado pelas abas "BASE CEU" / "BASE MARISTA" (ou qualquer aba
// contendo "BASE" no nome).
function pareceFormatoReal(workbook) {
  return workbook.SheetNames.some(n => /base/i.test(n));
}

function parseFormatoReal(workbook) {
  const linhas = [];
  const avisos = [];
  const abas = workbook.SheetNames.filter(n => /base/i.test(n));

  abas.forEach(nomeAba => {
    const localizacao = /marista/i.test(nomeAba) ? 'Marista' : 'CEU';
    const ws = workbook.Sheets[nomeAba];
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);

    for (let r = range.s.r; r <= range.e.r; r++) {
      const celDia = ws[XLSX.utils.encode_cell({ r, c: 0 })];
      const valorDia = celDia ? String(celDia.v).trim().replace(/\s+/g, ' ') : '';
      if (valorDia !== 'DIA ↓') continue; // não é o início de um bloco de consultório

      const diaRow = r;
      const celHeader = ws[XLSX.utils.encode_cell({ r: diaRow - 1, c: 0 })];
      let headerTexto = celHeader ? String(celHeader.v) : '';
      headerTexto = headerTexto.replace(/^"+|"+$/g, '').trim(); // tira aspas soltas do início/fim

      const partes = headerTexto.split('\n');
      const especialidades = (partes[0] || '').split('|').map(s => s.trim()).filter(Boolean);
      const descricaoSala = (partes[1] || partes[0] || '').trim();

      let salaEspera = descricaoSala, consultorio = '';
      const idxTraco = descricaoSala.indexOf(' - ');
      if (idxTraco > -1) {
        salaEspera = descricaoSala.slice(0, idxTraco).trim();
        consultorio = descricaoSala.slice(idxTraco + 3).trim();
      }
      if (!salaEspera) {
        avisos.push(`Aba "${nomeAba}", linha ${diaRow + 1}: não consegui identificar o nome do consultório — bloco ignorado.`);
        continue;
      }
      const nomeCompleto = nomeCompletoSala(salaEspera, consultorio);

      // Vagas por turno: procura a primeira célula numérica na coluna F
      // dentro do bloco (a posição exata varia de bloco pra bloco).
      let vagasPorTurno = 16;
      for (let rr = diaRow - 1; rr <= diaRow + 9 && rr <= range.e.r; rr++) {
        const c = ws[XLSX.utils.encode_cell({ r: rr, c: 5 })];
        if (c && typeof c.v === 'number') { vagasPorTurno = c.v; break; }
      }

      // Grade de segunda a sexta: linhas diaRow+1 .. diaRow+5, colunas B/C/D
      const diasSemana = ['Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira'];
      const turnosColunas = [[1, '08h às 12h'], [2, '12h às 16h'], [3, '16h às 20h']];

      diasSemana.forEach((diaNome, i) => {
        const linhaDia = diaRow + 1 + i;
        turnosColunas.forEach(([col, turnoNome]) => {
          const cel = ws[XLSX.utils.encode_cell({ r: linhaDia, c: col })];
          if (!cel || !cel.v || !String(cel.v).trim()) return;
          const { nome, obs } = separarNomeEObservacao(cel.v);
          if (!nome) return;
          linhas.push({
            nomeCompleto, salaEspera, localizacao, vagasPorTurno,
            especialidadesConsultorio: especialidades, status: 'ativo',
            dia: diaNome, turno: turnoNome, medico: nome,
            especialidadeMedico: null, observacao: obs
          });
        });
      });

      // Sábado (só turno da manhã): rótulo em diaRow+7, médico em diaRow+8
      const rotuloSabado = ws[XLSX.utils.encode_cell({ r: diaRow + 7, c: 0 })];
      if (rotuloSabado && /s[aá]bado/i.test(String(rotuloSabado.v || ''))) {
        const celMedicoSabado = ws[XLSX.utils.encode_cell({ r: diaRow + 8, c: 1 })];
        if (celMedicoSabado && celMedicoSabado.v && String(celMedicoSabado.v).trim()) {
          const { nome, obs } = separarNomeEObservacao(celMedicoSabado.v);
          linhas.push({
            nomeCompleto, salaEspera, localizacao, vagasPorTurno,
            especialidadesConsultorio: especialidades, status: 'ativo',
            dia: 'Sábado', turno: '08h às 12h', medico: nome,
            especialidadeMedico: null, observacao: obs
          });
        }
      }

      // Garante que o consultório apareça mesmo se não tiver NENHUM
      // horário ocupado (linha "vazia" só com a metadata)
      if (!linhas.some(l => l.nomeCompleto === nomeCompleto)) {
        linhas.push({
          nomeCompleto, salaEspera, localizacao, vagasPorTurno,
          especialidadesConsultorio: especialidades, status: 'ativo',
          dia: null, turno: null, medico: null, especialidadeMedico: null, observacao: ''
        });
      }
    }
  });

  return { linhas, avisos };
}

// ---------- Reconhecimento do formato NOVO (2026): consultórios lado a
// lado na mesma linha da planilha. A âncora é a célula com o texto exato
// "DIA" (sem a seta "↓" que o formato antigo usava).
function pareceFormatoNovo2026(workbook) {
  return workbook.SheetNames.some(nomeAba => {
    const ws = workbook.Sheets[nomeAba];
    if (!ws['!ref']) return false;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cel = ws[XLSX.utils.encode_cell({ r, c })];
        if (cel && String(cel.v).trim().toUpperCase() === 'DIA') return true;
      }
    }
    return false;
  });
}

function localizacaoDaAba(nomeAba) {
  return nomeAba.replace(/\s*\(\d+\)\s*$/, '').trim();
}

function lerRotulosTurno(ws, row, colInicial, maxColunas) {
  const rotulos = [];
  for (let c = colInicial; c < colInicial + maxColunas; c++) {
    const cel = ws[XLSX.utils.encode_cell({ r: row, c })];
    const val = cel ? String(cel.v).trim() : '';
    if (!val) break;
    rotulos.push(val);
  }
  return rotulos;
}

function parseFormatoNovo2026(workbook) {
  const linhas = [];
  const avisos = [];
  const diasSemana = ['Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira'];

  workbook.SheetNames.forEach(nomeAba => {
    const localizacao = localizacaoDaAba(nomeAba);
    const ws = workbook.Sheets[nomeAba];
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Varre TODAS as células (não só a coluna A) procurando "DIA", porque
    // cada consultório lado a lado tem sua própria âncora em colunas diferentes.
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const celDia = ws[XLSX.utils.encode_cell({ r, c })];
        const valorDia = celDia ? String(celDia.v).trim().toUpperCase() : '';
        if (valorDia !== 'DIA') continue;

        const diaRow = r;
        const celHeader = ws[XLSX.utils.encode_cell({ r: diaRow - 1, c })];
        let headerTexto = celHeader ? String(celHeader.v) : '';
        headerTexto = headerTexto.replace(/^"+|"+$/g, '').trim();
        if (!headerTexto) continue;

        const partes = headerTexto.split('\n');
        const especialidades = (partes[0] || '').split('|').map(s => s.trim()).filter(Boolean);
        const descricaoSala = (partes[1] || partes[0] || '').trim();

        let salaEspera = descricaoSala, consultorio = '';
        const idxTraco = descricaoSala.indexOf(' - ');
        if (idxTraco > -1) {
          salaEspera = descricaoSala.slice(0, idxTraco).trim();
          consultorio = descricaoSala.slice(idxTraco + 3).trim();
        }
        if (!salaEspera) continue;
        const nomeCompleto = nomeCompletoSala(salaEspera, consultorio);

        // Cada bloco pode ter horários diferentes dos outros — lê os
        // rótulos de turno específicos desse consultório
        const rotulosBrutos = lerRotulosTurno(ws, diaRow, c + 1, 4);
        const turnosNormalizados = rotulosBrutos.map(normalizarTurno);
        const suportado = rotulosBrutos.length === 3 && turnosNormalizados.every(Boolean);

        if (!suportado) {
          avisos.push(
            `Aba "${nomeAba}", "${nomeCompleto}": usa horários fora do padrão (${rotulosBrutos.join(', ') || 'nenhum encontrado'}) — ` +
            `consultório será cadastrado, mas a escala precisa ser preenchida manualmente na tela Disponibilidade.`
          );
          if (!linhas.some(l => l.nomeCompleto === nomeCompleto)) {
            linhas.push({
              nomeCompleto, salaEspera, localizacao, vagasPorTurno: 16,
              especialidadesConsultorio: especialidades, status: 'ativo',
              dia: null, turno: null, medico: null, especialidadeMedico: null, observacao: ''
            });
          }
          continue;
        }

        diasSemana.forEach((diaNome, i) => {
          const linhaDia = diaRow + 1 + i;
          turnosNormalizados.forEach((turnoNome, indiceTurno) => {
            const colCel = c + 1 + indiceTurno;
            const cel = ws[XLSX.utils.encode_cell({ r: linhaDia, c: colCel })];
            if (!cel || !cel.v || !String(cel.v).trim()) return;
            const { nome, obs } = separarNomeEObservacao(cel.v);
            if (!nome) return;
            linhas.push({
              nomeCompleto, salaEspera, localizacao, vagasPorTurno: 16,
              especialidadesConsultorio: especialidades, status: 'ativo',
              dia: diaNome, turno: turnoNome, medico: nome,
              especialidadeMedico: null, observacao: obs
            });
          });
        });

        // Sábado: rótulo em diaRow+6, médico em diaRow+7 (só o primeiro turno)
        const rotuloSabado = ws[XLSX.utils.encode_cell({ r: diaRow + 6, c })];
        if (rotuloSabado && /s[aá]bado/i.test(String(rotuloSabado.v || ''))) {
          const celMedicoSabado = ws[XLSX.utils.encode_cell({ r: diaRow + 7, c: c + 1 })];
          if (celMedicoSabado && celMedicoSabado.v && String(celMedicoSabado.v).trim()) {
            const { nome, obs } = separarNomeEObservacao(celMedicoSabado.v);
            linhas.push({
              nomeCompleto, salaEspera, localizacao, vagasPorTurno: 16,
              especialidadesConsultorio: especialidades, status: 'ativo',
              dia: 'Sábado', turno: '08h às 12h', medico: nome,
              especialidadeMedico: null, observacao: obs
            });
          }
        }

        if (!linhas.some(l => l.nomeCompleto === nomeCompleto)) {
          linhas.push({
            nomeCompleto, salaEspera, localizacao, vagasPorTurno: 16,
            especialidadesConsultorio: especialidades, status: 'ativo',
            dia: null, turno: null, medico: null, especialidadeMedico: null, observacao: ''
          });
        }
      }
    }
  });

  return { linhas, avisos };
}

// ---------- Passo 2: ler e processar o arquivo ----------
document.getElementById('input-arquivo').addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  const statusEl = document.getElementById('status-arquivo');
  if (!arquivo) return;

  statusEl.textContent = 'Lendo o arquivo...';
  document.getElementById('area-previa').classList.add('oculto');
  document.getElementById('area-resultado').classList.add('oculto');

  try {
    const dadosBinarios = await arquivo.arrayBuffer();
    const workbook = XLSX.read(dadosBinarios, { type: 'array' });

    if (pareceFormatoReal(workbook)) {
      statusEl.textContent = 'Reconheci o formato da planilha da Unimed (abas "BASE ..."), processando...';
      const { linhas, avisos } = parseFormatoReal(workbook);
      linhasImportacao = linhas;
      montarResumo(banco.ler(), avisos);
      statusEl.textContent = `Arquivo lido: ${arquivo.name} — ${linhas.length} linha(s) de horário/consultório encontradas.`;
    } else if (pareceFormatoNovo2026(workbook)) {
      statusEl.textContent = 'Reconheci o formato novo da planilha (consultórios lado a lado), processando...';
      const { linhas, avisos } = parseFormatoNovo2026(workbook);
      linhasImportacao = linhas;
      montarResumo(banco.ler(), avisos);
      statusEl.textContent = `Arquivo lido: ${arquivo.name} — ${linhas.length} linha(s) de horário/consultório encontradas.`;
    } else {
      const nomeAba = workbook.SheetNames.find(n => n.toLowerCase().includes('escala')) || workbook.SheetNames[0];
      const planilha = workbook.Sheets[nomeAba];
      const linhasBrutas = XLSX.utils.sheet_to_json(planilha, { defval: '' });
      processarLinhasModelo(linhasBrutas);
      statusEl.textContent = `Arquivo lido: ${arquivo.name} (${linhasBrutas.length} linha(s) encontradas)`;
    }
  } catch (erro) {
    console.error(erro);
    statusEl.textContent = 'Não consegui ler esse arquivo. Confere se é um .xlsx válido.';
  }
});

function processarLinhasModelo(linhasBrutas) {
  const dados = banco.ler();
  const avisos = [];
  linhasImportacao = [];

  linhasBrutas.forEach((linha, indice) => {
    const salaEspera = (linha['Sala de Espera'] || '').toString().trim();
    const consultorio = (linha['Consultório'] || '').toString().trim();
    if (!salaEspera && !consultorio) return; // linha totalmente vazia, ignora

    if (!salaEspera || !consultorio) {
      avisos.push(`Linha ${indice + 2}: faltando "Sala de Espera" ou "Consultório" — ignorada.`);
      return;
    }

    const diaBruto = linha['Dia da Semana'];
    const turnoBruto = linha['Turno'];
    const medico = (linha['Médico'] || '').toString().trim();

    let dia = null, turno = null;
    if (diaBruto || turnoBruto || medico) {
      dia = normalizarDia(diaBruto);
      turno = normalizarTurno(turnoBruto);
      if ((diaBruto || turnoBruto || medico) && (!dia || !turno || !medico)) {
        avisos.push(`Linha ${indice + 2} (${consultorio}): dia/turno/médico incompleto ou não reconhecido — esse horário específico não será preenchido, mas o consultório será criado.`);
        dia = null; turno = null;
      }
    }

    linhasImportacao.push({
      linhaOriginal: indice + 2,
      nomeCompleto: nomeCompletoSala(salaEspera, consultorio),
      salaEspera,
      vagasPorTurno: Number(linha['Vagas por Turno']) || 16,
      especialidadesConsultorio: listaDeEspecialidades(linha['Especialidades do Consultório']),
      status: normalizarStatus(linha['Status']),
      dia,
      turno,
      medico: medico || null,
      especialidadeMedico: (linha['Especialidade do Médico'] || '').toString().trim() || null,
      observacao: (linha['Observação'] || '').toString().trim()
    });
  });

  montarResumo(dados, avisos);
}

function montarResumo(dados, avisos) {
  // Consultórios únicos (com a metadata da primeira ocorrência de cada um)
  const salasMap = new Map();
  linhasImportacao.forEach(l => {
    if (!salasMap.has(l.nomeCompleto)) {
      salasMap.set(l.nomeCompleto, {
        nome: l.nomeCompleto,
        salaEspera: l.salaEspera,
        localizacao: l.localizacao || null,
        vagasPorTurno: l.vagasPorTurno,
        especialidades: l.especialidadesConsultorio,
        status: l.status
      });
    }
  });

  const nomesExistentes = dados.salas.map(s => removerAcentos(s.nome));
  const novasSalas = Array.from(salasMap.values()).filter(s => !nomesExistentes.includes(removerAcentos(s.nome)));

  const especialidadesExistentes = dados.especialidades.map(e => removerAcentos(e.nome));
  const todasEspecialidadesCitadas = new Set();
  linhasImportacao.forEach(l => {
    l.especialidadesConsultorio.forEach(e => todasEspecialidadesCitadas.add(e));
    if (l.especialidadeMedico) todasEspecialidadesCitadas.add(l.especialidadeMedico);
  });
  const novasEspecialidades = Array.from(todasEspecialidadesCitadas).filter(e => !especialidadesExistentes.includes(removerAcentos(e)));

  const medicosExistentes = dados.medicos.map(m => removerAcentos(m.nome));
  const medicosMap = new Map();
  linhasImportacao.forEach(l => {
    if (l.medico && !medicosMap.has(removerAcentos(l.medico))) {
      medicosMap.set(removerAcentos(l.medico), { nome: l.medico, especialidade: l.especialidadeMedico });
    }
  });
  const novosMedicos = Array.from(medicosMap.values()).filter(m => !medicosExistentes.includes(removerAcentos(m.nome)));

  const linhasComHorario = linhasImportacao.filter(l => l.dia && l.turno && l.medico);

  resumoImportacao = { novasSalas, novasEspecialidades, novosMedicos, linhasComHorario };

  document.getElementById('resumo-previa').innerHTML = `
    <strong>${novasSalas.length}</strong> consultório(s) novo(s) ·
    <strong>${novasEspecialidades.length}</strong> especialidade(s) nova(s) ·
    <strong>${novosMedicos.length}</strong> médico(s) novo(s) ·
    <strong>${linhasComHorario.length}</strong> horário(s) serão preenchidos
  `;

  document.getElementById('avisos-previa').innerHTML = avisos.length > 0
    ? `<div class="card-pad" style="background:var(--amber-100);border-radius:8px;margin-bottom:14px;font-size:12px;color:var(--amber-600)">
        ${avisos.map(a => `<div>⚠ ${a}</div>`).join('')}
      </div>`
    : '';

  document.getElementById('tabela-previa').innerHTML = linhasComHorario.length > 0
    ? linhasComHorario.map(l => `
        <tr><td>${l.nomeCompleto}</td><td>${l.dia}</td><td>${l.turno}</td><td>${l.medico}</td></tr>
      `).join('')
    : `<tr><td class="vazio">Nenhum horário com médico preenchido nas linhas enviadas.</td></tr>`;

  document.getElementById('area-previa').classList.remove('oculto');
}

// ---------- Passo 3: confirmar e gravar tudo no backend ----------
document.getElementById('botao-confirmar').addEventListener('click', async () => {
  const botao = document.getElementById('botao-confirmar');
  const areaResultado = document.getElementById('area-resultado');
  const textoResultado = document.getElementById('texto-resultado');
  botao.disabled = true;

  const relatorio = { especialidades: 0, medicos: 0, salas: 0, horarios: 0, erros: [] };

  try {
    // 1) especialidades novas
    for (const nome of resumoImportacao.novasEspecialidades) {
      botao.textContent = `Criando especialidade "${nome}"...`;
      await api.criarEspecialidade(nome);
      relatorio.especialidades++;
    }
    await carregarDados();

    // 2) médicos novos (já resolvendo a especialidade pelo nome, se informada)
    for (const m of resumoImportacao.novosMedicos) {
      botao.textContent = `Criando médico "${m.nome}"...`;
      const dadosAtuais = banco.ler();
      const esp = m.especialidade
        ? dadosAtuais.especialidades.find(e => removerAcentos(e.nome) === removerAcentos(m.especialidade))
        : null;
      await api.criarMedico(m.nome, esp ? esp.id : null);
      relatorio.medicos++;
    }
    await carregarDados();

    // 3) consultórios novos
    for (const s of resumoImportacao.novasSalas) {
      botao.textContent = `Criando consultório "${s.nome}"...`;
      const dadosAtuais = banco.ler();
      const idsEspecialidades = s.especialidades
        .map(nome => dadosAtuais.especialidades.find(e => removerAcentos(e.nome) === removerAcentos(nome)))
        .filter(Boolean)
        .map(e => e.id);
      await api.criarSala({
        nome: s.nome,
        sala_espera: s.salaEspera,
        localizacao: s.localizacao || null,
        capacidade_por_turno: s.vagasPorTurno,
        status: s.status,
        especialidades_permitidas: idsEspecialidades
      });
      relatorio.salas++;
    }
    await carregarDados();

    // 4) horários (escala)
    for (const l of resumoImportacao.linhasComHorario) {
      botao.textContent = `Preenchendo ${l.nomeCompleto} — ${l.dia} ${l.turno}...`;
      const dadosAtuais = banco.ler();
      const sala = dadosAtuais.salas.find(s => removerAcentos(s.nome) === removerAcentos(l.nomeCompleto));
      const medico = dadosAtuais.medicos.find(m => removerAcentos(m.nome) === removerAcentos(l.medico));
      if (!sala || !medico) {
        relatorio.erros.push(`Não achei o consultório ou médico pra: ${l.nomeCompleto} — ${l.dia} ${l.turno} — ${l.medico}`);
        continue;
      }
      await api.atualizarCelula(sala.id, l.dia, l.turno, medico.id, l.observacao || '');
      relatorio.horarios++;
    }
    await carregarDados();

    textoResultado.innerHTML = `
      <p>✅ Importação concluída!</p>
      <p>${relatorio.especialidades} especialidade(s) criada(s) · ${relatorio.medicos} médico(s) criado(s) ·
      ${relatorio.salas} consultório(s) criado(s) · ${relatorio.horarios} horário(s) preenchido(s).</p>
      ${relatorio.erros.length > 0 ? `<p style="color:var(--red-600)">${relatorio.erros.join('<br>')}</p>` : ''}
      <p><a href="dashboard.html">Ver no Dashboard →</a></p>
    `;
    document.getElementById('area-previa').classList.add('oculto');
    areaResultado.classList.remove('oculto');
  } catch (erro) {
    console.error(erro);
    textoResultado.innerHTML = `<p style="color:var(--red-600)">Deu erro no meio da importação. Confere sua internet e tenta de novo — o que já foi criado até aqui continua salvo.</p>`;
    areaResultado.classList.remove('oculto');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Confirmar Importação';
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('link-exportar').href = `${API_BASE_URL}/api/exportar-planilha`;
  try {
    await carregarDados();
  } catch (erro) {
    console.error('Erro ao carregar dados para importação:', erro);
  }
});

window.atualizarPagina = () => {};