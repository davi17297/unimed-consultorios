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

// A grade se repete toda semana, mas a capacidade em pacientes (Instalada/
// Atual/Livre) é contada pro MÊS inteiro, não só uma semana — por isso
// multiplicamos por 4 (aproximação de semanas num mês).
const SEMANAS_POR_MES = 4;

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

// Descobre em qual turno estamos AGORA (considerando a hora do relógio,
// não só o dia da semana). Retorna null fora do expediente — por exemplo:
// depois das 20h, antes das 8h, domingo o dia todo, ou sábado à tarde
// (já que sábado só tem turno de manhã).
function turnoAtual() {
  const hoje = diaDeHoje();
  if (!hoje) return null; // domingo
  const hora = new Date().getHours();
  const turnosValidosHoje = turnosDoDia(hoje);
  let turno = null;
  if (hora >= 8 && hora < 12) turno = '08h às 12h';
  else if (hora >= 12 && hora < 16) turno = '12h às 16h';
  else if (hora >= 16 && hora < 20) turno = '16h às 20h';
  return turno && turnosValidosHoje.includes(turno) ? turno : null;
}

// Turnos livres de uma sala num dia qualquer da semana (não só hoje)
function turnosLivresNoDia(dados, sala, dia) {
  return turnosDoDia(dia).filter(turno => {
    const c = dados.escala[chaveCelula(sala.id, dia, turno)];
    return !(c && c.medico_id);
  });
}

function estadoInicial() {
  return { especialidades: [], medicos: [], salas: [], escala: {}, reposicoes: [] };
}

// Motivos fixos de reposição, pra facilitar contar depois quantas foram de cada tipo
const MOTIVOS_REPOSICAO = ['Falta', 'Troca de plantão', 'Feriado', 'Outro'];

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
  editarEspecialidade: (id, nome) => chamarApi(`/api/especialidades/${id}`, 'PUT', { nome }),
  excluirEspecialidade: (id) => chamarApi(`/api/especialidades/${id}`, 'DELETE'),
  criarMedico: (nome, especialidade_id, titulo, pacientes_por_turno) =>
    chamarApi('/api/medicos', 'POST', { nome, especialidade_id, titulo, pacientes_por_turno }),
  editarMedico: (id, nome, especialidade_id, titulo, pacientes_por_turno) =>
    chamarApi(`/api/medicos/${id}`, 'PUT', { nome, especialidade_id, titulo, pacientes_por_turno }),
  excluirMedico: (id) => chamarApi(`/api/medicos/${id}`, 'DELETE'),
  criarSala: (dadosSala) => chamarApi('/api/salas', 'POST', dadosSala),
  excluirSala: (id) => chamarApi(`/api/salas/${id}`, 'DELETE'),
  atualizarCelula: (sala_id, dia_semana, turno, medico_id, obs) =>
    chamarApi('/api/escala', 'PUT', { sala_id, dia_semana, turno, medico_id, obs }),
  criarReposicao: (medico_id, sala_id, data, turno, motivo, observacao) =>
    chamarApi('/api/reposicoes', 'POST', { medico_id, sala_id, data, turno, motivo, observacao }),
  excluirReposicao: (id) => chamarApi(`/api/reposicoes/${id}`, 'DELETE')
};

const pct = (v) => (v * 100).toFixed(1) + '%';

// Cor de acordo com a % de ocupação: <60% saudável, 60–85% moderado, >85% crítico
function corPorOcupacao(percentual) {
  if (percentual >= 0.85) return { cor: 'var(--red-600)', pill: 'pill-vermelho', ponto: 'ponto-vermelho' };
  if (percentual >= 0.6) return { cor: 'var(--amber-600)', pill: 'pill-ambar', ponto: 'ponto-ambar' };
  return { cor: 'var(--green-600)', pill: 'pill-verde', ponto: 'ponto-verde' };
}

// Quantos pacientes esse médico atende por turno — usa o número dele se
// tiver cadastrado, senão cai no padrão do consultório.
function capacidadeDoMedico(medico, sala) {
  const vagasPadrao = Number(sala && sala.capacidade_por_turno) || 16;
  return (medico && medico.pacientes_por_turno) ? Number(medico.pacientes_por_turno) : vagasPadrao;
}

// ---------- CÁLCULO POR SALA ----------
// Monta "Dr. Fulano" / "Dra. Joana" a partir do nome + título cadastrados,
// sem duplicar o título se a pessoa já tiver digitado ele dentro do nome.
function formatarNomeMedico(medico) {
  if (!medico) return '';
  const titulo = (medico.titulo || '').trim();
  const nome = (medico.nome || '').trim();
  if (!titulo) return nome;
  if (nome.toLowerCase().startsWith(titulo.toLowerCase())) return nome;
  return `${titulo} ${nome}`;
}

// Instalada/Atual agora somam a capacidade REAL de cada horário:
// se tem médico marcado e ele tem "pacientes_por_turno" cadastrado, usa esse
// número; senão (ou se o horário está livre) usa o padrão do consultório.
function calcularSala(dados, sala) {
  let ocupados = 0;
  let instalada = 0;
  let atual = 0;
  const encaixesLivresHoje = [];
  const hoje = diaDeHoje();
  const vagasPadrao = Number(sala.capacidade_por_turno) || 16;

  DIAS.forEach(dia => {
    turnosDoDia(dia).forEach(turno => {
      const celula = dados.escala[chaveCelula(sala.id, dia, turno)];
      const medico = celula && celula.medico_id ? dados.medicos.find(m => m.id === celula.medico_id) : null;
      const vagasDesseHorario = (medico && medico.pacientes_por_turno) ? Number(medico.pacientes_por_turno) : vagasPadrao;

      instalada += vagasDesseHorario;
      if (medico) {
        ocupados += 1;
        atual += vagasDesseHorario;
      } else if (dia === hoje) {
        encaixesLivresHoje.push(turno);
      }
    });
  });

  const livres = TOTAL_ENCAIXES - ocupados;
  const instaladaMensal = instalada * SEMANAS_POR_MES;
  const atualMensal = atual * SEMANAS_POR_MES;
  const livreMensal = instaladaMensal - atualMensal;
  const percentual = instaladaMensal > 0 ? atualMensal / instaladaMensal : 0;

  return {
    sala, ocupados, livres, vagas: vagasPadrao,
    instalada: instaladaMensal, atual: atualMensal, livre: livreMensal,
    percentual, encaixesLivresHoje
  };
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