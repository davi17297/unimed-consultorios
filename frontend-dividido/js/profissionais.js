// ============================================================
// profissionais.js — cadastro de especialidades e médicos.
// Depende de dados.js.
// ============================================================

function carregarPaginaProfissionais() {
  const dados = banco.ler();
  const termoBusca = (document.getElementById('busca').value || '').toLowerCase();

  document.getElementById('tabela-especialidades').innerHTML = dados.especialidades.map(e => `
    <tr><td>${e.nome}</td><td style="text-align:right"><button class="acao-icone" onclick="excluirEspecialidade(${e.id})">Excluir</button></td></tr>
  `).join('') || `<tr><td class="vazio">Nenhuma especialidade cadastrada.</td></tr>`;

  const selectEsp = document.querySelector('#form-medico select[name=especialidade_id]');
  selectEsp.innerHTML = '<option value="">Especialidade...</option>' +
    dados.especialidades.map(e => `<option value="${e.id}">${e.nome}</option>`).join('');

  const medicosFiltrados = dados.medicos.filter(m => m.nome.toLowerCase().includes(termoBusca));
  document.getElementById('tabela-medicos').innerHTML = medicosFiltrados.map(m => {
    const esp = dados.especialidades.find(e => e.id === m.especialidade_id);
    return `<tr><td>${m.nome}</td><td>${esp ? esp.nome : ''}</td><td style="text-align:right"><button class="acao-icone" onclick="excluirMedico(${m.id})">Excluir</button></td></tr>`;
  }).join('') || `<tr><td class="vazio">Nenhum médico encontrado.</td></tr>`;
}

async function excluirEspecialidade(id) {
  if (!confirm('Excluir esta especialidade?')) return;
  try {
    await api.excluirEspecialidade(id);
    await carregarDados();
    carregarPaginaProfissionais();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui excluir. Confere sua internet e tenta de novo.');
  }
}

async function excluirMedico(id) {
  if (!confirm('Excluir este médico? Ele será removido de qualquer encaixe da grade.')) return;
  try {
    await api.excluirMedico(id);
    await carregarDados();
    carregarPaginaProfissionais();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui excluir. Confere sua internet e tenta de novo.');
  }
}

document.getElementById('form-especialidade').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = e.target.nome.value;
  try {
    await api.criarEspecialidade(nome);
    await carregarDados();
    e.target.reset();
    carregarPaginaProfissionais();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui salvar. Confere sua internet e tenta de novo.');
  }
});

document.getElementById('form-medico').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api.criarMedico(f.nome.value, f.especialidade_id.value ? Number(f.especialidade_id.value) : null);
    await carregarDados();
    f.reset();
    carregarPaginaProfissionais();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui salvar. Confere sua internet e tenta de novo.');
  }
});

document.getElementById('busca').addEventListener('input', carregarPaginaProfissionais);

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await carregarDados();
    carregarPaginaProfissionais();
  } catch (erro) {
    console.error('Erro ao carregar Profissionais:', erro);
    document.getElementById('tabela-medicos').innerHTML =
      `<tr><td class="vazio">Não consegui falar com o servidor. Confere sua internet ou tenta de novo em alguns segundos.</td></tr>`;
  }
});

window.atualizarPagina = carregarPaginaProfissionais;