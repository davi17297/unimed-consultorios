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

// O retrato do mês atual agora é atualizado sozinho pelo backend (toda
// vez que os dados são buscados) — não existe mais botão manual aqui.

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
    porMes[mes] = porMes[mes] || { qtd: 0, pacientes: 0, itens: [] };
    porMes[mes].qtd += 1;
    porMes[mes].pacientes += pacientes;
    porMes[mes].itens.push({
      data: r.data, turno: r.turno, motivo: r.motivo, observacao: r.observacao,
      pacientes, medico: medico ? formatarNomeMedico(medico) : '(médico removido)',
      sala: sala ? sala.nome : '(consultório removido)'
    });
  });

  const meses = Object.keys(porMes).sort().reverse();
  document.getElementById('resumo-reposicoes-por-mes').innerHTML = meses.length > 0
    ? meses.map((m, i) => {
        const idDetalhe = `detalhe-reposicoes-${i}`;
        const itensOrdenados = [...porMes[m].itens].sort((a, b) => b.data.localeCompare(a.data));
        const linhasDetalhe = itensOrdenados.map(item => `
          <div class="linha-detalhe-mes">
            <span class="data">${formatarDataBR(item.data)}</span>
            <span class="medico">${item.medico}</span>
            <span class="local">${item.sala} · ${item.turno}</span>
            <span class="motivo">${item.motivo}${item.observacao ? ` — ${item.observacao}` : ''}</span>
            <span class="qtd">${item.pacientes} pac.</span>
          </div>
        `).join('');
        return `
          <div class="item-mes-wrapper">
            <div class="alerta-item">
              <div class="conteudo">
                <div class="titulo">${nomeMesPtBr(m)}</div>
                <div class="detalhe">${porMes[m].qtd} reposição(ões) · ${porMes[m].pacientes} pacientes remanejados</div>
              </div>
              <button type="button" class="botao-expandir" onclick="alternarDetalheMes('${idDetalhe}', this)" aria-label="Ver mais">▾</button>
            </div>
            <div id="${idDetalhe}" class="detalhe-expandido-mes oculto">${linhasDetalhe}</div>
          </div>
        `;
      }).join('')
    : `<p class="vazio">Nenhuma reposição registrada ainda.</p>`;
}

// ---------- Resumo de fechamentos de agenda por mês ----------
function renderizarResumoFechamentosPorMes() {
  const dados = banco.ler();
  const porMes = {};

  (dados.fechamentos || []).forEach(f => {
    const mes = f.data_inicio.slice(0, 7);
    const medico = dados.medicos.find(m => m.id === f.medico_id);
    const sala = dados.salas.find(s => s.id === f.sala_id);
    const nomeMedico = medico ? formatarNomeMedico(medico) : '(médico removido)';
    porMes[mes] = porMes[mes] || { qtd: 0, medicos: new Set(), itens: [] };
    porMes[mes].qtd += 1;
    porMes[mes].medicos.add(nomeMedico);
    porMes[mes].itens.push({
      medico: nomeMedico, sala: sala ? sala.nome : '(consultório removido)',
      dia_semana: f.dia_semana, turno: f.turno,
      data_inicio: f.data_inicio, data_fim: f.data_fim, motivo: f.motivo
    });
  });

  const meses = Object.keys(porMes).sort().reverse();
  document.getElementById('resumo-fechamentos-por-mes').innerHTML = meses.length > 0
    ? meses.map((m, i) => {
        const idDetalhe = `detalhe-fechamentos-${i}`;
        const itensOrdenados = [...porMes[m].itens].sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
        const linhasDetalhe = itensOrdenados.map(item => `
          <div class="linha-detalhe-mes">
            <span class="data">${formatarDataBR(item.data_inicio)} até ${formatarDataBR(item.data_fim)}</span>
            <span class="medico">${item.medico}</span>
            <span class="local">${item.sala} · ${item.dia_semana}, ${item.turno}</span>
            <span class="motivo">${item.motivo || 'sem motivo informado'}</span>
          </div>
        `).join('');
        return `
          <div class="item-mes-wrapper">
            <div class="alerta-item">
              <div class="conteudo">
                <div class="titulo">${nomeMesPtBr(m)}</div>
                <div class="detalhe">${porMes[m].qtd} fechamento(s) · ${porMes[m].medicos.size} médico(s) diferente(s)</div>
              </div>
              <button type="button" class="botao-expandir" onclick="alternarDetalheMes('${idDetalhe}', this)" aria-label="Ver mais">▾</button>
            </div>
            <div id="${idDetalhe}" class="detalhe-expandido-mes oculto">${linhasDetalhe}</div>
          </div>
        `;
      }).join('')
    : `<p class="vazio">Nenhum fechamento de agenda registrado ainda.</p>`;
}

// Abre/fecha o detalhamento de um mês (usado tanto em Reposições quanto
// em Fechamentos de agenda). Gira a setinha e mostra/esconde a lista.
function alternarDetalheMes(idDetalhe, botao) {
  const painel = document.getElementById(idDetalhe);
  if (!painel) return;
  const abrindo = painel.classList.contains('oculto');
  painel.classList.toggle('oculto', !abrindo);
  botao.classList.toggle('aberto', abrindo);
  botao.setAttribute('aria-label', abrindo ? 'Ver menos' : 'Ver mais');
}

function carregarPaginaRelatorios() {
  document.getElementById('nome-mes-atual').textContent = nomeMesPtBr(mesAtualISO());
  document.getElementById('link-exportar-relatorio').href = `${API_BASE_URL}/api/exportar-relatorio`;
  renderizarGraficoEvolucao();
  renderizarSeletorMesDetalhe();
  renderizarResumoReposicoesPorMes();
  renderizarResumoFechamentosPorMes();
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