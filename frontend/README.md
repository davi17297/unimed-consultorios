# Frontend dividido — Escala de Consultórios

Cada tela agora é um arquivo `.html` separado, em vez de tudo dentro de um
`index.html` só. A ideia: abrir a pasta, ver os nomes dos arquivos, e já saber
onde mexer em cada parte.

```
frontend/
├── index.html            → só redireciona pro Dashboard (ponto de entrada)
├── dashboard.html          → tela inicial (cards, gráfico, alertas)
├── disponibilidade.html    → grade semanal por consultório
├── consultorios.html       → cadastro de salas/consultórios
├── profissionais.html      → cadastro de especialidades e médicos
├── relatorios.html         → placeholder (entra quando tivermos backend)
├── importar.html           → placeholder (importar a planilha, com backend)
├── config.html             → limpar dados de teste
│
├── css/
│   └── estilo.css          → todo o visual do sistema (cores, cards, tabela...)
│
└── js/
    ├── dados.js             → REGRA DE NEGÓCIO + acesso ao localStorage.
    │                          Não mexe em tela nenhuma, só calcula e guarda dado.
    │                          Toda página inclui este arquivo primeiro.
    ├── layout.js            → relógio da topbar + botão "Atualizar" (comum a todas)
    ├── dashboard.js          → só a lógica da tela Dashboard
    ├── disponibilidade.js    → só a lógica da grade semanal
    ├── consultorios.js       → só a lógica do cadastro de salas
    └── profissionais.js      → só a lógica de especialidades/médicos
```

## Onde mexer em cada coisa

- **Mudar uma regra de cálculo** (ex: quantos encaixes por semana, o que conta
  como "livre") → `js/dados.js`, função `calcularSala()`.
- **Mudar cor, espaçamento, fonte** → `css/estilo.css` (vale pra todas as
  telas de uma vez, porque é o mesmo arquivo).
- **Mudar o que aparece no Dashboard** → `dashboard.html` (estrutura) e
  `js/dashboard.js` (lógica).
- **Adicionar um campo no cadastro de consultório** → `consultorios.html`
  (campo do formulário) e `js/consultorios.js` (o que fazer com ele).
- **Criar uma tela nova** → copia um dos `.html` existentes como molde (sidebar
  + topbar são sempre iguais), troca o conteúdo de dentro de `<main>`, e cria
  um `js/nome-da-tela.js` próprio.

## Como rodar

Como agora são várias páginas separadas, é melhor **não abrir direto pelo
duplo-clique** — alguns navegadores tratam cada arquivo `file://` como uma
"origem" diferente e os dados salvos numa tela podem não aparecer na outra.

O jeito simples de evitar isso é rodar um servidor local bem básico dentro da
pasta `frontend/`:

```bash
# com Python (já vem instalado na maioria dos computadores)
python3 -m http.server 8080

# ou, se tiver Node instalado
npx serve .
```

Depois é só abrir `http://localhost:8080` (ou a porta que aparecer) no
navegador — todas as telas vão enxergar os mesmos dados salvos.

## O que não muda

Os dados continuam salvos no `localStorage` do navegador (mesma chave de
antes), então nada que você já cadastrou se perde ao trocar pra essa versão
dividida.
