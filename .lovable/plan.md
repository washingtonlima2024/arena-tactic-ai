

# Separar Fases Completas para 1T e 2T (Tempo + Acrescimos + Prorrogacao)

## Estrutura Desejada

```text
--- 1o TEMPO (0-45') ---
  eventos...
--- ACRESCIMOS 1T (45+') ---
  eventos...
--- PRORROGACAO 1T ---
  eventos...
========= INTERVALO =========
--- 2o TEMPO (45-90') ---
  eventos...
--- ACRESCIMOS 2T (90+') ---
  eventos...
--- PRORROGACAO 2T ---
  eventos...
```

Cada fase mostra o placar cumulativo (gols somados de todas as fases anteriores).

## Alteracoes

### 1. `src/lib/matchPhases.ts` - Separar Prorrogacao em 1T e 2T

- Alterar o tipo `PhaseLabel` para incluir `'Prorrogacao 1T'` e `'Prorrogacao 2T'` em vez de um unico `'Prorrogacao'`
- Atualizar `PHASE_ORDER` para a sequencia completa: `1o Tempo > Acrescimos 1T > Prorrogacao 1T > Intervalo > 2o Tempo > Acrescimos 2T > Prorrogacao 2T`
- Atualizar `getEventPhase()` para classificar corretamente:
  - Minutos 45-50 ou half=first + min>45: Acrescimos 1T
  - Minutos 90-95 ou half=second + min>90 e <=120: Acrescimos 2T
  - Half=first + min>50 (ou flag extra_time): Prorrogacao 1T
  - Min>120: Prorrogacao 2T
- Atualizar `groupEventsByPhase()` para sempre inserir um grupo "Intervalo" (sem eventos, so visual) entre as fases do 1T e 2T, mesmo que vazio

### 2. `src/components/match-center/EventsFeed.tsx` - Estilo do Intervalo

- Renderizar o grupo "Intervalo" como um separador visual diferenciado (mais grosso, com icone de relogio, sem placar pois nao ha gols no intervalo)
- Manter o estilo atual para as demais fases (linha + badge + placar cumulativo)

### 3. `src/components/match-center/ClipsGallery.tsx` - Mesmo tratamento

- Aplicar a mesma logica de intervalo visual diferenciado
- Clips agrupados nas novas fases separadas

### Arquivos a Modificar

1. **`src/lib/matchPhases.ts`** - Tipos, ordem de fases, logica de classificacao, intervalo obrigatorio
2. **`src/components/match-center/EventsFeed.tsx`** - Renderizacao do intervalo diferenciado
3. **`src/components/match-center/ClipsGallery.tsx`** - Renderizacao do intervalo diferenciado

