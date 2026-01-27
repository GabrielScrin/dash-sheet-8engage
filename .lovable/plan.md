

## Plataforma de Dashboards de Leitura - Google Sheets

Uma aplicação web de dashboards de visualização que conecta nativamente a planilhas Google do usuário, permitindo que Admins configurem relatórios visuais e Clientes acessem via links compartilhados.

---

### Fase 1: Fundação e Autenticação

**Configuração do Supabase e Estrutura Base**
- Ativar Lovable Cloud com Supabase para banco de dados, autenticação e edge functions
- Criar schema do banco: tabelas `projects`, `column_mappings`, `share_tokens`, `access_logs`
- Implementar tema claro/escuro com paleta Meta-like (azul #1877F2) e tipografia Inter
- Configurar variáveis CSS para design system consistente

**Autenticação Google para Admin**
- Login OAuth2 via Supabase Auth com Google
- Armazenar refresh tokens criptografados para acesso às planilhas
- Página de login elegante com botão "Entrar com Google"
- Proteção de rotas para área administrativa

---

### Fase 2: Integração Google Sheets

**Edge Function para Google Sheets API**
- Criar edge function para listar planilhas do usuário
- Endpoint para ler cabeçalhos e preview de abas (10 primeiras linhas)
- Endpoint para leitura de ranges específicos com cache
- Sistema de cache com TTL configurável (5 min padrão)

**Seletor de Planilha e Aba**
- Interface visual para listar planilhas disponíveis (nome, data modificação)
- Busca e filtro de planilhas
- Preview dos cabeçalhos ao selecionar uma aba
- Feedback visual de carregamento e estados de erro

---

### Fase 3: Configuração de Dashboard (Admin)

**Interface de Mapeamento de Colunas**
- Wizard em 5 passos com stepper vertical
- Drag-and-drop para mapear colunas → métricas (usando dnd-kit)
- Validação de tipos (número, moeda, data, texto)
- Preview dinâmico do dashboard em tempo real

**Configuração de KPIs e Métricas**
- Seleção de até 12 big numbers para exibição
- Configuração de etapas do funil (impressões → vendas)
- Definição de período padrão (últimos 7/14/28 dias)
- Salvamento das configurações no banco

---

### Fase 4: Dashboard de Visualização

**Layout Principal com Duas Abas**
- Tabs animadas: "Perpétua" e "Distribuição de Conteúdos" (Framer Motion)
- Header fixo minimalista com nome do projeto e toggle de tema
- Filtros sticky: date range picker, seletor de criativo, visão semanal

**Big Numbers (KPIs)**
- Cards horizontais responsivos (3-6 por linha)
- Contadores animados com easing (react-countup)
- Variação percentual com cores (verde/vermelho) e setas
- Tooltips explicativos e aria-live para acessibilidade

**Tabela de Comparação Semanal**
- Tabela compacta com últimas 4-5 semanas
- Colunas: Semana, Vendas, Investimento, Faturamento, ROAS, Taxa de Conversão
- Ordenação por coluna e virtualização para performance
- Hover effects sutis com transform e shadow

**Performance por Criativo**
- Tabela com métricas por criativo (impressões, cliques, CTR, vendas)
- Clique na linha aplica filtro por criativo
- Paginação e ordenação avançada

**Funil de Conversão**
- Visualização SVG animada (GSAP timeline)
- Etapas: Impressões → Cliques → Landing Page → Checkout → Vendas
- Taxas percentuais entre etapas
- Animação sequencial de expansão ao carregar

---

### Fase 5: Compartilhamento e Acesso

**Geração de Links de Visualização**
- JWT assinado com projectId, expiração e filtros permitidos
- Modal de compartilhamento com opções de expiração
- Animação de copy-to-clipboard com checkmark
- Filtros persistidos na URL (query params)

**Página de Dashboard Público (/view/:token)**
- Acesso sem autenticação via token JWT
- Validação e decodificação do token
- Renderização do dashboard com dados cacheados
- Versão embedável para iframes (/embed/:token)

---

### Fase 6: Logs, Auditoria e Refinamentos

**Sistema de Logs de Acesso**
- Registro de visualizações (quem, quando, qual dashboard)
- Tabela de auditoria para Admins
- Timestamp de última atualização visível no dashboard

**Otimizações e Polish**
- Responsividade completa (desktop, tablet)
- Animações de transição refinadas
- Estados de loading, empty e erro elegantes
- Acessibilidade (atalhos de teclado, labels semânticos, WCAG)

---

### Componentes Principais a Criar

| Componente | Descrição |
|------------|-----------|
| `BigNumberCard` | Card de métrica com contador animado |
| `WeeklyComparisonTable` | Tabela de semanas com ordenação |
| `CreativePerformanceTable` | Tabela de criativos com métricas |
| `FunnelVisualization` | Funil SVG animado com GSAP |
| `SheetSelector` | Seletor visual de planilhas |
| `ColumnMapper` | Interface drag-and-drop de mapeamento |
| `DateRangePicker` | Picker de período com presets |
| `ShareModal` | Modal de geração de link |
| `ThemeToggle` | Switch claro/escuro |

---

### Páginas da Aplicação

| Rota | Descrição |
|------|-----------|
| `/login` | Autenticação Google |
| `/app/projects` | Lista de dashboards do Admin |
| `/app/projects/:id/config` | Wizard de configuração |
| `/app/projects/:id/preview` | Preview para Admin |
| `/view/:token` | Dashboard público |
| `/embed/:token` | Versão embedável |

