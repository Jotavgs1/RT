# RT – Rastreador de Vendas Mercado Livre

Aplicativo local para acompanhar estimativas de vendas de anúncios do Mercado Livre Brasil.

## ⚠️ Aviso Importante

Todos os dados são **estimativas** baseadas em variações públicas de quantidade disponível e quantidade vendida reportada pela API do Mercado Livre. **Não representam dados reais do vendedor.**

## 🚀 Como Instalar e Usar (Windows)

### Pré-requisitos

1. **Node.js 18 ou superior**
   - Acesse: https://nodejs.org/
   - Baixe a versão LTS e instale normalmente
   - Após instalar, abra o Prompt de Comando e verifique: `node --version`

2. **Git** (opcional, para clonar o repositório)
   - Acesse: https://git-scm.com/download/win

### Instalação

1. Abra o **Prompt de Comando** ou **PowerShell** na pasta do projeto
2. Execute:
   ```
   npm install
   ```
   Aguarde a instalação de todas as dependências.

### Configuração

1. Copie o arquivo `.env.example` para `.env.local`:
   ```
   copy .env.example .env.local
   ```
2. Abra o arquivo `.env.local` em um editor de texto
3. Preencha suas credenciais do Mercado Livre:
   - `MELI_ACCESS_TOKEN`: Seu token de acesso
   - `MELI_CLIENT_ID`: Seu Client ID
   - `MELI_CLIENT_SECRET`: Seu Client Secret

   > **Como obter as credenciais:** Acesse https://developers.mercadolivre.com.br/, crie uma aplicação e gere um token de acesso.

   > **Sem credenciais:** O app funciona sem token para URLs públicas, mas pode ter limites de requisição.

### Iniciando o Servidor

```
npm run dev
```

Acesse no navegador: **http://localhost:3000**

### Como Usar

1. **Criar um Projeto**: Clique em "+ Novo Projeto" e dê um nome (ex: "Concorrente A")

2. **Adicionar Anúncios**:
   - Clique em "📋 Anúncios" e depois "+ Adicionar Link"
   - Cole a URL do anúncio do Mercado Livre
   - Formatos aceitos:
     - `https://produto.mercadolivre.com.br/MLB-XXXXXXXX-...`
     - `https://www.mercadolivre.com.br/.../p/MLBxxxxxxx`

3. **Coletar Dados**: Clique em "🔄 Coletar Agora" para capturar um snapshot dos dados atuais

4. **Ver Calendário**: O calendário mostra estimativas de vendas por dia com código de cores:
   - 🔲 Cinza: 0 vendas
   - 🔵 Azul claro: menos de 10 unidades
   - 🔵 Azul médio: 10-50 unidades
   - 🔵 Azul escuro: mais de 50 unidades

5. **Ver Detalhes do Dia**: Clique em qualquer dia no calendário para ver:
   - Unidades vendidas estimadas
   - Número de publicações que venderam
   - Faturamento estimado
   - Ticket médio estimado
   - Tabela de anúncios individuais

6. **Exportar CSV**: Use os botões "📥 CSV por Dia" ou "📥 CSV por Anúncio" para exportar dados

### Coleta Automática

Para coletar dados automaticamente, você pode usar o **Agendador de Tarefas do Windows**:

1. Abra o Agendador de Tarefas (pesquise "Agendador de Tarefas" no menu Iniciar)
2. Crie uma nova tarefa básica
3. Configure para executar a cada hora (ou o intervalo desejado)
4. Ação: executar `npm run collect` na pasta do projeto

Ou configure o intervalo no arquivo `.env.local`:
```
COLLECT_INTERVAL_MINUTES=60
```

### Estrutura do Banco de Dados

Os dados são armazenados localmente em `data/rt.db` (SQLite). Não são enviados para nenhum servidor externo.

## 🔧 Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Compila o projeto para produção |
| `npm start` | Inicia o servidor de produção (após build) |
| `npm run collect` | Executa coleta manual (servidor deve estar rodando) |

## 📁 Estrutura de Arquivos

```
RT/
├── src/
│   ├── app/              # Páginas e rotas da API (Next.js App Router)
│   │   ├── api/          # Endpoints da API REST
│   │   ├── page.tsx      # Página principal
│   │   ├── layout.tsx    # Layout raiz
│   │   └── globals.css   # Estilos globais
│   └── lib/              # Bibliotecas internas
│       ├── db.ts         # Banco de dados SQLite
│       ├── meli.ts       # Cliente da API do Mercado Livre
│       ├── collector.ts  # Lógica de coleta de snapshots
│       ├── estimator.ts  # Cálculo de estimativas
│       └── scheduler.ts  # Agendador de coletas
├── scripts/
│   └── collect.js        # Script de coleta manual
├── data/                 # Banco de dados (criado automaticamente)
├── .env.local            # Credenciais (não versionado)
├── .env.example          # Exemplo de configuração
└── package.json
```

## ❓ Solução de Problemas

**Erro ao instalar dependências:**
- Certifique-se de ter Node.js 18+ instalado
- No Windows, pode ser necessário instalar as ferramentas de build: `npm install --global windows-build-tools`

**Erro "better-sqlite3" não compila:**
- Execute: `npm rebuild better-sqlite3`

**App não abre no navegador:**
- Verifique se a porta 3000 não está em uso
- Tente: `npm run dev -- --port 3001`

**Dados não aparecem no calendário:**
- Clique em "🔄 Coletar Agora" para buscar os dados
- Certifique-se de ter adicionado anúncios ao projeto

## 📄 Licença

Uso privado. Não distribuir.
