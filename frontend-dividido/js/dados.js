// ============================================================
// dados.js
// Único lugar com a REGRA DE NEGÓCIO e o ACESSO AOS DADOS.
// Toda página do sistema inclui este arquivo antes do seu
// próprio script. Nada de HTML/DOM aqui — só dados e cálculo.
// ============================================================

const CHAVE = 'consultorios_dados_v2';

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
// Registros novos já guardam isso em sala.sala_espera; pra registros
// antigos (criados antes dessa mudança), derivamos do nome, cortando
// em " - Consultório " — ex: "Sala de Espera 2 - Consultório 1" -> "Sala de Espera 2".
function obterGrupoSalaEspera(sala) {
  if (sala.sala_espera) return sala.sala_espera;
  return sala.nome.split(' - Consultório ')[0];
}

// JS: getDay() -> 0=domingo,1=segunda...6=sábado
function diaDeHoje() {
  const mapa = { 1: 'Segunda-Feira', 2: 'Terça-Feira', 3: 'Quarta-Feira', 4: 'Quinta-Feira', 5: 'Sexta-Feira', 6: 'Sábado' };
  return mapa[new Date().getDay()] || null; // null = domingo, sem expediente
}

// Turnos livres de uma sala num dia qualquer da semana (não só hoje) —
// usado pra deixar o painel "Livre agora" do dashboard trocar de dia ao clicar no gráfico.
function turnosLivresNoDia(dados, sala, dia) {
  return turnosDoDia(dia).filter(turno => {
    const c = dados.escala[chaveCelula(sala.id, dia, turno)];
    return !(c && c.medico_id);
  });
}

function estadoInicial() {
  return { proximoId: 1, especialidades: [], medicos: [], salas: [], escala: {} };
}

const banco = {
  ler() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      const dados = bruto ? JSON.parse(bruto) : estadoInicial();
      // garante que todos os campos existam, mesmo se o dado salvo for de uma versão antiga
      return {
        proximoId: dados.proximoId || 1,
        especialidades: dados.especialidades || [],
        medicos: dados.medicos || [],
        salas: dados.salas || [],
        escala: dados.escala || {}
      };
    } catch (erro) {
      console.error('Não consegui ler os dados salvos, começando do zero.', erro);
      return estadoInicial();
    }
  },
  salvar(dados) { localStorage.setItem(CHAVE, JSON.stringify(dados)); },
  novoId(dados) { const id = dados.proximoId; dados.proximoId += 1; return id; }
};

function limparTudo() {
  if (!confirm('Isso vai apagar todos os dados de teste salvos neste navegador. Confirma?')) return;
  localStorage.removeItem(CHAVE);
  location.reload();
}

const pct = (v) => (v * 100).toFixed(1) + '%';

// Cor de acordo com a % de ocupação: <60% saudável, 60–85% moderado, >85% crítico
function corPorOcupacao(percentual) {
  if (percentual >= 0.85) return { cor: 'var(--red-600)', pill: 'pill-vermelho', ponto: 'ponto-vermelho' };
  if (percentual >= 0.6) return { cor: 'var(--amber-600)', pill: 'pill-ambar', ponto: 'ponto-ambar' };
  return { cor: 'var(--green-600)', pill: 'pill-verde', ponto: 'ponto-verde' };
}

// ---------- CÁLCULO POR SALA ----------
// Instalada = vagas_por_turno x 16 | Atual = vagas_por_turno x ocupados
// Livre = vagas_por_turno x livres | % = ocupados / 16
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

// Resumo por dia da semana (usado no gráfico de barras e nos alertas)
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