// ============================================================
// mesclar-medicos-duplicados.js
//
// Corrige médicos que foram cadastrados MAIS DE UMA VEZ como se
// fossem pessoas diferentes — normalmente porque, na importação da
// planilha antiga, veio texto colado junto do nome na mesma célula
// (ex: "Dra. Adriana Machado - 17/07", "Dra. Adriana Machado -
// 18/07") ou por causa de uma pontuação diferente (ex: "Dra Ane
// Juliane" sem ponto vs "Dra. Ane Juliane" com ponto).
//
// O QUE ELE FAZ:
// 1) Agrupa os médicos por um "nome base" (tira acento, pontuação,
//    e qualquer coisa colada depois de um traço solto ou parênteses).
// 2) Pra cada grupo com mais de 1 médico, escolhe UM deles como
//    "principal" (o que já tiver o nome mais limpo, ou o mais
//    antigo em caso de empate) e move pra ele tudo que os outros
//    tinham (escala, reposições, fechamentos de agenda) — depois
//    apaga os duplicados.
//
// COMO USAR (sempre dentro de backend-unimed, com o .env apontando
// pra DATABASE_URL PÚBLICA do Railway):
//   node mesclar-medicos-duplicados.js           -> só MOSTRA o que
//                                                     seria mesclado,
//                                                     não mexe em nada
//   node mesclar-medicos-duplicados.js --aplicar  -> mescla de verdade
//
// Sempre rode primeiro SEM --aplicar, confere se os grupos fazem
// sentido (são mesmo a mesma pessoa), e só depois roda com --aplicar.
// ============================================================

const readline = require('readline');
const pool = require('./db');

function removerAcentos(txt) {
  return (txt || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Nome "limpo": tira observação entre parênteses e qualquer coisa
// colada depois de um traço solto (mesma lógica do importar.js).
function nomeLimpo(nomeBruto) {
  let nome = (nomeBruto || '').toString().trim();
  const idxParen = nome.indexOf('(');
  if (idxParen !== -1) nome = nome.slice(0, idxParen).trim();
  const idxTraco = nome.search(/\s[-–]\s?/);
  if (idxTraco !== -1) nome = nome.slice(0, idxTraco).trim();
  return nome.replace(/[-–]\s*$/, '').trim();
}

// Chave de agrupamento: nome limpo, sem acento, sem pontuação, sem
// espaço duplicado — pra "Dra Ane Juliane" e "Dra. Ane Juliane"
// caírem no mesmo grupo.
function chaveAgrupamento(nomeBruto) {
  return removerAcentos(nomeLimpo(nomeBruto))
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const aplicar = process.argv.includes('--aplicar');

  const { rows: medicos } = await pool.query('SELECT id, nome FROM medicos ORDER BY id');

  const grupos = new Map(); // chave -> [medico, medico, ...]
  medicos.forEach(m => {
    const chave = chaveAgrupamento(m.nome);
    if (!chave) return; // nome vazio, ignora
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(m);
  });

  const gruposDuplicados = Array.from(grupos.values()).filter(g => g.length > 1);

  if (gruposDuplicados.length === 0) {
    console.log('Não achei nenhum médico duplicado. Nada a fazer.');
    await pool.end();
    return;
  }

  console.log(`Achei ${gruposDuplicados.length} grupo(s) de médico duplicado:\n`);

  // Pra cada grupo, decide quem é o "principal": o que já tem o nome
  // mais limpo (nomeLimpo(nome) === nome, ou seja, não tinha nada
  // colado); em empate, o de menor id (o mais antigo).
  const planoDeMesclagem = gruposDuplicados.map(grupo => {
    const ordenado = [...grupo].sort((a, b) => {
      const aLimpo = nomeLimpo(a.nome) === a.nome.trim() ? 0 : 1;
      const bLimpo = nomeLimpo(b.nome) === b.nome.trim() ? 0 : 1;
      if (aLimpo !== bLimpo) return aLimpo - bLimpo;
      return a.id - b.id;
    });
    const principal = ordenado[0];
    const duplicados = ordenado.slice(1);
    const nomeFinal = nomeLimpo(principal.nome);

    console.log(`  Grupo "${nomeFinal}":`);
    console.log(`    principal -> id ${principal.id} (nome atual: "${principal.nome}")${nomeFinal !== principal.nome.trim() ? ` -> vai virar "${nomeFinal}"` : ''}`);
    duplicados.forEach(d => console.log(`    remove    -> id ${d.id} (nome atual: "${d.nome}")`));
    console.log('');

    return { principal, duplicados, nomeFinal };
  });

  if (!aplicar) {
    console.log('Isso foi só uma prévia — nada foi alterado no banco.');
    console.log('Se os grupos acima fazem sentido (são mesmo a mesma pessoa), rode de novo com --aplicar:');
    console.log('  node mesclar-medicos-duplicados.js --aplicar');
    await pool.end();
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const resposta = await new Promise((resolve) => {
    rl.question(
      `\nIsso vai mesclar ${gruposDuplicados.length} grupo(s) de médico duplicado de verdade (não tem volta). Digite "sim" e aperte Enter pra confirmar: `,
      resolve
    );
  });
  rl.close();

  if (resposta.trim().toLowerCase() !== 'sim') {
    console.log('Cancelado. Nada foi alterado.');
    await pool.end();
    return;
  }

  console.log('\nMesclando...');
  for (const { principal, duplicados, nomeFinal } of planoDeMesclagem) {
    for (const dup of duplicados) {
      await pool.query('UPDATE escala SET medico_id = $1 WHERE medico_id = $2', [principal.id, dup.id]);
      await pool.query('UPDATE reposicoes SET medico_id = $1 WHERE medico_id = $2', [principal.id, dup.id]);
      await pool.query('UPDATE fechamentos_agenda SET medico_id = $1 WHERE medico_id = $2', [principal.id, dup.id]);
      await pool.query('DELETE FROM medicos WHERE id = $1', [dup.id]);
      console.log(`  Médico id ${dup.id} mesclado dentro do id ${principal.id}.`);
    }
    if (nomeFinal !== principal.nome.trim()) {
      await pool.query('UPDATE medicos SET nome = $1 WHERE id = $2', [nomeFinal, principal.id]);
      console.log(`  Nome do id ${principal.id} atualizado pra "${nomeFinal}".`);
    }
  }

  console.log('\nPronto! Médicos duplicados mesclados.');
  await pool.end();
}

main().catch((err) => {
  console.error('Erro ao mesclar médicos duplicados:', err);
  process.exit(1);
});
