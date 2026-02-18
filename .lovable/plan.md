

# Remover Dependencia do Google e Tratar Erro 429

## Problema

O modo "Analise Visual" (vision) envia frames do video para a API do Google Gemini no backend Python. Quando ha muitas requisicoes, o Google retorna erro 429 (rate limit), e o frontend nao trata isso de forma amigavel.

## Solucao

### 1. Detectar e tratar erro 429 no frontend com retry automatico

**Arquivo: `src/hooks/useMatchAnalysis.ts`**

- No `analyzeWithTranscription`, ao capturar erros, verificar se a mensagem contem "429" ou "rate limit"
- Implementar 1 retry automatico com delay de 5 segundos antes de falhar
- Atualizar a mensagem de progresso para informar o usuario: "Rate limit atingido. Aguardando 5s..."
- Se retry tambem falhar, retornar erro claro sugerindo usar modo Texto

### 2. Tratar erro 429 no handleReprocess

**Arquivo: `src/pages/Matches.tsx`**

- No bloco catch da analise (linhas 517-524), detectar "429" na mensagem de erro
- Exibir toast especifico: "Limite de requisicoes do Google atingido. Tente novamente em 1-2 minutos ou use o modo Texto."

### 3. Adicionar aviso no dialog de reprocessamento

**Arquivo: `src/components/matches/ReprocessOptionsDialog.tsx`**

- Abaixo da opcao "Analise Visual (kakttus Pro)" (linha 236-239), adicionar uma nota de aviso:
  "Videos longos podem exceder o limite de requisicoes do Google. Se ocorrer erro 429, use o modo Texto."
- Alterar o default de `analysisMode` de `'vision'` para `'text'` (linha 73), ja que o modo texto usa Ollama local e nao depende do Google

### 4. Forcar modo texto como padrao

**Arquivo: `src/components/matches/ReprocessOptionsDialog.tsx`**

- Mudar o valor inicial de `analysisMode` de `'vision'` para `'text'` na linha 73
- Mover o badge "Recomendado" da opcao Vision para a opcao Texto

## Resumo das mudancas

| Arquivo | Mudanca |
|---|---|
| `src/hooks/useMatchAnalysis.ts` | Retry automatico com delay de 5s para erro 429 |
| `src/pages/Matches.tsx` | Toast especifico para rate limit no catch da analise |
| `src/components/matches/ReprocessOptionsDialog.tsx` | Default para modo texto + aviso sobre rate limit no modo vision |

Todas as mudancas sao no frontend. O backend Python continua funcionando normalmente - apenas o modo padrao sera texto (Ollama local) em vez de vision (Google).

