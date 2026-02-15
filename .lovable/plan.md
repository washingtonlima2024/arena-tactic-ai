

# Corrigir Deteccao de Nomes de Times e Download de Escudos na Importacao

## Problema

Durante a importacao inteligente (Smart Import), o sistema falha em dois pontos:

1. **Nomes dos times nao detectados**: A IA (Ollama ou Gemini) nao conseguiu extrair os nomes dos times da transcricao parcial (5 minutos), provavelmente porque:
   - A transcricao e muito curta e nao menciona nomes dos times nos primeiros 5 min
   - O endpoint `/api/extract-match-info` retornou `null` para `home_team` e `away_team`
   - Times genericos ("Time Casa" / "Time Visitante") foram criados

2. **Escudos nao baixados**: A funcao `autoFetchTeamLogo` busca em `football-logos.cc`, mas nomes genericos ou incorretos nao produzem resultados. Alem disso, o logo e buscado em background e pode falhar silenciosamente.

## Solucao

### 1. Melhorar o prompt de extracao no backend

**Arquivo: `video-processor/server.py`** (endpoint `/api/extract-match-info`)

- Adicionar instrucoes mais especificas no prompt para que a IA extraia nomes de times mesmo de mencoes indiretas (narrador falando sobre jogadores, torcida, etc.)
- Incluir exemplos no prompt para guiar a extracao
- Aumentar o trecho da transcricao usado (de 8000 para 12000 chars)

### 2. Adicionar fallback de deteccao por regex no backend

**Arquivo: `video-processor/server.py`** (endpoint `/api/extract-match-info`)

- Antes de chamar a IA, tentar detectar nomes de times via regex em padroes comuns:
  - "Time A x Time B", "Time A versus Time B", "Time A contra Time B"
  - "gol do [Time]", "posse do [Time]", "falta de [Time]"
- Se o regex encontrar nomes, incluir como dica no prompt da IA para aumentar a confianca

### 3. Melhorar o Smart Import para usar mais contexto

**Arquivo: `src/components/upload/SmartImportCard.tsx`**

- Quando a transcricao falha ou e muito curta, extrair nomes do **titulo/nome do arquivo** de forma mais robusta (ja existe `extractTeamsFromFilename`, mas os separadores podem ser melhorados)
- Adicionar suporte a mais padroes de nome: "time1-time2", "time1 - time2", etc.

### 4. Garantir download de escudo apos criacao do time

**Arquivo: `src/pages/Upload.tsx`** (callback do SmartImport)

- Apos criar os times automaticamente, chamar `autoFetchTeamLogo` explicitamente em vez de depender apenas do hook `onSuccess` do `useCreateTeam`
- Aguardar o resultado do logo antes de prosseguir, atualizando o time com o logo encontrado
- Adicionar log mais detalhado para diagnosticar falhas

### 5. Melhorar `extractTeamsFromFilename` com mais separadores

**Arquivo: `src/components/upload/SmartImportCard.tsx`**

- Adicionar separadores: `" - "`, `"-"`, `"_x_"`, `"_vs_"`
- Limpar prefixos de data/hora comuns: "2024-01-15_", "jogo_"
- Tratar nomes com acentos corretamente

### 6. Retry de logo com invalidacao de cache

**Arquivo: `src/hooks/useTeams.ts`**

- No `onSuccess` do `useCreateTeam`, adicionar um retry com delay (5s) caso o primeiro autoFetchTeamLogo falhe
- Invalidar o cache da query de teams apos logo ser atribuida

## Arquivos a Modificar

1. **`video-processor/server.py`** - Melhorar prompt do `/api/extract-match-info`; adicionar deteccao regex pre-IA
2. **`src/components/upload/SmartImportCard.tsx`** - Mais separadores no `extractTeamsFromFilename`
3. **`src/pages/Upload.tsx`** - Chamar `autoFetchTeamLogo` explicitamente apos criar times no Smart Import
4. **`src/hooks/useTeams.ts`** - Retry de logo fetch com delay

