

# Correção de Encoding Quebrado + Deploy de Edge Functions

## Problema 1: Encoding quebrado na Etapa 2 (Conexão)

O arquivo `src/components/sheets/SheetTabSelector.tsx` tem caracteres UTF-8 corrompidos em 6 locais. Caracteres como `ã`, `é`, `ç` foram substituídos por `�` (replacement character).

**Locais afetados:**
- Linha 84: `Perp�tua` e `Distribui��o` → `Perpétua` e `Distribuição`
- Linha 114: `visualiza��o` → `visualização`
- Linha 116: `Perp�tua + Distribui��o` → `Perpétua + Distribuição`
- Linha 122: `vis�o Perp�tua` → `visão Perpétua`
- Linha 140: `Distribui��o` → `Distribuição`
- Linha 162: `Sele��o` → `Seleção`

Também no `src/pages/app/ProjectConfig.tsx`:
- Linha 1: remover BOM character (`﻿`)
- Linha 434: `â€¢` → `•` (bullet corrompido)

## Problema 2: Deploy de Edge Functions falhando

O arquivo `.github/workflows/deploy-functions.yml` só deploia 2 funções (`meta-auth` e `meta-api`), mas o projeto tem 5:
- `google-sheets`
- `validate-share-token`
- `create-share-token`
- `payment-attribution`

As funções mais recentes não estão no workflow, então qualquer push que altere essas funções dispara o workflow mas não as deploia.

**Correção:** Adicionar os 4 deploys faltantes ao workflow, respeitando a configuração de `verify_jwt` do `config.toml`.

## Sequência de Execução

1. Reescrever `SheetTabSelector.tsx` com encoding UTF-8 correto
2. Corrigir BOM e bullet em `ProjectConfig.tsx` (linha 1 e 434)
3. Atualizar `.github/workflows/deploy-functions.yml` para incluir todas as 6 funções
4. Deploy imediato da `payment-attribution` (já feito anteriormente, mas garantir que está ativo)

## Detalhes Técnicos

### SheetTabSelector.tsx - Strings corrigidas:
```
Linha 84:  'Escolha uma aba para Perpétua e outra para Distribuição.'
Linha 114: 'Escolha qual aba alimenta cada visualização do dashboard:'
Linha 116: 'Perpétua + Distribuição'
Linha 122: 'Aba da visão Perpétua'
Linha 140: 'Aba da Distribuição'
Linha 162: 'Confirmar Seleção'
```

### ProjectConfig.tsx - Correções:
```
Linha 1:   Remover BOM (﻿) do início do arquivo
Linha 434: Trocar â€¢ por •
```

### deploy-functions.yml - Adicionar steps:
```yaml
- name: Deploy google-sheets
  run: supabase functions deploy google-sheets --project-ref $PROJECT_ID --no-verify-jwt

- name: Deploy validate-share-token
  run: supabase functions deploy validate-share-token --project-ref $PROJECT_ID --no-verify-jwt

- name: Deploy create-share-token
  run: supabase functions deploy create-share-token --project-ref $PROJECT_ID --no-verify-jwt

- name: Deploy payment-attribution
  run: supabase functions deploy payment-attribution --project-ref $PROJECT_ID --no-verify-jwt
```

