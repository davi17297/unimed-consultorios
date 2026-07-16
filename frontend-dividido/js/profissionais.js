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

function excluirEspecialidade(id) {
  if (!confirm('Excluir esta especialidade?')) return;
  const dados = banco.ler();
  dados.especialidades = dados.especialidades.filter(e => e.id !== id);
  banco.salvar(dados);
  carregarPaginaProfissionais();
}

function excluirMedico(id) {
  if (!confirm('Excluir este médico? Ele será removido de qualquer encaixe da grade.')) return;
  const dados = banco.ler();
  dados.medicos = dados.medicos.filter(m => m.id !== id);
  Object.keys(dados.escala).forEach(chave => {
    if (String(dados.escala[chave].medico_id) === String(id)) delete dados.escala[chave];
  });
  banco.salvar(dados);
  carregarPaginaProfissionais();
}

document.getElementById('form-especialidade').addEventListener('submit', (e) => {
  e.preventDefault();
  const dados = banco.ler();
  dados.especialidades.push({ id: banco.novoId(dados), nome: e.target.nome.value });
  banco.salvar(dados);
  e.target.reset();
  carregarPaginaProfissionais();
});

document.getElementById('form-medico').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const dados = banco.ler();
  dados.medicos.push({
    id: banco.novoId(dados),
    nome: f.nome.value,
    especialidade_id: f.especialidade_id.value ? Number(f.especialidade_id.value) : null
  });
  banco.salvar(dados);
  f.reset();
  carregarPaginaProfissionais();
});

document.getElementById('busca').addEventListener('input', carregarPaginaProfissionais);
document.addEventListener('DOMContentLoaded', carregarPaginaProfissionais);
window.atualizarPagina = carregarPaginaProfissionais;
