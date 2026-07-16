# Backend — Escala de Consultórios (Unimed Goiânia)

API que vai substituir o `localStorage` do frontend por um banco de dados de
verdade no Railway. Ela devolve os dados **no mesmo formato** que o frontend já
usa hoje (`especialidades`, `medicos`, `salas`, `escala`) — então, quando a
gente conectar o frontend nisso, a troca é pequena.

## O que tem aqui

```
backend-unimed/
├── server.js       # a API (rotas)
├── db.js           # conexão com o Postgres
├── schema.sql       # estrutura das tabelas
├── init-db.js       # script que cria as tabelas (roda uma vez)
├── package.json
├── railway.json      # configuração de deploy do Railway
└── .env.example
```

## Passo 1 — Criar o projeto no Railway

1. Entra em **https://railway.app** e loga (dá pra usar a conta do GitHub)
2. Clica em **"New Project"**
3. Escolhe **"Deploy from GitHub repo"**
4. Se esse backend estiver numa pasta dentro do MESMO repositório do frontend
   (`unimed-consultorios`), escolhe esse repositório. Se preferir separar,
   pode criar um repositório novo só pro backend — sua escolha.
5. O Railway vai perguntar/detectar sozinho — se pedir o "Root Directory",
   aponta pra pasta `backend-unimed` (só se o backend estiver dentro do
   mesmo repo que o frontend).

## Passo 2 — Adicionar o banco de dados

1. Dentro do projeto no Railway, clica em **"New"** → **"Database"** →
   **"Add PostgreSQL"**
2. Pronto — o Railway cria o banco e já disponibiliza a variável
   `DATABASE_URL` automaticamente pro seu serviço (você não precisa copiar
   nem digitar nada).

## Passo 3 — Criar as tabelas no banco

Isso só precisa ser feito **uma vez**. Duas formas de fazer:

**Opção A — pelo terminal do Railway (mais simples):**
1. No serviço do backend, vai na aba **"Settings"** → procura por um botão
   de terminal/shell (ou usa o **Railway CLI**, se preferir)
2. Roda: `npm run db:init`

**Opção B — rodando local, apontando pro banco do Railway:**
1. No Railway, entra no serviço do **PostgreSQL** → aba **"Variables"** →
   copia o valor de `DATABASE_URL`
2. No seu PC, dentro da pasta `backend-unimed`:
   ```bash
   npm install
   ```
3. Cria um arquivo `.env` (copia o `.env.example` e renomeia) e cola o
   `DATABASE_URL` que você copiou
4. Roda: `npm run db:init`

## Passo 4 — Testar se o backend está no ar

Depois do deploy, o Railway te dá uma URL pública (parecido com
`https://unimed-consultorios-backend-production.up.railway.app`).

Abre essa URL + `/api/status` no navegador, tipo:
```
https://sua-url-aqui.up.railway.app/api/status
```
Se aparecer `{"ok":true,"mensagem":"Backend da Unimed Consultórios rodando."}`,
deu tudo certo — o backend está no ar e conectado ao banco.

Também dá pra testar `/api/dados` — no começo deve voltar tudo vazio:
```json
{"especialidades":[],"medicos":[],"salas":[],"escala":{}}
```

## O que NÃO fizemos ainda (de propósito)

Por enquanto o **frontend continua usando o `localStorage`**, sem falar com
esse backend. A ideia é confirmar que o backend funciona sozinho primeiro
(esse passo 4 acima) antes de mexer no frontend — assim, se algo der errado,
a gente sabe exatamente onde procurar.

O próximo passo, depois de você confirmar que `/api/status` funciona, é eu
trocar o `banco.ler()` / `banco.salvar()` do `js/dados.js` pra chamar essa API
em vez do `localStorage`. Me chama quando confirmar que o backend está no ar.
