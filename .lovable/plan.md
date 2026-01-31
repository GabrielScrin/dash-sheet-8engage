
# Plano para Corrigir Preview e Publicar (Tela em Branco)

## Problema Identificado

Após análise detalhada do código, identifiquei as seguintes causas para a tela em branco:

### 1. Falta de Tratamento de Erro no ProjectPreview

Quando o fetch do projeto falha (por erro de rede ou permissão), o componente `ProjectPreview.tsx`:
- Mostra um toast de erro, mas...
- Continua renderizando o `DashboardView` mesmo com `project === null`
- O `DashboardView` faz queries adicionais que também falham silenciosamente

### 2. Falta de Tratamento para Projeto Sem Configuração

O `DashboardView` não trata o caso onde:
- `project.spreadsheet_id` é `null` (planilha não selecionada)
- `sheetNames` é um array vazio (sem abas configuradas)

Nesses casos, a tela fica em branco porque a query de sheets está desabilitada mas não há UI de feedback.

### 3. Falta de Error Boundary

Erros no React causam crash silencioso sem feedback visual.

---

## Solução

### Arquivo 1: `src/pages/app/ProjectPreview.tsx`

**Mudanças:**
- Adicionar tratamento para quando projeto não é encontrado
- Redirecionar para lista de projetos com mensagem de erro
- Melhorar feedback visual

```tsx
// Adicionar após linha 46 (no catch)
} catch (error: any) {
  toast({
    title: 'Erro ao carregar projeto',
    description: error.message,
    variant: 'destructive',
  });
  // Redirecionar para lista de projetos após erro
  navigate('/app/projects');
} finally {
```

```tsx
// Adicionar check após loading, antes do return principal
if (!project) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-12 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold">Projeto não encontrado</h3>
        <p className="text-muted-foreground mb-4">
          O projeto solicitado não existe ou você não tem permissão para acessá-lo.
        </p>
        <Button asChild>
          <Link to="/app/projects">Voltar para Projetos</Link>
        </Button>
      </div>
    </div>
  );
}
```

---

### Arquivo 2: `src/components/dashboard/DashboardView.tsx`

**Mudanças:**
- Adicionar tratamento para projeto sem planilha configurada
- Melhorar feedback quando não há sheets

```tsx
// Adicionar ANTES do check de mappings (linha 237)
// Check if project has spreadsheet configured
if (!project?.spreadsheet_id) {
  return (
    <div className="container py-12 text-center">
      <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
        <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Planilha Não Configurada</h3>
      <p className="text-muted-foreground max-w-sm mx-auto">
        Você ainda não selecionou uma planilha do Google. Vá para a etapa "Planilha" para configurar.
      </p>
    </div>
  );
}

// Check if sheets are selected
if (sheetNames.length === 0) {
  return (
    <div className="container py-12 text-center">
      <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
        <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Abas Não Selecionadas</h3>
      <p className="text-muted-foreground max-w-sm mx-auto">
        Você ainda não selecionou as abas da planilha. Vá para a etapa "Aba" para configurar.
      </p>
    </div>
  );
}
```

---

### Arquivo 3: `src/components/ErrorBoundary.tsx` (NOVO)

Criar um Error Boundary para capturar erros React:

```tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Algo deu errado</h2>
          <p className="text-muted-foreground mb-4 text-center max-w-md">
            Ocorreu um erro inesperado. Por favor, tente novamente.
          </p>
          <Button onClick={this.handleReset}>Recarregar Página</Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

### Arquivo 4: `src/pages/app/ProjectPreview.tsx` (uso do ErrorBoundary)

Envolver o DashboardView com ErrorBoundary:

```tsx
<main>
  <ErrorBoundary>
    <DashboardView projectId={id!} isPreview />
  </ErrorBoundary>
</main>
```

---

## Resumo das Mudanças

| Arquivo | Mudança |
|---------|---------|
| `src/pages/app/ProjectPreview.tsx` | Adicionar tratamento para projeto null + ErrorBoundary |
| `src/components/dashboard/DashboardView.tsx` | Adicionar checks para spreadsheet_id e sheetNames vazios |
| `src/components/ErrorBoundary.tsx` | Criar novo componente (NOVO) |

---

## Resultado Esperado

Após as correções:
1. **Preview de projeto sem planilha**: Mostra mensagem "Planilha Não Configurada"
2. **Preview de projeto sem abas**: Mostra mensagem "Abas Não Selecionadas"
3. **Preview de projeto inexistente**: Mostra mensagem "Projeto não encontrado" + botão voltar
4. **Erro inesperado no React**: Error Boundary captura e mostra opção de recarregar

---

## Sobre o Botão "Publicar"

O botão "Publicar" só aparece no **Step 5 (Compartilhar)** da configuração. Nos outros steps, o botão é "Próximo". Este é o comportamento esperado baseado no código:

```tsx
{currentStep < steps.length ? (
  <Button onClick={() => setCurrentStep(...)}>Próximo</Button>
) : (
  <Button onClick={handlePublish}>Publicar</Button>
)}
```

Se você precisa do botão "Publicar" visível em todos os steps, posso adicionar isso também.
