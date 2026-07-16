const { Pool } = require('pg');
require('dotenv').config();

// No Railway, a variável DATABASE_URL é criada automaticamente
// quando você adiciona o plugin PostgreSQL ao projeto.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false
});

module.exports = pool;
