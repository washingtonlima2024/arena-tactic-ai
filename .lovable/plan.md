
# Auto-match de Times na Importacao Inteligente

## Problema Identificado

A IA extrai corretamente os nomes dos times (ex: "Sport", "CRB"), mas o formulario recebe `homeTeamId: ''` e `awayTeamId: ''` porque nenhuma logica de correspondencia (matching) entre os nomes extraidos e os times cadastrados no banco foi implementada.

No codigo atual (Upload.tsx, linha 2649-2655), ha um comentario "Try to match team names to existing teams" seguido de codigo que nao faz nada com os times.

## Solucao

### 1. Passar os nomes dos times extraidos pela IA para a callback

O `SmartImportCard` ja extrai `home_team` e `away_team` como texto, mas nao repassa esses nomes para o componente pai. Vamos incluir esses nomes no resultado.

**Arquivo:** `src/components/upload/SmartImportCard.tsx`

- Expandir a interface `MatchSetupData` ou passar os nomes como parametros extras na callback `onMatchInfoExtracted`
- Na funcao `handleConfirm`, incluir `extractionResult.home_team` e `extractionResult.away_team` como dados adicionais

### 2. Implementar logica de fuzzy matching de times

**Arquivo:** `src/pages/Upload.tsx` (callback `onMatchInfoExtracted`, linhas 2647-2658)

- Usar a lista `teams` (do hook `useTeams()`, ja disponivel na linha 217) para buscar correspondencias
- Implementar matching por:
  1. Nome exato (case-insensitive)
  2. Nome parcial (ex: "Sport" encontra "Sport Club do Recife")
  3. Short name (ex: "CRB" encontra time com short_name "CRB")
- Pre-preencher `homeTeamId` e `awayTeamId` com os IDs encontrados
- Se nao encontrar correspondencia, manter vazio (o usuario seleciona manualmente)

### 3. Preencher campos extras (venue, competition, date)

Atualmente o `extractedData` ja traz `competition`, `matchDate` e `venue`, e esses campos estao sendo preenchidos corretamente (como mostra a screenshot com "Serie B do Campeonato Brasileiro" e "07/02/2026"). O problema e exclusivamente dos times.

## Detalhes Tecnicos

```text
Fluxo atual:
  SmartImport extrai: { home_team: "Sport", away_team: "CRB" }
  handleConfirm cria: { homeTeamId: '', awayTeamId: '' }
  Upload recebe: matchData com IDs vazios
  MatchSetupCard: Select mostra "Selecione o time"

Fluxo corrigido:
  SmartImport extrai: { home_team: "Sport", away_team: "CRB" }
  handleConfirm cria: { homeTeamId: '', awayTeamId: '', _homeTeamName: "Sport", _awayTeamName: "CRB" }
  Upload recebe: faz matching "Sport" -> teams.find() -> ID do time
  Upload seta: { homeTeamId: "uuid-do-sport", awayTeamId: "uuid-do-crb" }
  MatchSetupCard: Select mostra "Sport" e "CRB" pre-selecionados
```

### Arquivos a modificar

1. **`src/components/upload/SmartImportCard.tsx`** - Repassar `home_team` e `away_team` como parametros extras na callback
2. **`src/pages/Upload.tsx`** - Implementar a logica de matching na callback `onMatchInfoExtracted` (linhas 2647-2658), usando a lista `teams` que ja esta disponivel no componente

### Funcao de matching (a ser adicionada no Upload.tsx)

A funcao compara nome extraido pela IA com:
- `team.name` (case-insensitive, trim)
- `team.short_name` (case-insensitive)
- Substring match (nome extraido contido no nome do time ou vice-versa)

Se encontrar exatamente um resultado, usa o ID. Se encontrar multiplos, usa o primeiro (melhor match).
