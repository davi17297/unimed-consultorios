// ============================================================
// profissionais.js — cadastro de especialidades e médicos.
// Depende de dados.js.
// ============================================================

let especialidadeEditandoId = null;
let medicoEditandoId = null;

function normalizarTexto(txt) {
  return (txt || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function carregarPaginaProfissionais() {
  const dados = banco.ler();
  const buscaEsp = normalizarTexto(document.getElementById('busca-especialidade').value);
  const buscaMed = normalizarTexto(document.getElementById('busca-medico').value);

  const especialidadesFiltradas = dados.especialidades.filter(e => normalizarTexto(e.nome).includes(buscaEsp));
  document.getElementById('tabela-especialidades').innerHTML = especialidadesFiltradas.map(e => `
    <tr>
      <td>${e.nome}</td>
      <td style="text-align:right">
        <button class="acao-icone" onclick="editarEspecialidade(${e.id})">Editar</button>
        <button class="acao-icone" onclick="excluirEspecialidade(${e.id})">Excluir</button>
      </td>
    </tr>
  `).join('') || `<tr><td class="vazio">Nenhuma especialidade encontrada.</td></tr>`;

  const selectEsp = document.querySelector('#form-medico select[name=especialidade_id]');
  const valorSelecionado = selectEsp.value;
  selectEsp.innerHTML = '<option value="">Especialidade...</option>' +
    dados.especialidades.map(e => `<option value="${e.id}">${e.nome}</option>`).join('');
  if (valorSelecionado) selectEsp.value = valorSelecionado;

  const medicosFiltrados = dados.medicos.filter(m => {
    const esp = dados.especialidades.find(e => e.id === m.especialidade_id);
    return normalizarTexto(m.nome).includes(buscaMed) || (esp && normalizarTexto(esp.nome).includes(buscaMed));
  });
  document.getElementById('tabela-medicos').innerHTML = medicosFiltrados.map(m => {
    const esp = dados.especialidades.find(e => e.id === m.especialidade_id);
    return `
      <tr>
        <td>${formatarNomeMedico(m)}</td>
        <td>${esp ? esp.nome : '<span class="vazio" style="padding:0">sem especialidade</span>'}</td>
        <td class="num">${m.pacientes_por_turno ? m.pacientes_por_turno + ' pac/turno' : '<span class="vazio" style="padding:0">padrão do consultório</span>'}</td>
        <td style="text-align:right">
          <button class="acao-icone" onclick="editarMedico(${m.id})">Editar</button>
          <button class="acao-icone" onclick="excluirMedico(${m.id})">Excluir</button>
        </td>
      </tr>
    `;
  }).join('') || `<tr><td class="vazio" colspan="4">Nenhum médico encontrado.</td></tr>`;
}

document.getElementById('busca-especialidade').addEventListener('input', carregarPaginaProfissionais);
document.getElementById('busca-medico').addEventListener('input', carregarPaginaProfissionais);

// ---------- Especialidades ----------
function editarEspecialidade(id) {
  const dados = banco.ler();
  const e = dados.especialidades.find(x => x.id === id);
  if (!e) return;
  especialidadeEditandoId = id;
  const f = document.getElementById('form-especialidade');
  f.nome.value = e.nome;
  f.nome.focus();
  document.getElementById('botao-especialidade').textContent = 'Salvar edição';
  document.getElementById('cancelar-edicao-especialidade').classList.remove('oculto');
}

function cancelarEdicaoEspecialidade() {
  especialidadeEditandoId = null;
  document.getElementById('form-especialidade').reset();
  document.getElementById('botao-especialidade').textContent = 'Adicionar';
  document.getElementById('cancelar-edicao-especialidade').classList.add('oculto');
}

async function excluirEspecialidade(id) {
  if (!confirm('Excluir esta especialidade?')) return;
  try {
    await api.excluirEspecialidade(id);
    await carregarDados();
    if (especialidadeEditandoId === id) cancelarEdicaoEspecialidade();
    carregarPaginaProfissionais();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui excluir. Confere sua internet e tenta de novo.');
  }
}

// ---------- Médicos ----------
function editarMedico(id) {
  const dados = banco.ler();
  const m = dados.medicos.find(x => x.id === id);
  if (!m) return;
  medicoEditandoId = id;
  const f = document.getElementById('form-medico');
  f.nome.value = m.nome;
  f.especialidade_id.value = m.especialidade_id || '';
  f.titulo.value = m.titulo || '';
  f.pacientes_por_turno.value = m.pacientes_por_turno || '';
  f.nome.focus();
  document.getElementById('botao-medico').textContent = 'Salvar edição';
  document.getElementById('cancelar-edicao-medico').classList.remove('oculto');
}

function cancelarEdicaoMedico() {
  medicoEditandoId = null;
  document.getElementById('form-medico').reset();
  document.getElementById('botao-medico').textContent = 'Adicionar';
  document.getElementById('cancelar-edicao-medico').classList.add('oculto');
}

async function excluirMedico(id) {
  if (!confirm('Excluir este médico? Ele será removido de qualquer encaixe da grade.')) return;
  try {
    await api.excluirMedico(id);
    await carregarDados();
    if (medicoEditandoId === id) cancelarEdicaoMedico();
    carregarPaginaProfissionais();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui excluir. Confere sua internet e tenta de novo.');
  }
}

// ---------- Formulários (criar OU editar, dependendo do estado) ----------
document.getElementById('form-especialidade').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = e.target.nome.value;
  try {
    if (especialidadeEditandoId) {
      await api.editarEspecialidade(especialidadeEditandoId, nome);
    } else {
      await api.criarEspecialidade(nome);
    }
    await carregarDados();
    cancelarEdicaoEspecialidade();
    carregarPaginaProfissionais();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui salvar. Confere sua internet e tenta de novo.');
  }
});

document.getElementById('form-medico').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const especialidadeId = f.especialidade_id.value ? Number(f.especialidade_id.value) : null;
  const titulo = f.titulo.value || null;
  const pacientesPorTurno = f.pacientes_por_turno.value ? Number(f.pacientes_por_turno.value) : null;
  try {
    if (medicoEditandoId) {
      await api.editarMedico(medicoEditandoId, f.nome.value, especialidadeId, titulo, pacientesPorTurno);
    } else {
      await api.criarMedico(f.nome.value, especialidadeId, titulo, pacientesPorTurno);
    }
    await carregarDados();
    cancelarEdicaoMedico();
    carregarPaginaProfissionais();
  } catch (erro) {
    console.error(erro);
    alert('Não consegui salvar. Confere sua internet e tenta de novo.');
  }
});

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