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
      // Dentro do grupo, mostra só "Consultório N" (o nome do grupo já aparece no rótulo do optgroup)
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

  // Se a sala tiver especialidades permitidas definidas, só esses médicos
  // aparecem no dropdown. Sala sem restrição (lista vazia) aceita qualquer um.
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

      // garante que o médico já atribuído continue aparecendo, mesmo que a
      // restrição de especialidade da sala tenha mudado depois de ele ser escalado
      let medicosPermitidos = medicosPermitidosBase;
      if (celula.medico_id && !medicosPermitidos.some(m => String(m.id) === String(celula.medico_id))) {
        const medicoAtual = dados.medicos.find(m => String(m.id) === String(celula.medico_id));
        if (medicoAtual) medicosPermitidos = [...medicosPermitidos, medicoAtual];
      }

      const opcoesMedicos = medicosPermitidos.map(m =>
        `<option value="${m.id}" ${String(celula.medico_id) === String(m.id) ? 'selected' : ''}>${m.nome}</option>`
      ).join('');
      const ocupada = !!celula.medico_id;
      return `
        <td class="${ocupada ? 'celula-ocupada' : 'celula-livre'}">
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
        <span>% Ocupação: <strong style="color:${c.cor}">${pct(calc.percentual)}</strong></span>
      </div>
      <table class="grade">
        <thead><tr><th>Dia ↓</th><th>08h às 12h</th><th>12h às 16h</th><th>16h às 20h</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  `;
}

function atualizarCelula(chave, medicoId, obs) {
  const dados = banco.ler();
  const atual = dados.escala[chave] || { medico_id: '', obs: '' };
  const novaCelula = {
    medico_id: medicoId !== null ? (medicoId || null) : atual.medico_id,
    obs: obs !== null ? obs : atual.obs
  };
  if (!novaCelula.medico_id && !novaCelula.obs) {
    delete dados.escala[chave];
  } else {
    dados.escala[chave] = novaCelula;
  }
  banco.salvar(dados);
  renderizarGrade();
}

function carregarPaginaDisponibilidade() {
  carregarSeletorSala();
  renderizarGrade();
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    carregarPaginaDisponibilidade();
    document.getElementById('seletor-sala').addEventListener('change', renderizarGrade);
  } catch (erro) {
    console.error('Erro ao carregar a Disponibilidade:', erro);
    document.getElementById('area-grade').innerHTML =
      `<div class="card card-pad vazio">Não consegui carregar os dados. Se você acabou de abrir o arquivo direto (file://), rode um servidor local — veja o README.</div>`;
  }
});

window.atualizarPagina = carregarPaginaDisponibilidade;