// ============================================================
// layout.js
// Comportamento comum do topo (data/hora e botão "Atualizar").
// Cada página define window.atualizarPagina = fn (uma função que
// SÓ RE-RENDERIZA usando o cache, sem buscar na rede de novo) antes
// de incluir este script.
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

// Chamado pelo botão "Atualizar" do topo: busca os dados de novo no
// servidor e manda a página re-renderizar com o que chegou.
async function atualizarTudo() {
  try {
    await carregarDados();
  } catch (erro) {
    console.error('Erro ao atualizar os dados:', erro);
    alert('Não consegui falar com o servidor agora. Confere sua internet e tenta de novo.');
    return;
  }
  if (typeof window.atualizarPagina === 'function') {
    window.atualizarPagina();
  }
  atualizarRelogio();
}

document.addEventListener('DOMContentLoaded', atualizarRelogio);

// ============================================================
// Modal de confirmação com a cara do sistema, pra substituir o
// confirm() feio do navegador. Uso: const ok = await confirmarModal(
//   '<h3>Título</h3><p>Mensagem...</p>', { textoConfirmar: 'Confirmar' }
// );
// ============================================================
function confirmarModal(mensagemHtml, opcoes = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-caixa">
        <div class="modal-corpo">${mensagemHtml}</div>
        <div class="modal-acoes">
          <button class="btn" id="modal-botao-cancelar">${opcoes.textoCancelar || 'Cancelar'}</button>
          <button class="btn btn-primario" id="modal-botao-confirmar">${opcoes.textoConfirmar || 'Confirmar'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const remover = (resultado) => {
      overlay.remove();
      document.removeEventListener('keydown', aoTeclar);
      resolve(resultado);
    };
    const aoTeclar = (e) => { if (e.key === 'Escape') remover(false); };

    overlay.querySelector('#modal-botao-cancelar').addEventListener('click', () => remover(false));
    overlay.querySelector('#modal-botao-confirmar').addEventListener('click', () => remover(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) remover(false); });
    document.addEventListener('keydown', aoTeclar);
  });
}