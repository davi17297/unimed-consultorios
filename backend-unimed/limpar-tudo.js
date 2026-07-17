const readline = require('readline');
const pool = require('./db');

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const resposta = await new Promise((resolve) => {
    rl.question(
      'Isso vai APAGAR TODOS os dados (especialidades, médicos, consultórios e escala) do banco.\n' +
      'Essa ação não tem volta. Digite "sim" e aperte Enter pra confirmar: ',
      resolve
    );
  });
  rl.close();

  if (resposta.trim().toLowerCase() !== 'sim') {
    console.log('Cancelado. Nada foi apagado.');
    process.exit(0);
  }

  console.log('Apagando...');
  await pool.query('TRUNCATE TABLE escala, sala_especialidades, salas, medicos, especialidades RESTART IDENTITY CASCADE;');
  console.log('Pronto! O banco está vazio, pronto pra receber a importação nova.');
  await pool.end();
}

main().catch((err) => {
  console.error('Erro ao limpar o banco:', err);
  process.exit(1);
});
