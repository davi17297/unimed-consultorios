const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Aplicando schema.sql no banco...');
  await pool.query(sql);
  console.log('Pronto! Tabelas criadas (ou já existiam).');
  await pool.end();
}

main().catch((err) => {
  console.error('Erro ao inicializar o banco:', err);
  process.exit(1);
});
