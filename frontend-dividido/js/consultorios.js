// ============================================================
// consultorios.js — cadastro de salas/consultórios. Depende de
// dados.js.
// ============================================================

// Preenche os checkboxes com as especialidades já cadastradas (em
// "Profissionais"). Se não tiver nenhuma, avisa o usuário.
function carregarOpcoesEspecialidades() {
  const dados = banco.ler();
  const picker = document.getElementById('picker-especialidades');
  picker.innerHTML = dados.especialidades.length > 0
    ? dados.especialidades.map(e => `
        <label class="opcao-especialidade">
          <input type="checkbox" name="especialidade_check" value="${e.id}">
          ${e.nome}
        </label>
      `).join('')
    : `<span class="vazio" style="padding:2px 0">Cadastre especialidades em "Profissionais" primeiro</span>`;
}

// Nomes das especialidades permitidas de uma sala, prontos pra exibir (badges)
function nomesEspecialidadesDaSala(dados, sala) {
  const ids = sala.especialidades_permitidas || [];
  if (ids.length === 0) return null; // null = sem restrição
  return dados.especialidades
    .filter(e => ids.includes(e.id))
    .map(e => e.nome);
}

function carregarTabelaSalas() {
  const dados = banco.ler();
  const termoBusca = (document.getElementById('busca').value || '').toLowerCase();

  const salasFiltradas = dados.salas.filter(s => s.nome.toLowerCase().includes(termoBusca));

  // Agrupa por Sala de Espera, preservando a ordem de cadastro dentro de cada grupo
  const grupos = new Map();
  salasFiltradas.forEach(s => {
    const grupo = obterGrupoSalaEspera(s);
    if (!grupos.has(grupo)) grupos.set(grupo, []);
    grupos.get(grupo).push(s);
  });

  let html = '';
  grupos.forEach((salasDoGrupo, nomeGrupo) => {
    html += `
      <tr class="linha-grupo">
        <td colspan="5">${nomeGrupo} <span class="contagem-grupo">· ${salasDoGrupo.length} consultório${salasDoGrupo.length > 1 ? 's' : ''}</span></td>
      </tr>
    `;
    html += salasDoGrupo.map(s => {
      const nomesEsp = nomesEspecialidadesDaSala(dados, s);
      const badgesEsp = nomesEsp
        ? nomesEsp.map(n => `<span class="pill pill-neutro">${n}</span>`).join(' ')
        : `<span class="pill pill-neutro">Qualquer especialidade</span>`;
      return `
        <tr>
          <td>
            <div class="nome-sala">${s.nome}</div>
            ${s.localizacao ? `<span class="sub">${s.localizacao}</span>` : ''}
          </td>
          <td class="num">${s.capacidade_por_turno} vagas/turno</td>
          <td>${badgesEsp}</td>
          <td>${s.status === 'manutencao' ? `<span class="pill pill-vermelho">Manutenção</span>` : `<span class="pill pill-verde">Ativo</span>`}</td>
          <td style="text-align:right"><button class="acao-icone" onclick="excluirSala(${s.id})">Excluir</button></td>
        </tr>
      `;
    }).join('');
  });

  document.getElementById('tabela-salas').innerHTML = html || `<tr><td class="vazio">Nenhum consultório encontrado.</td></tr>`;
}

function excluirSala(id) {
  if (!confirm('Excluir este consultório? Toda a grade dele também será removida.')) return;
  const dados = banco.ler();
  dados.salas = dados.salas.filter(s => s.id !== id);
  Object.keys(dados.escala).forEach(chave => {
    if (chave.startsWith(`${id}|`)) delete dados.escala[chave];
  });
  banco.salvar(dados);
  carregarTabelaSalas();
}

document.getElementById('form-sala').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const dados = banco.ler();
  const quantidade = Math.max(1, Number(f.quantidade.value) || 1);
  const especialidadesPermitidas = Array.from(f.querySelectorAll('input[name="especialidade_check"]:checked'))
    .map(c => Number(c.value));

  // Trava de segurança: confirma antes de criar várias salas de uma vez,
  // pra evitar cadastro em massa por engano (ex: campo quantidade mudou sem querer).
  if (quantidade > 1) {
    const nomesPrevia = Array.from({ length: quantidade }, (_, i) => `${f.nome_base.value} - Consultório ${i + 1}`).join(', ');
    const confirmou = confirm(`Isso vai criar ${quantidade} consultórios: ${nomesPrevia}. Confirma?`);
    if (!confirmou) return;
  }

  for (let i = 1; i <= quantidade; i++) {
    dados.salas.push({
      id: banco.novoId(dados),
      nome: quantidade > 1 ? `${f.nome_base.value} - Consultório ${i}` : f.nome_base.value,
      sala_espera: f.nome_base.value,
      localizacao: f.localizacao.value || null,
      capacidade_por_turno: f.capacidade_por_turno.value ? Number(f.capacidade_por_turno.value) : 16,
      status: f.status.value || 'ativo',
      especialidades_permitidas: especialidadesPermitidas
    });
  }

  banco.salvar(dados);
  f.reset();
  carregarTabelaSalas();
});

document.getElementById('busca').addEventListener('input', carregarTabelaSalas);
document.addEventListener('DOMContentLoaded', () => {
  carregarOpcoesEspecialidades();
  carregarTabelaSalas();
});
window.atualizarPagina = () => {
  carregarOpcoesEspecialidades();
  carregarTabelaSalas();
};
