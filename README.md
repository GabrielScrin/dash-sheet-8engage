# Engage DashView

Dashboard web app para conectar Google Sheets e Meta Ads, montar dashboards compartilháveis e expor links públicos com proteção opcional por senha.

## Stack

- Vite
- React 18
- TypeScript
- React Router
- TanStack Query
- Tailwind + shadcn/ui
- Supabase Auth, Database e Edge Functions

## Estrutura

- `src/`: frontend da aplicação
- `src/pages/app/`: fluxo autenticado de projetos, configuração e preview
- `src/contexts/`: contexto de autenticação
- `src/integrations/supabase/`: client e tipos do Supabase
- `supabase/functions/`: Edge Functions para Google Sheets, Meta Ads, compartilhamento e integrações
- `supabase/migrations/`: histórico de schema
- `docs/`: documentação complementar

## Ambiente local

Use `npm` como gerenciador de pacotes padrão deste projeto.

1. Instale dependências:

```sh
npm install
```

2. Crie o arquivo de ambiente a partir do exemplo:

```sh
cp .env.example .env
```

3. Preencha as variáveis públicas do frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

4. Rode o app:

```sh
npm run dev
```

## Scripts

- `npm run dev`: servidor local do Vite
- `npm run build`: build de produção
- `npm run build:dev`: build em modo development
- `npm run lint`: checagem com ESLint
- `npm run preview`: preview local do build
- `npm run test`: suíte Vitest
- `npm run test:watch`: Vitest em watch mode

## Supabase

Este projeto depende de Edge Functions e variáveis de ambiente no Supabase para:

- autenticação Google e Meta
- leitura de planilhas
- geração e validação de links compartilhados
- integrações de pagamento

As funções esperam chaves como `SUPABASE_SERVICE_ROLE_KEY`, credenciais OAuth do Google/Meta e, opcionalmente, Upstash Redis para rate limit/cache do Google Sheets.

## Segurança e operação

- `.env` não deve ser versionado.
- O repositório usa `npm`; lockfiles do Bun foram removidos para evitar drift.
- Tokens OAuth persistentes devem ser armazenados via `service_tokens`, não em tabelas de perfil acessíveis pelo cliente.
