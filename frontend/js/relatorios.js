// ============================================================
// relatorios.js — histórico mensal de ocupação (snapshots) +
// resumo de reposições por mês. Depende de dados.js.
// ============================================================

let snapshotsCache = [];

async function carregarSnapshots() {
  snapshotsCache = await api.buscarSnapshots();
}

function mesesUnicosOrdenados() {
  return [...new Set(snapshotsCache.map(s => s.mes))].sort();
}

// ---------- Botão "Salvar retrato do mês atual" ----------
document.getElementById('botao-salvar-snapshot').addEventListener('click', async () => {
  const botao = document.getElementById('botao-salvar-snapshot');
  const status = document.getElementById('status-snapshot');
  botao.disabled = true;
  status.textContent = 'Salvando...';
  try {
    const { salas } = calcularDashboard();
    const itens = salas.map(r => ({
      sala_id: r.sala.id,
      sala_nome: r.sala.nome,
      instalada: r.instalada,
      atual: r.atual,
      livre: r.livre,
      percentual: r.percentual
    }));
    await api.salvarSnapshot(mesAtualISO(), itens);
    await carregarSnapshots();
    renderizarGraficoEvolucao();
    renderizarSeletorMesDetalhe();
    status.textContent = `Salvo! (${itens.length} consultório(s) registrados)`;
  } catch (erro) {
    console.error(erro);
    status.textContent = 'Não consegui salvar. Confere sua internet e tenta de novo.';
  } finally {
    botao.disabled = false;
  }
});

// ---------- Gráfico de evolução (% médio por mês) ----------
function renderizarGraficoEvolucao() {
  const grafico = document.getElementById('grafico-evolucao');
  const aviso = document.getElementById('aviso-sem-historico');
  const meses = mesesUnicosOrdenados();

  if (meses.length === 0) {
    grafico.innerHTML = '';
    aviso.classList.remove('oculto');
    return;
  }
  aviso.classList.add('oculto');

  const mesAtual = mesAtualISO();
  grafico.innerHTML = meses.map(mes => {
    const doMes = snapshotsCache.filter(s => s.mes === mes);
    const totalInstalada = doMes.reduce((soma, s) => soma + s.instalada, 0);
    const totalAtual = doMes.reduce((soma, s) => soma + s.atual, 0);
    const percentual = totalInstalada > 0 ? totalAtual / totalInstalada : 0;
    const alturaPct = Math.max(4, Math.round(percentual * 100));
    return `
      <div class="barra-col ${mes === mesAtual ? 'selecionado' : ''}" title="${nomeMesPtBr(mes)}: ${pct(percentual)}">
        <div class="numero">${pct(percentual)}</div>
        <div class="haste" style="height:${alturaPct}%"></div>
        <div class="rotulo-dia">${mesAbreviado(mes)}</div>
      </div>
    `;
  }).join('');
}

// ---------- Detalhe por consultório num mês escolhido ----------
function renderizarSeletorMesDetalhe() {
  const seletor = document.getElementById('seletor-mes-detalhe');
  const valorAtual = seletor.value;
  const meses = mesesUnicosOrdenados().reverse(); // mais recente primeiro

  seletor.innerHTML = meses.length > 0
    ? meses.map(m => `<option value="${m}">${nomeMesPtBr(m)}</option>`).join('')
    : '<option value="">Nenhum retrato salvo ainda</option>';

  if (valorAtual && meses.includes(valorAtual)) seletor.value = valorAtual;
  renderizarTabelaDetalhe();
}

function renderizarTabelaDetalhe() {
  const mes = document.getElementById('seletor-mes-detalhe').value;
  const corpo = document.getElementById('tabela-detalhe-mes');
  const doMes = snapshotsCache.filter(s => s.mes === mes).sort((a, b) => a.sala_nome.localeCompare(b.sala_nome));

  corpo.innerHTML = doMes.length > 0
    ? doMes.map(s => {
        const c = corPorOcupacao(Number(s.percentual));
        return `
          <tr>
            <td>${s.sala_nome}</td>
            <td class="num">${s.instalada}</td>
            <td class="num">${s.atual}</td>
            <td class="num">${s.livre}</td>
            <td class="num" style="color:${c.cor};font-weight:600">${pct(Number(s.percentual))}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="5" class="vazio">Nenhum retrato salvo pra esse mês ainda.</td></tr>`;
}

document.getElementById('seletor-mes-detalhe').addEventListener('change', renderizarTabelaDetalhe);

// ---------- Resumo de reposições por mês (usa o cache principal, não os snapshots) ----------
function renderizarResumoReposicoesPorMes() {
  const dados = banco.ler();
  const porMes = {};

  (dados.reposicoes || []).forEach(r => {
    const mes = r.data.slice(0, 7);
    const medico = dados.medicos.find(m => m.id === r.medico_id);
    const sala = dados.salas.find(s => s.id === r.sala_id);
    const pacientes = r.pacientes_atendidos || capacidadeDoMedico(medico, sala);
    porMes[mes] = porMes[mes] || { qtd: 0, pacientes: 0 };
    porMes[mes].qtd += 1;
    porMes[mes].pacientes += pacientes;
  });

  const meses = Object.keys(porMes).sort().reverse();
  document.getElementById('resumo-reposicoes-por-mes').innerHTML = meses.length > 0
    ? meses.map(m => `
        <div class="alerta-item">
          <div class="conteudo">
            <div class="titulo">${nomeMesPtBr(m)}</div>
            <div class="detalhe">${porMes[m].qtd} reposição(ões) · ${porMes[m].pacientes} pacientes remanejados</div>
          </div>
        </div>
      `).join('')
    : `<p class="vazio">Nenhuma reposição registrada ainda.</p>`;
}

function carregarPaginaRelatorios() {
  document.getElementById('nome-mes-atual').textContent = nomeMesPtBr(mesAtualISO());
  document.getElementById('link-exportar-relatorio').href = `${API_BASE_URL}/api/exportar-relatorio`;
  renderizarGraficoEvolucao();
  renderizarSeletorMesDetalhe();
  renderizarResumoReposicoesPorMes();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await carregarDados();
    await carregarSnapshots();
    carregarPaginaRelatorios();
  } catch (erro) {
    console.error('Erro ao carregar Relatórios:', erro);
    document.getElementById('grafico-evolucao').innerHTML = '';
    document.getElementById('aviso-sem-historico').textContent =
      'Não consegui falar com o servidor. Confere sua internet ou tenta de novo em alguns segundos.';
    document.getElementById('aviso-sem-historico').classList.remove('oculto');
  }
});

window.atualizarPagina = async () => {
  await carregarSnapshots();
  carregarPaginaRelatorios();
};