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
function carregarSeletorSala() {
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

  let html = '';
  grupos.forEach((salasDoGrupo, nomeGrupo) => {
    html += `<optgroup label="${nomeGrupo}">`;
    html += salasDoGrupo.map(s => {
      const rotulo = s.nome.includes(' - Consultório ') ? s.nome.split(' - Consultório ')[1] : s.nome;
      return `<option value="${s.id}">${s.nome.includes(' - Consultório ') ? 'Consultório ' + rotulo : rotulo}</option>`;
    }).join('');
    html += `</optgroup>`;
  });

  seletor.innerHTML = html;
  if (valorAtual && salasFiltradas.some(s => String(s.id) === valorAtual)) {
    seletor.value = valorAtual;
  } else {
    seletor.value = salasFiltradas[0].id;
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
        <table>
          <thead><tr><th>Consultório</th><th>Local</th><th>Dia</th><th>Turno</th><th>Obs.</th></tr></thead>
          <tbody>
            ${ocorrencias.map(o => `
              <tr>
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

function renderizarGrade() {
  const dados = banco.ler();
  const salaId = document.getElementById('seletor-sala').value;
  const area = document.getElementById('area-grade');

  if (!salaId) {
    area.innerHTML = `<div class="card card-pad vazio">Nenhum consultório selecionado. Cadastre um em "Consultórios".</div>`;
    return;
  }
  const sala = dados.salas.find(s => String(s.id) === String(salaId));
  const calc = calcularSala(dados, sala);
  const c = corPorOcupacao(calc.percentual);

  const restricoes = sala.especialidades_permitidas || [];
  const medicosPermitidosBase = restricoes.length > 0
    ? dados.medicos.filter(m => restricoes.includes(m.especialidade_id))
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

      let medicosPermitidos = medicosPermitidosBase;
      if (celula.medico_id && !medicosPermitidos.some(m => String(m.id) === String(celula.medico_id))) {
        const medicoAtual = dados.medicos.find(m => String(m.id) === String(celula.medico_id));
        if (medicoAtual) medicosPermitidos = [...medicosPermitidos, medicoAtual];
      }

      const opcoesMedicos = medicosPermitidos.map(m =>
        `<option value="${m.id}" ${String(celula.medico_id) === String(m.id) ? 'selected' : ''}>${formatarNomeMedico(m)}</option>`
      ).join('');
      return `
        <td>
          <select onchange="atualizarCelula('${chave}', this.value, null)">
            <option value="">— livre —</option>
            ${opcoesMedicos}
          </select>
          <input class="obs" placeholder="horário/obs" value="${celula.obs || ''}"
                 onchange="atualizarCelula('${chave}', null, this.value)">
        </td>
      `;
    }).join('');
    return `<tr><td class="dia-col">${dia}</td>${celulasHtml}</tr>`;
  }).join('');

  area.innerHTML = `
    <div class="card card-pad">
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

// Agora essa função fala com o servidor. Ela recebe a chave da célula
// (sala|dia|turno) e o que mudou (médico OU observação — o outro vem null),
// mistura com o valor atual do cache, manda pra API e recarrega os dados.
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
  carregarSeletorSala();
  carregarListaMedicosBusca();
  renderizarGrade();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await carregarDados();
    carregarPaginaDisponibilidade();
    document.getElementById('seletor-local').addEventListener('change', () => {
      carregarSeletorSala();
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
// DEPOIS que ele já buscou os dados novos — aqui é só re-render.
window.atualizarPagina = carregarPaginaDisponibilidade;