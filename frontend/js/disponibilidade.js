// ============================================================
// disponibilidade.js — grade semanal (estilo planilha) de um
// consultório por vez. Depende de dados.js.
// ============================================================

function carregarSeletorSala() {
  const dados = banco.ler();
  const seletor = document.getElementById('seletor-sala');
  const valorAtual = seletor.value;

  if (dados.salas.length === 0) {
    seletor.innerHTML = '<option value="">Cadastre um consultório primeiro</option>';
    return;
  }

  // Agrupa por Sala de Espera (mesma lógica usada na tela de Consultórios)
  const grupos = new Map();
  dados.salas.forEach(s => {
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
  if (valorAtual && dados.salas.some(s => String(s.id) === valorAtual)) {
    seletor.value = valorAtual;
  }
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
        <span>Ocupados: <strong>${calc.ocupados}/${TOTAL_ENCAIXES}</strong></span>
        <span>Livres: <strong>${calc.livres}/${TOTAL_ENCAIXES}</strong></span>
        <span>Instalada: <strong>${calc.instalada}</strong></span>
        <span>Atual: <strong>${calc.atual}</strong></span>
        <span>Livre: <strong>${calc.livre}</strong></span>
        <span>% Ocupação: <strong style="color:${c.cor}">${pct(calc.percentual)}</strong></span>
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
  carregarSeletorSala();
  renderizarGrade();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await carregarDados();
    carregarPaginaDisponibilidade();
    document.getElementById('seletor-sala').addEventListener('change', renderizarGrade);
  } catch (erro) {
    console.error('Erro ao carregar a Disponibilidade:', erro);
    document.getElementById('area-grade').innerHTML =
      `<div class="card card-pad vazio">Não consegui falar com o servidor. Confere sua internet ou tenta de novo em alguns segundos.</div>`;
  }
});

// window.atualizarPagina é chamado pelo botão "Atualizar" (via layout.js)
// DEPOIS que ele já buscou os dados novos — aqui é só re-render.
window.atualizarPagina = carregarPaginaDisponibilidade;