

# Corrigir Tempo dos Eventos na Importacao Inicial

## Problema

Na importacao inicial de um video de **jogo completo** (CASO 2 no Upload.tsx), o sistema envia a **mesma transcricao inteira** para ambas as analises (1T e 2T). O backend precisa detectar os "boundaries" (limites de cada tempo) para saber qual trecho da transcricao corresponde a cada metade.

O problema e que na primeira analise (1T), os boundaries sao detectados e salvos. Mas na segunda analise (2T), o backend recebe a transcricao completa novamente e tenta re-detectar boundaries, o que pode resultar em offsets incorretos porque o contexto de "game_start_second" nao foi calibrado.

Na **re-analise**, os boundaries ja estao persistidos no `analysis_job.result.boundaries`, entao o calculo de `calculate_game_minute` e preciso.

## Solucao

Adicionar uma etapa de **pre-deteccao de boundaries** antes da analise, e passar os boundaries detectados como parametro para ambas as chamadas de analise. Isso garante que ambas usem os mesmos limites temporais calibrados.

### Arquivo: `src/pages/Upload.tsx`

**Mudanca 1 - Detectar boundaries antes da analise (CASO 2):**
- Antes de iniciar a analise do 1T (linha ~2068), chamar o endpoint `apiClient.detectBoundaries()` passando a transcricao completa
- Armazenar o resultado (game_start_second, half_time_second, etc.)

**Mudanca 2 - Passar boundaries para ambas as chamadas de startAnalysis:**
- Adicionar campo `boundaries` nos parametros da chamada `startAnalysis` para 1T e 2T
- O backend usara esses boundaries pre-calculados em vez de re-detectar

**Mudanca 3 - Dividir a transcricao antes de enviar ao 2T:**
- Usar o `half_time_second` detectado para cortar a transcricao pela metade
- Enviar apenas a segunda metade da transcricao para a analise do 2T
- Isso evita que o backend precise filtrar e reduz confusao na deteccao de eventos

### Arquivo: `src/hooks/useAnalysisJob.ts`

**Mudanca 4 - Suportar parametro `boundaries` no startAnalysis:**
- Adicionar campo opcional `boundaries` nos params
- Passa-lo para `apiClient.analyzeMatch()`

### Arquivo: `src/lib/apiClient.ts`

**Mudanca 5 - Adicionar metodo `detectBoundaries`:**
- Novo metodo que chama `POST /api/matches/{id}/detect-boundaries` no servidor Python
- Recebe transcricao, retorna boundaries (game_start_second, half_time_second, game_end_second)
- Adicionar campo `boundaries` no payload de `analyzeMatch`

## Detalhes Tecnicos

### Fluxo Atual (com bug):

```text
Transcricao Completa
    |
    +--> Analise 1T (0-45) --> Backend detecta boundaries pela 1a vez --> OK
    |
    +--> Analise 2T (45-90) --> Backend re-detecta boundaries --> ERRADO (offsets diferentes)
```

### Fluxo Corrigido:

```text
Transcricao Completa
    |
    v
Detectar Boundaries (1 chamada) --> Salva game_start, half_time, game_end
    |
    +--> Corta transcricao no half_time
    |
    +--> Analise 1T (0-45) + boundaries --> Backend usa boundaries fornecidos --> OK
    |
    +--> Analise 2T (45-90) + transcricao 2a metade + boundaries --> OK
```

### Arquivos afetados:

| Arquivo | Tipo de Mudanca |
|---|---|
| `src/pages/Upload.tsx` | Adicionar pre-deteccao de boundaries no CASO 2 |
| `src/hooks/useAnalysisJob.ts` | Suportar campo `boundaries` no startAnalysis |
| `src/lib/apiClient.ts` | Novo metodo detectBoundaries + campo boundaries em analyzeMatch |

### Impacto:

- CASO 1 (video curto): Sem mudanca (nao precisa de boundaries)
- CASO 2 (jogo completo dividido): Corrigido - boundaries pre-detectados
- CASO 3 (tempos separados): Sem mudanca (cada video tem sua propria transcricao)
- Re-analise: Sem mudanca (ja funciona corretamente)

