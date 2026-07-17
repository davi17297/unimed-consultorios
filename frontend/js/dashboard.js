// ============================================================
// dashboard.js — só o que é específico da tela de Dashboard.
// Depende de dados.js (já incluído antes deste arquivo).
// ============================================================

// Guarda qual dia está sendo mostrado no painel "Livre agora".
// Começa em "hoje" e muda quando a pessoa clica numa barra do gráfico.
let diaPainelLivre = null;

function carregarDashboard() {
  const dados = banco.ler();
  const { salas, totais } = calcularDashboard();
  const hoje = diaDeHoje();
  const turno = turnoAtual(); // null = fora do expediente agora

  if (!diaPainelLivre) diaPainelLivre = hoje || 'Segunda-Feira';

  let salasLivresAgora = 0;
  let salasOcupadasAgora = 0;
  let horariosLivresHoje = 0;

  salas.forEach(r => {
    const emManutencao = (r.sala.status === 'manutencao');
    if (hoje) horariosLivresHoje += r.encaixesLivresHoje.length;

    if (!turno) return; // fora do expediente: não conta livre nem ocupado

    if (emManutencao) {
      salasOcupadasAgora += 1;
      return;
    }
    const celulaAgora = dados.escala[chaveCelula(r.sala.id, hoje, turno)];
    if (celulaAgora && celulaAgora.medico_id) {
      salasOcupadasAgora += 1;
    } else {
      salasLivresAgora += 1;
    }
  });

  document.getElementById('card-livres').textContent = turno ? salasLivresAgora : '—';
  document.getElementById('card-ocupados').textContent = turno ? salasOcupadasAgora : '—';
  document.getElementById('card-ocupacao').textContent = pct(totais.percentual);
  document.getElementById('card-horarios-hoje').textContent = hoje ? horariosLivresHoje : '—';
  document.getElementById('card-livres-rodape').textContent = turno ? `agora (${turno})` : 'fora do expediente agora';
  document.getElementById('card-ocupados-rodape').textContent = turno ? 'incluindo manutenção' : 'fora do expediente agora';

  // ---- Gráfico de barras: ocupação por dia da semana (clicável) ----
  const resumoPorDia = calcularResumoPorDia(dados, salas);

  const grafico = document.getElementById('grafico-barras');
  grafico.innerHTML = resumoPorDia.map(r => {
    const alturaPct = Math.max(4, Math.round(r.percentualDia * 100));
    const ehHoje = r.dia === hoje;
    const selecionado = r.dia === diaPainelLivre;
    return `
      <div class="barra-col ${selecionado ? 'selecionado' : ''}" onclick="selecionarDiaPainel('${r.dia}')" title="Ver disponibilidade de ${r.dia}">
        <div class="numero">${pct(r.percentualDia)}</div>
        <div class="haste" style="height:${alturaPct}%"></div>
        <div class="rotulo-dia">${DIAS_ABREV[r.dia]}${ehHoje ? ' •' : ''}</div>
      </div>
    `;
  }).join('');

  // ---- Livre agora (no dia escolhido no gráfico, por turno) ----
  renderizarPainelLivre(dados, salas, diaPainelLivre, hoje);

  // ---- Alertas ----
  const alertas = [];
  salas.forEach(r => {
    if (r.sala.status === 'manutencao') {
      alertas.push({ titulo: r.sala.nome, detalhe: 'Em manutenção', cor: 'ponto-vermelho' });
    }
  });
  if (salas.length > 0) {
    const maisVagas = resumoPorDia.reduce((a, b) => (b.totalLivresNoDia > a.totalLivresNoDia ? b : a));
    if (maisVagas.totalLivresNoDia > 0) {
      alertas.push({ titulo: maisVagas.dia, detalhe: `${maisVagas.totalLivresNoDia} horários vagos`, cor: 'ponto-verde' });
    }
    resumoPorDia.forEach(r => {
      if (r.totalEncaixesNoDia > 0 && r.totalLivresNoDia === 0) {
        alertas.push({ titulo: r.dia, detalhe: 'Ocupação máxima (100%)', cor: 'ponto-ambar' });
      }
    });
  }
  document.getElementById('alertas').innerHTML = alertas.length > 0
    ? alertas.map(a => `
        <div class="alerta-item">
          <span class="ponto ${a.cor}" style="margin-top:6px"></span>
          <div class="conteudo">
            <div class="titulo">${a.titulo}</div>
            <div class="detalhe">${a.detalhe}</div>
          </div>
        </div>
      `).join('')
    : `<p class="vazio">Nenhum alerta no momento.</p>`;

  // ---- Tabela de consultórios ----
  const corpo = document.getElementById('tabela-dashboard');
  if (salas.length === 0) {
    corpo.innerHTML = `<tr><td colspan="7" class="vazio">Nenhum consultório cadastrado ainda. Vá em "Consultórios" para começar.</td></tr>`;
    return;
  }
  corpo.innerHTML = salas.map(r => {
    const c = corPorOcupacao(r.percentual);
    const statusManutencao = r.sala.status === 'manutencao';
    return `
      <tr>
        <td>
          <div class="nome-sala">${r.sala.nome}</div>
          ${r.sala.localizacao ? `<span class="sub">${r.sala.localizacao}</span>` : ''}
        </td>
        <td>
          <div class="barra-mini-track"><div class="barra-mini-fill" style="width:${(r.percentual*100).toFixed(0)}%;background:${c.cor}"></div></div>
          <span class="num" style="color:${c.cor};font-weight:600">${pct(r.percentual)}</span>
        </td>
        <td class="num">${r.instalada}</td>
        <td class="num">${r.atual}</td>
        <td class="num">${r.livres}/${TOTAL_ENCAIXES}</td>
        <td class="num">${r.livre}</td>
        <td>${statusManutencao ? `<span class="pill pill-vermelho">Manutenção</span>` : `<span class="pill pill-verde">Ativo</span>`}</td>
      </tr>
    `;
  }).join('');
}

// Preenche o painel "Livre agora — <dia>" pro dia escolhido no gráfico
function renderizarPainelLivre(dados, salas, dia, hoje) {
  const nomeDia = document.getElementById('nome-dia-hoje');
  const areaDisp = document.getElementById('disponibilidade-hoje');

  nomeDia.textContent = dia + (dia === hoje ? ' (hoje)' : '');

  if (salas.length === 0) {
    areaDisp.innerHTML = `<p class="vazio">Cadastre consultórios para ver a disponibilidade.</p>`;
    return;
  }
  areaDisp.innerHTML = turnosDoDia(dia).map(turno => {
    const salasLivresNesseTurno = salas.filter(r => turnosLivresNoDia(dados, r.sala, dia).includes(turno));
    return `
      <div class="turno-bloco">
        <div class="cab"><span>${turno}</span><span>${salasLivresNesseTurno.length}</span></div>
        <ul>
          ${salasLivresNesseTurno.length > 0
            ? salasLivresNesseTurno.map(r => `<li><span class="ponto ponto-verde"></span>${r.sala.nome}</li>`).join('')
            : '<li class="vazio" style="background:none;padding-left:0">Nenhum consultório livre.</li>'}
        </ul>
      </div>
    `;
  }).join('');
}

// Chamado ao clicar numa barra do gráfico "Ocupação por dia da semana"
function selecionarDiaPainel(dia) {
  diaPainelLivre = dia;
  carregarDashboard();
}

// window.atualizarPagina é chamado pelo botão "Atualizar" do topo (via
// layout.js), DEPOIS que ele já buscou os dados novos — aqui é só re-render.
window.atualizarPagina = carregarDashboard;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await carregarDados();
    carregarDashboard();
  } catch (erro) {
    console.error('Erro ao carregar o Dashboard:', erro);
    document.getElementById('grafico-barras').innerHTML = '';
    document.getElementById('alertas').innerHTML =
      `<p class="vazio">Não consegui falar com o servidor. Confere sua internet ou tenta de novo em alguns segundos.</p>`;
  }
});