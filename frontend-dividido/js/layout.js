// ============================================================
// layout.js
// Comportamento comum do topo (data/hora e botão "Atualizar").
// Cada página, se quiser, define window.atualizarPagina = fn
// ANTES de incluir este script — o botão chama essa função em
// vez de recarregar a página inteira.
// ============================================================

function atualizarRelogio() {
  const elData = document.getElementById('data-hoje');
  const elHora = document.getElementById('hora-atualizacao');
  const agora = new Date();
  if (elData) {
    elData.textContent = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  }
  if (elHora) {
    elHora.textContent = 'Atualizado às ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
}

function atualizarTudo() {
  if (typeof window.atualizarPagina === 'function') {
    window.atualizarPagina();
  } else {
    location.reload();
  }
  atualizarRelogio();
}

document.addEventListener('DOMContentLoaded', atualizarRelogio);
