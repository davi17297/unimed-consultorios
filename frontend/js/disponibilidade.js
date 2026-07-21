// ============================================================
// disponibilidade.js — grade semanal (estilo planilha) de um
// consultório por vez, com filtro de local/andar e busca por médico.
// Depende de dados.js.
// ============================================================

// Preenche o dropdown de Andar/Local com os locais que existem nos
// consultórios cadastrados (vem do campo "localizacao" de cada sala).
function carregarSeletorLocal() {
  const dados = banco.ler();
  const locais = [...new Set(dados.salas.map(s => s.localizacao).filter(Boolean))].sort();
  const seletor = document.getElementById('seletor-local');
  const valorAtual = seletor.value;
  seletor.innerHTML = '<option value="">Todos os locais</option>' +
    locais.map(l => `<option value="${l}">${l}</option>`).join('');
  if (valorAtual && locais.includes(valorAtual)) seletor.value = valorAtual;
}

// O seletor de Consultório respeita o filtro de local escolhido acima.
function carregarSeletorSala(voltarParaTodos) {
  const dados = banco.ler();
  const localFiltro = document.getElementById('seletor-local').value;
  const seletor = document.getElementById('seletor-sala');
  const valorAtual = seletor.value;

  const salasFiltradas = localFiltro
    ? dados.salas.filter(s => s.localizacao === localFiltro)
    : dados.salas;

  if (salasFiltradas.length === 0) {
    seletor.innerHTML = '<option value="">Nenhum consultório nesse local</option>';
    return;
  }

  // Agrupa por Sala de Espera (mesma lógica usada na tela de Consultórios)
  const grupos = new Map();
  salasFiltradas.forEach(s => {
    const grupo = obterGrupoSalaEspera(s);
    if (!grupos.has(grupo)) grupos.set(grupo, []);
    grupos.get(grupo).push(s);
  });

  let html = '<option value="__todos__">— Ver todos (rolar a tela) —</option>';
  grupos.forEach((salasDoGrupo, nomeGrupo) => {
    html += `<optgroup label="${nomeGrupo}">`;
    html += salasDoGrupo.map(s => {
      const rotulo = s.nome.includes(' - Consultório ') ? s.nome.split(' - Consultório ')[1] : s.nome;
      return `<option value="${s.id}">${s.nome.includes(' - Consultório ') ? 'Consultório ' + rotulo : rotulo}</option>`;
    }).join('');
    html += `</optgroup>`;
  });

  seletor.innerHTML = html;
  if (!voltarParaTodos && valorAtual && salasFiltradas.some(s => String(s.id) === valorAtual)) {
    seletor.value = valorAtual;
  } else {
    seletor.value = '__todos__';
  }
}

// Preenche a lista de sugestões (datalist) com os nomes dos médicos
function carregarListaMedicosBusca() {
  const dados = banco.ler();
  document.getElementById('lista-medicos-disponibilidade').innerHTML =
    dados.medicos.map(m => `<option value="${formatarNomeMedico(m)}">`).join('');
}

// Ao digitar/escolher um médico, mostra a agenda dele (onde e quando
// atende), procurando em TODOS os consultórios, não só o filtrado.
function buscarAgendaMedico() {
  const dados = banco.ler();
  const termo = document.getElementById('busca-medico-disponibilidade').value.trim().toLowerCase();
  const area = document.getElementById('area-agenda-medico');

  if (!termo) {
    area.classList.add('oculto');
    area.innerHTML = '';
    return;
  }

  const medico = dados.medicos.find(m => formatarNomeMedico(m).toLowerCase() === termo)
    || dados.medicos.find(m => formatarNomeMedico(m).toLowerCase().includes(termo));

  area.classList.remove('oculto');
  if (!medico) {
    area.innerHTML = `<div class="card card-pad vazio">Nenhum médico encontrado com esse nome.</div>`;
    return;
  }

  const ocorrencias = [];
  Object.keys(dados.escala).forEach(chave => {
    const celula = dados.escala[chave];
    if (String(celula.medico_id) !== String(medico.id)) return;
    const [salaId, dia, turno] = chave.split('|');
    const sala = dados.salas.find(s => String(s.id) === salaId);
    if (sala) ocorrencias.push({ sala, dia, turno, obs: celula.obs || '' });
  });
  ocorrencias.sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia));

  area.innerHTML = `
    <div class="card card-pad">
      <h3>Agenda de ${formatarNomeMedico(medico)}</h3>
      ${ocorrencias.length > 0 ? `
        <p style="font-size:12px;color:var(--ink-400);margin:0 0 10px">Clica numa linha pra ir direto pro consultório na grade.</p>
        <table>
          <thead><tr><th>Consultório</th><th>Local</th><th>Dia</th><th>Turno</th><th>Obs.</th></tr></thead>
          <tbody>
            ${ocorrencias.map(o => `
              <tr class="linha-clicavel" onclick="irParaConsultorio(${o.sala.id})">
                <td>${o.sala.nome}</td>
                <td>${o.sala.localizacao || ''}</td>
                <td>${o.dia}</td>
                <td>${o.turno}</td>
                <td>${o.obs}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `<p class="vazio">Esse médico não está escalado em nenhum horário ainda.</p>`}
    </div>
  `;
}

// Leva direto pro consultório escolhido na agenda de um médico (ignora o
// filtro de local atual, pra garantir que o consultório apareça no seletor)
function irParaConsultorio(salaId) {
  document.getElementById('seletor-local').value = '';
  carregarSeletorSala();
  document.getElementById('seletor-sala').value = salaId;
  renderizarGrade();
  document.getElementById('area-grade').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Monta o card completo (resumo + grade) de UM consultório. Extraído em
// função própria pra poder ser chamada tanto pra um consultório só quanto
// em loop, quando o modo "Ver todos" estiver ativo.
function construirCardConsultorio(dados, sala) {
  const calc = calcularSala(dados, sala);
  const c = corPorOcupacao(calc.percentual);

  const restricoes = sala.especialidades_permitidas || [];
  const medicosFiltradosPorEspecialidade = restricoes.length > 0
    ? dados.medicos.filter(m => restricoes.includes(m.especialidade_id))
    : dados.medicos;
  const medicosPermitidosBase = medicosFiltradosPorEspecialidade.length > 0
    ? medicosFiltradosPorEspecialidade
    : dados.medicos;

  const nomesEspSala = restricoes.length > 0
    ? dados.especialidades.filter(e => restricoes.includes(e.id)).map(e => e.nome).join(', ')
    : 'qualquer especialidade';

  const linhas = DIAS.map(dia => {
    const turnos = turnosDoDia(dia);
    const celulasHtml = ['08h às 12h','12h às 16h','16h às 20h'].map(turno => {
      if (!turnos.includes(turno)) return `<td class="vazia">—</td>`;
      const chave = chaveCelula(sala.id, dia, turno);
      const celula = dados.escala[chave] || { medico_id: '', obs: '' };
      const fechado = fechamentoAtivo(dados, sala.id, dia, turno);
      const ocupada = !!celula.medico_id && !fechado;

      let medicosPermitidos = medicosPermitidosBase;
      if (celula.medico_id && !medicosPermitidos.some(m => String(m.id) === String(celula.medico_id))) {
        const medicoAtual = dados.medicos.find(m => String(m.id) === String(celula.medico_id));
        if (medicoAtual) medicosPermitidos = [...medicosPermitidos, medicoAtual];
      }

      const opcoesMedicos = medicosPermitidos.map(m =>
        `<option value="${m.id}" ${String(celula.medico_id) === String(m.id) ? 'selected' : ''}>${formatarNomeMedico(m)}</option>`
      ).join('');

      const hojeISO = new Date().toISOString().slice(0, 10);
      const reposicoesDaCelula = (dados.reposicoes || []).filter(r =>
        r.sala_id === sala.id && r.turno === turno && r.data >= hojeISO && diaDaSemanaDeData(r.data) === dia
      );
      const avisoReposicao = reposicoesDaCelula.length > 0
        ? `<div class="aviso-reposicao">⚠ Reposição ${formatarDataBR(reposicoesDaCelula[0].data)}: ${formatarNomeMedico(dados.medicos.find(m => m.id === reposicoesDaCelula[0].medico_id))}</div>`
        : '';

      let selectHtml, extraHtml;
      if (fechado) {
        const medicoFechado = dados.medicos.find(m => m.id === celula.medico_id);
        selectHtml = `<select disabled><option>${formatarNomeMedico(medicoFechado)}</option></select>`;
        extraHtml = `
          <div class="aviso-fechamento">
            🔓 Fechado até ${formatarDataBR(fechado.data_fim)}<br>${formatarNomeMedico(medicoFechado)} volta depois
            <button type="button" class="link-reabrir" onclick="reabrirAgenda(${fechado.id})">Reabrir agora</button>
          </div>
        `;
      } else {
        selectHtml = `
          <select onchange="atualizarCelula('${chave}', this.value, null)">
            <option value="">— livre —</option>
            ${opcoesMedicos}
          </select>
        `;
        extraHtml = ocupada
          ? `<button type="button" class="link-fechar" onclick="fecharAgenda(${sala.id}, '${dia}', '${turno}', ${celula.medico_id})">🔒 Fechar 1 semana</button>`
          : '';
      }

      return `
        <td class="${ocupada ? 'celula-ocupada' : 'celula-livre'}"
            ${ocupada ? `draggable="true" ondragstart="aoArrastarCelula(event, '${chave}')"` : ''}
            ondragover="event.preventDefault()"
            ondrop="aoSoltarCelula(event, '${chave}')">
          ${selectHtml}
          <input class="obs" placeholder="horário/obs" value="${celula.obs || ''}" ${fechado ? 'disabled' : ''}
                 onchange="atualizarCelula('${chave}', null, this.value)">
          ${extraHtml}
          ${avisoReposicao}
        </td>
      `;
    }).join('');
    return `<tr><td class="dia-col">${dia}</td>${celulasHtml}</tr>`;
  }).join('');

  return `
    <div class="card card-pad" style="margin-bottom:16px">
      <h3 style="margin-bottom:2px">${sala.nome}</h3>
      <p style="font-size:12px;color:var(--ink-400);margin:0 0 12px">Aceita: ${nomesEspSala}</p>
      <div class="resumo-grade">
        <div class="item"><span class="valor">${calc.ocupados}/${TOTAL_ENCAIXES}</span><span class="rotulo">Ocupados</span></div>
        <div class="item"><span class="valor">${calc.livres}/${TOTAL_ENCAIXES}</span><span class="rotulo">Livres</span></div>
        <div class="item"><span class="valor">${calc.instalada}</span><span class="rotulo">Instalada (mês)</span></div>
        <div class="item"><span class="valor">${calc.atual}</span><span class="rotulo">Atual (mês)</span></div>
        <div class="item"><span class="valor">${calc.livre}</span><span class="rotulo">Livre (mês)</span></div>
        <div class="item"><span class="valor" style="color:${c.cor}">${pct(calc.percentual)}</span><span class="rotulo">% Ocupação</span></div>
      </div>
      <div class="legenda-grade">
        <span class="item"><span class="amostra livre"></span> Livre</span>
        <span class="item"><span class="amostra ocupado"></span> Ocupado</span>
      </div>
      <table class="grade">
        <thead><tr><th>Dia ↓</th><th>08h às 12h</th><th>12h às 16h</th><th>16h às 20h</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  `;
}

// Ordena as salas do mesmo jeito que a tela de Consultórios (agrupado por
// Sala de Espera). Usado no modo "Ver todos".
function ordenarSalasPorGrupo(salas) {
  const grupos = new Map();
  salas.forEach(s => {
    const grupo = obterGrupoSalaEspera(s);
    if (!grupos.has(grupo)) grupos.set(grupo, []);
    grupos.get(grupo).push(s);
  });
  const resultado = [];
  grupos.forEach((salasDoGrupo, nomeGrupo) => {
    resultado.push({ tituloGrupo: nomeGrupo, salas: salasDoGrupo });
  });
  return resultado;
}

function renderizarGrade() {
  const dados = banco.ler();
  const salaId = document.getElementById('seletor-sala').value;
  const area = document.getElementById('area-grade');

  if (!salaId) {
    area.innerHTML = `<div class="card card-pad vazio">Nenhum consultório selecionado. Cadastre um em "Consultórios".</div>`;
    return;
  }

  // ---- Modo "Ver todos": empilha a grade de todos os consultórios do
  // filtro de local escolhido, na mesma ordem/agrupamento de Consultórios ----
  if (salaId === '__todos__') {
    const localFiltro = document.getElementById('seletor-local').value;
    const salasFiltradas = localFiltro ? dados.salas.filter(s => s.localizacao === localFiltro) : dados.salas;

    if (salasFiltradas.length === 0) {
      area.innerHTML = `<div class="card card-pad vazio">Nenhum consultório nesse local.</div>`;
      return;
    }

    const gruposOrdenados = ordenarSalasPorGrupo(salasFiltradas);
    area.innerHTML = gruposOrdenados.map(g => `
      <div class="titulo-grupo-grade">${g.tituloGrupo}</div>
      ${g.salas.map(s => construirCardConsultorio(dados, s)).join('')}
    `).join('');
    return;
  }

  const sala = dados.salas.find(s => String(s.id) === String(salaId));
  if (!sala) {
    area.innerHTML = `<div class="card card-pad vazio">Esse consultório não existe mais. Escolhe outro.</div>`;
    return;
  }
  area.innerHTML = construirCardConsultorio(dados, sala);
}

// Agora essa função fala com o servidor. Ela recebe a chave da célula
// (sala|dia|turno) e o que mudou (médico OU observação — o outro vem null),
// mistura com o valor atual do cache, manda pra API e recarrega os dados.
// Fecha a agenda desse médico nesse horário por 7 dias a partir de hoje.
// Não mexe na escala fixa — é só uma exceção temporária por cima dela.
async function fecharAgenda(salaId, dia, turno, medicoId) {
  const dados = banco.ler();
  const medico = dados.medicos.find(m => m.id === medicoId);
  const hoje = new Date();
  const hojeISO = hoje.toISOString().slice(0, 10);
  const dataFim = new Date(hoje);
  dataFim.setDate(dataFim.getDate() + 6);
  const dataFimISO = dataFim.toISOString().slice(0, 10);

  const confirmou = await confirmarModal(`
    <h3>Fechar agenda</h3>
    <p>Fechar a agenda de <strong>${formatarNomeMedico(medico)}</strong> nesse horário?</p>
    <p>Fica livre de <strong>${formatarDataBR(hojeISO)}</strong> até <strong>${formatarDataBR(dataFimISO)}</strong>.
    Depois disso, volta a atender normalmente, sem precisar fazer nada.</p>
  `, { textoConfirmar: 'Fechar agenda' });
  if (!confirmou) return;

  try {
    await api.criarFechamento(medicoId, salaId, dia, turno, hojeISO, null);
    await carregarDados();
    renderizarGrade();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui fechar essa agenda. Confere sua internet e tenta de novo.');
  }
}

// Cancela um fechamento antes do prazo (o horário volta a valer a escala fixa na hora)
async function reabrirAgenda(fechamentoId) {
  const confirmou = await confirmarModal(`
    <h3>Reabrir horário</h3>
    <p>Reabrir esse horário agora, antes do prazo?</p>
    <p>A escala fixa volta a valer imediatamente.</p>
  `, { textoConfirmar: 'Reabrir agora' });
  if (!confirmou) return;
  try {
    await api.excluirFechamento(fechamentoId);
    await carregarDados();
    renderizarGrade();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui reabrir. Confere sua internet e tenta de novo.');
  }
}

// ---------- Arrastar e soltar médico entre horários ----------
function aoArrastarCelula(event, chaveOrigem) {
  event.dataTransfer.setData('text/plain', chaveOrigem);
  event.dataTransfer.effectAllowed = 'move';
}

async function aoSoltarCelula(event, chaveDestino) {
  event.preventDefault();
  const chaveOrigem = event.dataTransfer.getData('text/plain');
  if (!chaveOrigem || chaveOrigem === chaveDestino) return;

  const dados = banco.ler();
  const celulaOrigem = dados.escala[chaveOrigem];
  if (!celulaOrigem || !celulaOrigem.medico_id) return; // nada de verdade pra mover

  const [salaOrigemId, diaOrigem, turnoOrigem] = chaveOrigem.split('|');
  const [salaDestinoId, diaDestino, turnoDestino] = chaveDestino.split('|');

  const hojeISO = new Date().toISOString().slice(0, 10);
  if (fechamentoNaData(dados, Number(salaDestinoId), diaDestino, turnoDestino, hojeISO)) {
    alert('Esse horário está com a agenda fechada. Reabre antes de mover alguém pra lá.');
    return;
  }

  const celulaDestino = dados.escala[chaveDestino] || { medico_id: '', obs: '' };
  const medicoOrigem = dados.medicos.find(m => m.id === celulaOrigem.medico_id);
  const medicoDestino = celulaDestino.medico_id ? dados.medicos.find(m => m.id === celulaDestino.medico_id) : null;

  const mensagem = medicoDestino
    ? `<strong>${formatarNomeMedico(medicoOrigem)}</strong> vai pra esse horário, e <strong>${formatarNomeMedico(medicoDestino)}</strong> vai pro horário de onde ${formatarNomeMedico(medicoOrigem)} estava.`
    : `Mover <strong>${formatarNomeMedico(medicoOrigem)}</strong> pra esse horário (${diaDestino}, ${turnoDestino})? O horário de origem (${diaOrigem}, ${turnoOrigem}) fica livre.`;

  const confirmou = await confirmarModal(
    `<h3>${medicoDestino ? 'Trocar horários' : 'Mover médico'}</h3><p>${mensagem}</p>`,
    { textoConfirmar: medicoDestino ? 'Trocar' : 'Mover' }
  );
  if (!confirmou) return;

  try {
    await api.atualizarCelula(salaDestinoId, diaDestino, turnoDestino, celulaOrigem.medico_id, celulaOrigem.obs || '');
    await api.atualizarCelula(salaOrigemId, diaOrigem, turnoOrigem, celulaDestino.medico_id || null, celulaDestino.obs || '');
    await carregarDados();
    renderizarGrade();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui mover. Confere sua internet e tenta de novo.');
  }
}

async function atualizarCelula(chave, medicoId, obs) {
  const dados = banco.ler();
  const atual = dados.escala[chave] || { medico_id: '', obs: '' };
  const novoMedicoId = medicoId !== null ? (medicoId || null) : atual.medico_id;
  const novoObs = obs !== null ? obs : atual.obs;
  const [salaId, dia, turno] = chave.split('|');

  try {
    await api.atualizarCelula(salaId, dia, turno, novoMedicoId || null, novoObs || '');
    await carregarDados();
    renderizarGrade();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui salvar essa alteração. Confere sua internet e tenta de novo.');
    renderizarGrade(); // volta a mostrar o que realmente está salvo
  }
}

function carregarPaginaDisponibilidade() {
  carregarSeletorLocal();
  carregarSeletorSala(true);
  carregarListaMedicosBusca();
  renderizarGrade();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await carregarDados();
    carregarPaginaDisponibilidade();
    document.getElementById('seletor-local').addEventListener('change', () => {
      carregarSeletorSala(true);
      renderizarGrade();
    });
    document.getElementById('seletor-sala').addEventListener('change', renderizarGrade);
    document.getElementById('busca-medico-disponibilidade').addEventListener('input', buscarAgendaMedico);
  } catch (erro) {
    console.error('Erro ao carregar a Disponibilidade:', erro);
    document.getElementById('area-grade').innerHTML =
      `<div class="card card-pad vazio">Não consegui falar com o servidor. Confere sua internet ou tenta de novo em alguns segundos.</div>`;
  }
});

// window.atualizarPagina é chamado pelo botão "Atualizar" (via layout.js)
// DEPOIS que ele já buscou os dados novos — aqui é só re-render, sem
// resetar o que a pessoa estava vendo (mantém o consultório escolhido).
window.atualizarPagina = () => {
  carregarSeletorLocal();
  carregarSeletorSala(false);
  carregarListaMedicosBusca();
  renderizarGrade();
};