

# Correção da Detecção de Gol Contra

## Problema Identificado

Após analisar o arquivo `ai_services-3.py` enviado e comparar com o código do frontend, identifiquei uma **inconsistência** na lógica de detecção de gol contra:

| Local | Lógica Atual | Problema |
|-------|--------------|----------|
| Backend (linha 1444) | `'contra' in window_text` | Muito simples - detecta "contra-ataque" como gol contra |
| Backend (linha 4602) | Lista completa de keywords | Correta, mas só aplica no auto-fix posterior |
| Frontend (`useDynamicMatchStats`) | `metadata?.isOwnGoal === true` | Correta, mas depende do backend ter salvado |
| Frontend (`scoreSync.ts`) | Verifica metadata + descrição | Correta e robusta |

O gol do **Sport x Novorizontino** não está sendo calculado corretamente porque:
1. O backend não salvou `isOwnGoal: true` no metadata do evento
2. A descrição do evento pode não conter as keywords esperadas ("gol contra", "próprio gol")

## Solução em Duas Frentes

### 1. Melhorar Keywords de Detecção no Frontend

Atualizar `useDynamicMatchStats.ts` e `scoreSync.ts` para usar as **mesmas keywords** do backend:

```typescript
const own_goal_keywords = [
  'gol contra', 
  'próprio gol', 
  'mandou contra', 
  'own goal', 
  'autogol',
  'contra o próprio'  // adicional
];

const isOwnGoal = 
  metadata?.isOwnGoal === true ||
  own_goal_keywords.some(kw => description.includes(kw));
```

### 2. Sincronizar com o Backend (já implementado)

O checkbox "Gol Contra" no `EventEditDialog` já funciona corretamente. Ao marcar:
- Salva `metadata.isOwnGoal = true`
- Chama `syncMatchScoreFromEvents()` que recalcula o placar

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useDynamicMatchStats.ts` | Usar lista expandida de keywords para detectar own goal |
| `src/lib/scoreSync.ts` | Usar mesma lista de keywords para consistência |

## Detalhes Técnicos

### useDynamicMatchStats.ts - Linha 100-104

**Antes:**
```typescript
const isOwnGoal = 
  metadata?.isOwnGoal === true ||
  description.includes('contra') ||
  description.includes('own goal') ||
  description.includes('gol contra');
```

**Depois:**
```typescript
// Keywords alinhadas com backend (ai_services.py linha 4602)
const ownGoalKeywords = [
  'gol contra', 
  'próprio gol', 
  'mandou contra', 
  'own goal', 
  'autogol',
  'contra o próprio',
  'próprio patrimônio'  // expressão regional
];

const isOwnGoal = 
  metadata?.isOwnGoal === true ||
  ownGoalKeywords.some(kw => description.includes(kw));
```

### scoreSync.ts - Linha 90-94

Aplicar a mesma correção para manter paridade.

## Fluxo de Correção do Placar

1. Usuário vai em Eventos do jogo Sport x Novorizontino
2. Clica no gol incorretamente atribuído
3. Marca o checkbox "Gol Contra"
4. Salva
5. Sistema recalcula: `Sport` marcou gol contra → ponto vai para `Novorizontino`
6. Placar atualiza automaticamente

## Benefícios

- Keywords de gol contra sincronizadas entre backend e frontend
- Menos falsos positivos (não detecta "contra-ataque")
- Correção manual permanece disponível via checkbox
- Retrocompatibilidade mantida

