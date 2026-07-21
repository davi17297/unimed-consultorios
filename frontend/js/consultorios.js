// ============================================================
// consultorios.js — cadastro de salas/consultórios. Depende de
// dados.js.
// ============================================================

let salaEditandoId = null;

function carregarOpcoesEspecialidades(idsMarcados = []) {
  const dados = banco.ler();
  const picker = document.getElementById('picker-especialidades');
  picker.innerHTML = dados.especialidades.length > 0
    ? dados.especialidades.map(e => `
        <label class="opcao-especialidade">
          <input type="checkbox" name="especialidade_check" value="${e.id}" ${idsMarcados.includes(e.id) ? 'checked' : ''}>
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
  const salasFiltradas = dados.salas;

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
          <td style="text-align:right">
            <button class="acao-icone" onclick="editarSala(${s.id})">Editar</button>
            <button class="acao-icone" onclick="excluirSala(${s.id})">Excluir</button>
          </td>
        </tr>
      `;
    }).join('');
  });

  document.getElementById('tabela-salas').innerHTML = html || `<tr><td class="vazio">Nenhum consultório encontrado.</td></tr>`;
}

function editarSala(id) {
  const dados = banco.ler();
  const s = dados.salas.find(x => x.id === id);
  if (!s) return;
  salaEditandoId = id;

  const f = document.getElementById('form-sala');
  f.nome_base.value = s.nome;
  f.quantidade.value = 1;
  f.quantidade.disabled = true;
  f.localizacao.value = s.localizacao || '';
  f.capacidade_por_turno.value = s.capacidade_por_turno || '';
  f.status.value = s.status || 'ativo';
  carregarOpcoesEspecialidades(s.especialidades_permitidas || []);

  document.getElementById('botao-sala').textContent = 'Salvar edição';
  document.getElementById('cancelar-edicao-sala').classList.remove('oculto');
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelarEdicaoSala() {
  salaEditandoId = null;
  const f = document.getElementById('form-sala');
  f.reset();
  f.quantidade.disabled = false;
  carregarOpcoesEspecialidades([]);
  document.getElementById('botao-sala').textContent = 'Adicionar';
  document.getElementById('cancelar-edicao-sala').classList.add('oculto');
}

async function excluirSala(id) {
  const confirmou = await confirmarModal(`
    <h3>Excluir consultório</h3>
    <p>Excluir este consultório? Toda a grade dele também será removida.</p>
  `, { textoConfirmar: 'Excluir' });
  if (!confirmou) return;
  try {
    await api.excluirSala(id);
    await carregarDados();
    if (salaEditandoId === id) cancelarEdicaoSala();
    carregarTabelaSalas();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui excluir. Confere sua internet e tenta de novo.');
  }
}

document.getElementById('form-sala').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const especialidadesPermitidas = Array.from(f.querySelectorAll('input[name="especialidade_check"]:checked'))
    .map(c => Number(c.value));
  const botao = document.getElementById('botao-sala');

  // ---- Modo edição: edita só o consultório selecionado ----
  if (salaEditandoId) {
    botao.disabled = true;
    botao.textContent = 'Salvando...';
    try {
      await api.editarSala(salaEditandoId, {
        nome: f.nome_base.value,
        sala_espera: f.nome_base.value,
        localizacao: f.localizacao.value || null,
        capacidade_por_turno: f.capacidade_por_turno.value ? Number(f.capacidade_por_turno.value) : 16,
        status: f.status.value || 'ativo',
        especialidades_permitidas: especialidadesPermitidas
      });
      await carregarDados();
      cancelarEdicaoSala();
      carregarTabelaSalas();
    } catch (erro) {
      console.error(erro);
      alert('Não consegui salvar a edição. Confere sua internet e tenta de novo.');
    } finally {
      botao.disabled = false;
      botao.textContent = salaEditandoId ? 'Salvar edição' : 'Adicionar';
    }
    return;
  }

  // ---- Modo criação: pode criar várias de uma vez ----
  const quantidade = Math.max(1, Number(f.quantidade.value) || 1);
  if (quantidade > 1) {
    const nomesPrevia = Array.from({ length: quantidade }, (_, i) => `${f.nome_base.value} - Consultório ${i + 1}`).join(', ');
    const confirmou = await confirmarModal(`
      <h3>Criar vários consultórios</h3>
      <p>Isso vai criar ${quantidade} consultórios: <strong>${nomesPrevia}</strong>. Confirma?</p>
    `, { textoConfirmar: 'Criar' });
    if (!confirmou) return;
  }

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