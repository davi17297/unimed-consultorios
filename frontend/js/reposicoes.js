// ============================================================
// reposicoes.js — registro de plantões repostos em datas
// específicas (fora da escala fixa semanal). Depende de dados.js.
// ============================================================

let reposicaoEditandoId = null;

// Consultórios "vagos" numa data+turno: livres na escala fixa daquele dia
// da semana E ainda não usados por outra reposição na mesma data/turno.
function obterSalasVagas(dados, dataISO, turno, idExcluir) {
  const diaSemana = diaDaSemanaDeData(dataISO);
  if (!diaSemana || !turno) return [];

  const ocupadasPelaEscala = new Set();
  dados.salas.forEach(s => {
    const cel = dados.escala[chaveCelula(s.id, diaSemana, turno)];
    if (cel && cel.medico_id) ocupadasPelaEscala.add(s.id);
  });

  const ocupadasPorReposicao = new Set(
    dados.reposicoes
      .filter(r => r.data === dataISO && r.turno === turno && r.id !== idExcluir)
      .map(r => r.sala_id)
  );

  return dados.salas.filter(s =>
    s.status !== 'manutencao' &&
    !ocupadasPelaEscala.has(s.id) &&
    !ocupadasPorReposicao.has(s.id)
  );
}

function carregarFormularios() {
  const dados = banco.ler();

  const selectMedico = document.getElementById('campo-medico');
  const valorMedico = selectMedico.value;
  selectMedico.innerHTML = '<option value="">Médico...</option>' +
    dados.medicos.map(m => `<option value="${m.id}">${formatarNomeMedico(m)}</option>`).join('');
  if (valorMedico) selectMedico.value = valorMedico;

  const selectMotivo = document.getElementById('campo-motivo');
  if (!selectMotivo.dataset.preenchido) {
    selectMotivo.innerHTML = '<option value="">Motivo...</option>' +
      MOTIVOS_REPOSICAO.map(m => `<option value="${m}">${m}</option>`).join('');
    selectMotivo.dataset.preenchido = '1';
  }

  atualizarSalasVagas();
}

// Chamado sempre que Data ou Turno mudam no formulário
function atualizarSalasVagas() {
  const dados = banco.ler();
  const data = document.getElementById('campo-data').value;
  const turno = document.getElementById('campo-turno').value;
  const selectSala = document.getElementById('campo-sala');
  const valorAtual = selectSala.value;
  const aviso = document.getElementById('aviso-consultorios-vagos');

  if (!data || !turno) {
    selectSala.innerHTML = '<option value="">Escolha data e turno primeiro...</option>';
    aviso.textContent = '';
    return;
  }

  const diaSemana = diaDaSemanaDeData(data);
  if (!diaSemana) {
    selectSala.innerHTML = '<option value="">Não há expediente aos domingos</option>';
    aviso.textContent = '';
    return;
  }

  const vagas = obterSalasVagas(dados, data, turno, reposicaoEditandoId);
  if (vagas.length === 0) {
    selectSala.innerHTML = '<option value="">Nenhum consultório vago nesse dia/turno</option>';
  } else {
    selectSala.innerHTML = '<option value="">Consultório...</option>' +
      vagas.map(s => `<option value="${s.id}">${s.nome}${s.localizacao ? ' — ' + s.localizacao : ''}</option>`).join('');
    if (valorAtual && vagas.some(s => String(s.id) === valorAtual)) selectSala.value = valorAtual;
  }
  aviso.textContent = `${vagas.length} consultório(s) vago(s) em ${diaSemana}, ${turno}.`;
}

document.getElementById('campo-data').addEventListener('change', atualizarSalasVagas);
document.getElementById('campo-turno').addEventListener('change', atualizarSalasVagas);

document.getElementById('form-reposicao').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const botao = document.getElementById('botao-reposicao');
  botao.disabled = true;
  botao.textContent = 'Salvando...';
  try {
    const args = [
      Number(f.medico_id.value),
      Number(f.sala_id.value),
      f.data.value,
      f.turno.value,
      f.motivo.value,
      f.observacao.value || null,
      f.pacientes_atendidos.value ? Number(f.pacientes_atendidos.value) : null
    ];
    if (reposicaoEditandoId) {
      await api.editarReposicao(reposicaoEditandoId, ...args);
    } else {
      await api.criarReposicao(...args);
    }
    await carregarDados();
    cancelarEdicaoReposicao();
    carregarFormularios();
    carregarResumoEtabela();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui salvar essa reposição. Confere sua internet e tenta de novo.');
  } finally {
    botao.disabled = false;
    botao.textContent = reposicaoEditandoId ? 'Salvar edição' : 'Registrar';
  }
});

function editarReposicao(id) {
  const dados = banco.ler();
  const r = dados.reposicoes.find(x => x.id === id);
  if (!r) return;
  reposicaoEditandoId = id;

  const f = document.getElementById('form-reposicao');
  f.medico_id.value = r.medico_id;
  f.data.value = r.data.slice(0, 10);
  f.turno.value = r.turno;
  atualizarSalasVagas(); // recalcula os "vagos", já incluindo a sala atual como opção válida
  f.sala_id.value = r.sala_id;
  f.motivo.value = r.motivo;
  f.pacientes_atendidos.value = r.pacientes_atendidos || '';
  f.observacao.value = r.observacao || '';

  document.getElementById('botao-reposicao').textContent = 'Salvar edição';
  document.getElementById('cancelar-edicao-reposicao').classList.remove('oculto');
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelarEdicaoReposicao() {
  reposicaoEditandoId = null;
  const f = document.getElementById('form-reposicao');
  f.reset();
  document.getElementById('campo-sala').innerHTML = '<option value="">Escolha data e turno primeiro...</option>';
  document.getElementById('aviso-consultorios-vagos').textContent = '';
  document.getElementById('botao-reposicao').textContent = 'Registrar';
  document.getElementById('cancelar-edicao-reposicao').classList.add('oculto');
}

async function excluirReposicao(id) {
  if (!confirm('Excluir esse registro de reposição?')) return;
  try {
    await api.excluirReposicao(id);
    await carregarDados();
    if (reposicaoEditandoId === id) cancelarEdicaoReposicao();
    carregarResumoEtabela();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui excluir. Confere sua internet e tenta de novo.');
  }
}

function mesAtualISO() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

function carregarResumoEtabela() {
  const dados = banco.ler();
  const mesFiltro = document.getElementById('filtro-mes-reposicao').value || mesAtualISO();

  const doMes = dados.reposicoes.filter(r => r.data.startsWith(mesFiltro));

  let totalPacientes = 0;
  const porMotivo = {};
  const porMedico = {};

  const linhasTabela = doMes.map(r => {
    const medico = dados.medicos.find(m => m.id === r.medico_id);
    const sala = dados.salas.find(s => s.id === r.sala_id);
    const pacientes = r.pacientes_atendidos || capacidadeDoMedico(medico, sala);
    totalPacientes += pacientes;

    porMotivo[r.motivo] = porMotivo[r.motivo] || { qtd: 0, pacientes: 0 };
    porMotivo[r.motivo].qtd += 1;
    porMotivo[r.motivo].pacientes += pacientes;

    const nomeMedico = medico ? formatarNomeMedico(medico) : '(médico removido)';
    porMedico[nomeMedico] = porMedico[nomeMedico] || { qtd: 0, pacientes: 0 };
    porMedico[nomeMedico].qtd += 1;
    porMedico[nomeMedico].pacientes += pacientes;

    return `
      <tr>
        <td>${formatarDataBR(r.data)}</td>
        <td>${nomeMedico}</td>
        <td>${sala ? sala.nome : '(consultório removido)'}</td>
        <td>${r.turno}</td>
        <td>${r.motivo}</td>
        <td class="num">${pacientes}</td>
        <td>${r.observacao || ''}</td>
        <td style="text-align:right">
          <button class="acao-icone" onclick="editarReposicao(${r.id})">Editar</button>
          <button class="acao-icone" onclick="excluirReposicao(${r.id})">Excluir</button>
        </td>
      </tr>
    `;
  });

  document.getElementById('resumo-reposicoes-mes').innerHTML = `
    <div class="card stat-card">
      <div class="topo"><span class="rotulo">Reposições no mês</span><span class="badge-ic ic-neutro">↻</span></div>
      <div class="valor num">${doMes.length}</div>
      <div class="rodape">registros</div>
    </div>
    <div class="card stat-card">
      <div class="topo"><span class="rotulo">Pacientes remanejados</span><span class="badge-ic ic-neutro">◔</span></div>
      <div class="valor num">${totalPacientes}</div>
      <div class="rodape">somando a capacidade de cada médico</div>
    </div>
  `;

  document.getElementById('resumo-por-motivo').innerHTML = Object.keys(porMotivo).length > 0
    ? Object.entries(porMotivo).map(([motivo, r]) => `
        <div class="alerta-item">
          <div class="conteudo">
            <div class="titulo">${motivo}</div>
            <div class="detalhe">${r.qtd} reposição(ões) · ${r.pacientes} pacientes</div>
          </div>
        </div>
      `).join('')
    : `<p class="vazio">Nenhuma reposição nesse mês.</p>`;

  const medicosOrdenados = Object.entries(porMedico).sort((a, b) => b[1].pacientes - a[1].pacientes);
  document.getElementById('resumo-por-medico').innerHTML = medicosOrdenados.length > 0
    ? medicosOrdenados.map(([nome, r]) => `
        <div class="alerta-item">
          <div class="conteudo">
            <div class="titulo">${nome}</div>
            <div class="detalhe">${r.qtd} reposição(ões) · ${r.pacientes} pacientes</div>
          </div>
        </div>
      `).join('')
    : `<p class="vazio">Nenhuma reposição nesse mês.</p>`;

  document.getElementById('tabela-reposicoes').innerHTML = linhasTabela.join('') ||
    `<tr><td colspan="8" class="vazio">Nenhuma reposição registrada nesse mês.</td></tr>`;
}

document.getElementById('filtro-mes-reposicao').addEventListener('change', carregarResumoEtabela);

function carregarPaginaReposicoes() {
  carregarFormularios();
  carregarResumoEtabela();
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('filtro-mes-reposicao').value = mesAtualISO();
  try {
    await carregarDados();
    carregarPaginaReposicoes();
  } catch (erro) {
    console.error('Erro ao carregar Reposições:', erro);
    document.getElementById('tabela-reposicoes').innerHTML =
      `<tr><td colspan="8" class="vazio">Não consegui falar com o servidor. Confere sua internet ou tenta de novo em alguns segundos.</td></tr>`;
  }
});

window.atualizarPagina = carregarPaginaReposicoes;