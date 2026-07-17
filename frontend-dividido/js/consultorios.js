// ============================================================
// consultorios.js — cadastro de salas/consultórios. Depende de
// dados.js.
// ============================================================

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

async function excluirSala(id) {
  if (!confirm('Excluir este consultório? Toda a grade dele também será removida.')) return;
  try {
    await api.excluirSala(id);
    await carregarDados();
    carregarTabelaSalas();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui excluir. Confere sua internet e tenta de novo.');
  }
}

document.getElementById('form-sala').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const quantidade = Math.max(1, Number(f.quantidade.value) || 1);
  const especialidadesPermitidas = Array.from(f.querySelectorAll('input[name="especialidade_check"]:checked'))
    .map(c => Number(c.value));

  if (quantidade > 1) {
    const nomesPrevia = Array.from({ length: quantidade }, (_, i) => `${f.nome_base.value} - Consultório ${i + 1}`).join(', ');
    const confirmou = confirm(`Isso vai criar ${quantidade} consultórios: ${nomesPrevia}. Confirma?`);
    if (!confirmou) return;
  }

  const botao = f.querySelector('button[type=submit]');
  botao.disabled = true;
  botao.textContent = 'Salvando...';

  try {
    for (let i = 1; i <= quantidade; i++) {
      await api.criarSala({
        nome: quantidade > 1 ? `${f.nome_base.value} - Consultório ${i}` : f.nome_base.value,
        sala_espera: f.nome_base.value,
        localizacao: f.localizacao.value || null,
        capacidade_por_turno: f.capacidade_por_turno.value ? Number(f.capacidade_por_turno.value) : 16,
        status: f.status.value || 'ativo',
        especialidades_permitidas: especialidadesPermitidas
      });
    }
    await carregarDados();
    f.reset();
    carregarTabelaSalas();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui salvar o(s) consultório(s). Confere sua internet e tenta de novo.');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Adicionar';
  }
});

document.getElementById('busca').addEventListener('input', carregarTabelaSalas);

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await carregarDados();
    carregarOpcoesEspecialidades();
    carregarTabelaSalas();
  } catch (erro) {
    console.error('Erro ao carregar Consultórios:', erro);
    document.getElementById('tabela-salas').innerHTML =
      `<tr><td class="vazio">Não consegui falar com o servidor. Confere sua internet ou tenta de novo em alguns segundos.</td></tr>`;
  }
});

window.atualizarPagina = () => {
  carregarOpcoesEspecialidades();
  carregarTabelaSalas();
};