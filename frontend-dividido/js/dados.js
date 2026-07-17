// ============================================================
// dados.js
// Único lugar com a REGRA DE NEGÓCIO e o ACESSO AOS DADOS.
// Agora os dados vêm do backend (Railway), não mais do localStorage.
// Toda página do sistema inclui este arquivo antes do seu próprio
// script. Nada de HTML/DOM aqui — só dados, cálculo e chamadas à API.
// ============================================================

// Troque essa URL se o endereço do backend no Railway mudar.
const API_BASE_URL = 'https://unimed-consultorios-production.up.railway.app';

const DIAS = ['Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado'];
const DIAS_ABREV = { 'Segunda-Feira':'Seg', 'Terça-Feira':'Ter', 'Quarta-Feira':'Qua', 'Quinta-Feira':'Qui', 'Sexta-Feira':'Sex', 'Sábado':'Sáb' };

function turnosDoDia(dia) {
  return dia === 'Sábado' ? ['08h às 12h'] : ['08h às 12h','12h às 16h','16h às 20h'];
}
// Grade fixa: Segunda a Sexta x 3 turnos (15) + Sábado de manhã (1) = 16 encaixes/semana
const TOTAL_ENCAIXES = DIAS.reduce((soma, d) => soma + turnosDoDia(d).length, 0);

function chaveCelula(salaId, dia, turno) {
  return `${salaId}|${dia}|${turno}`;
}

// Identifica a "Sala de Espera" (grupo físico) de um consultório.
function obterGrupoSalaEspera(sala) {
  if (sala.sala_espera) return sala.sala_espera;
  return sala.nome.split(' - Consultório ')[0];
}

// JS: getDay() -> 0=domingo,1=segunda...6=sábado
function diaDeHoje() {
  const mapa = { 1: 'Segunda-Feira', 2: 'Terça-Feira', 3: 'Quarta-Feira', 4: 'Quinta-Feira', 5: 'Sexta-Feira', 6: 'Sábado' };
  return mapa[new Date().getDay()] || null; // null = domingo, sem expediente
}

// Turnos livres de uma sala num dia qualquer da semana (não só hoje)
function turnosLivresNoDia(dados, sala, dia) {
  return turnosDoDia(dia).filter(turno => {
    const c = dados.escala[chaveCelula(sala.id, dia, turno)];
    return !(c && c.medico_id);
  });
}

function estadoInicial() {
  return { especialidades: [], medicos: [], salas: [], escala: {} };
}

// ---------- Cache local dos dados vindos da API ----------
// As telas leem daqui (síncrono). Quem preenche esse cache é o
// carregarDados(), que precisa ser chamado (com "await") antes de
// qualquer tela renderizar pela primeira vez.
let dadosCache = estadoInicial();

async function carregarDados() {
  const resposta = await fetch(`${API_BASE_URL}/api/dados`);
  if (!resposta.ok) throw new Error('O servidor respondeu com erro ao carregar os dados.');
  dadosCache = await resposta.json();
  return dadosCache;
}

const banco = {
  // Devolve o snapshot mais recente já carregado (ver carregarDados()).
  ler() {
    return dadosCache;
  }
};

// ---------- Chamadas à API (gravação) ----------
// Funções "cruas": só fazem a chamada e devolvem o resultado.
// Depois de usar qualquer uma delas, chame carregarDados() de novo
// pra atualizar o cache antes de re-renderizar a tela.
async function chamarApi(caminho, metodo, corpo) {
  const resposta = await fetch(`${API_BASE_URL}${caminho}`, {
    method: metodo,
    headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined
  });
  if (!resposta.ok) {
    throw new Error(`Erro ao chamar a API (${metodo} ${caminho}): ${resposta.status}`);
  }
  if (resposta.status === 204) return null;
  return resposta.json();
}

const api = {
  criarEspecialidade: (nome) => chamarApi('/api/especialidades', 'POST', { nome }),
  excluirEspecialidade: (id) => chamarApi(`/api/especialidades/${id}`, 'DELETE'),
  criarMedico: (nome, especialidade_id) => chamarApi('/api/medicos', 'POST', { nome, especialidade_id }),
  excluirMedico: (id) => chamarApi(`/api/medicos/${id}`, 'DELETE'),
  criarSala: (dadosSala) => chamarApi('/api/salas', 'POST', dadosSala),
  excluirSala: (id) => chamarApi(`/api/salas/${id}`, 'DELETE'),
  atualizarCelula: (sala_id, dia_semana, turno, medico_id, obs) =>
    chamarApi('/api/escala', 'PUT', { sala_id, dia_semana, turno, medico_id, obs })
};

const pct = (v) => (v * 100).toFixed(1) + '%';

// Cor de acordo com a % de ocupação: <60% saudável, 60–85% moderado, >85% crítico
function corPorOcupacao(percentual) {
  if (percentual >= 0.85) return { cor: 'var(--red-600)', pill: 'pill-vermelho', ponto: 'ponto-vermelho' };
  if (percentual >= 0.6) return { cor: 'var(--amber-600)', pill: 'pill-ambar', ponto: 'ponto-ambar' };
  return { cor: 'var(--green-600)', pill: 'pill-verde', ponto: 'ponto-verde' };
}

// ---------- CÁLCULO POR SALA ----------
function calcularSala(dados, sala) {
  let ocupados = 0;
  const encaixesLivresHoje = [];
  const hoje = diaDeHoje();

  DIAS.forEach(dia => {
    turnosDoDia(dia).forEach(turno => {
      const celula = dados.escala[chaveCelula(sala.id, dia, turno)];
      const temMedico = !!(celula && celula.medico_id);
      if (temMedico) ocupados += 1;
      if (dia === hoje && !temMedico) encaixesLivresHoje.push(turno);
    });
  });

  const livres = TOTAL_ENCAIXES - ocupados;
  const vagas = Number(sala.capacidade_por_turno) || 16;
  const instalada = vagas * TOTAL_ENCAIXES;
  const atual = vagas * ocupados;
  const livre = vagas * livres;
  const percentual = TOTAL_ENCAIXES > 0 ? ocupados / TOTAL_ENCAIXES : 0;

  return { sala, ocupados, livres, vagas, instalada, atual, livre, percentual, encaixesLivresHoje };
}

function calcularDashboard() {
  const dados = banco.ler();
  const salas = dados.salas.map(s => calcularSala(dados, s));
  const totalInstalada = salas.reduce((s, r) => s + r.instalada, 0);
  const totalAtual = salas.reduce((s, r) => s + r.atual, 0);
  return {
    salas,
    totais: {
      instalada: totalInstalada,
      atual: totalAtual,
      livre: totalInstalada - totalAtual,
      percentual: totalInstalada > 0 ? totalAtual / totalInstalada : 0
    }
  };
}

function calcularResumoPorDia(dados, salas) {
  return DIAS.map(dia => {
    const totalLivresNoDia = salas.reduce((soma, r) => {
      const turnos = turnosDoDia(dia);
      const livresNesseDia = turnos.filter(t => {
        const c = dados.escala[chaveCelula(r.sala.id, dia, t)];
        return !(c && c.medico_id);
      }).length;
      return soma + livresNesseDia;
    }, 0);
    const totalEncaixesNoDia = salas.length * turnosDoDia(dia).length;
    const ocupadosNoDia = totalEncaixesNoDia - totalLivresNoDia;
    const percentualDia = totalEncaixesNoDia > 0 ? ocupadosNoDia / totalEncaixesNoDia : 0;
    return { dia, totalLivresNoDia, totalEncaixesNoDia, ocupadosNoDia, percentualDia };
  });
}