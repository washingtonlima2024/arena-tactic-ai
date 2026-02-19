

# Corrigir Tempo dos Eventos na Analise Inicial

## Problema

Na re-analise, os tempos dos eventos ficam corretos, mas na importacao inicial nao. A causa raiz esta em duas diferencas entre os fluxos:

1. **Re-analise usa o SRT original salvo** (com timestamps precisos como `00:05:04,000 --> 00:05:07,000`), que o backend consegue interpretar diretamente para calcular `calculate_game_minute`.

2. **Analise inicial (CASO 2 - jogo completo)** tenta pre-detectar boundaries via endpoint `detectBoundaries`, mas se esse endpoint nao existe no backend Python, o catch silencia o erro e a analise segue sem boundaries. Sem boundaries calibrados, o backend re-detecta internamente e pode calcular offsets incorretos.

3. **Analise inicial (CASO 3 - tempos separados, 2T)** na linha 2251 do Upload.tsx, a chamada `startAnalysis` nao passa `halfType`, forçando o default via `gameStartMinute >= 45`.

## Solucao

### Arquivo: `src/pages/Upload.tsx`

**Mudanca 1 - CASO 3: Adicionar `halfType: 'second'` explicitamente (linha ~2251):**
- Na chamada de `startAnalysis` para o segundo tempo separado (CASO 3), adicionar `halfType: 'second'` explicitamente em vez de depender do default

**Mudanca 2 - CASO 2: Melhorar fallback quando `detectBoundaries` falha:**
- Quando o endpoint de boundaries falha, criar boundaries estimados baseados na duracao do video (ex: `game_start_second: 0`, `half_time_second: duracao/2`, `game_end_second: duracao`)
- Isso garante que mesmo sem o endpoint, o backend recebe alguma referencia temporal

**Mudanca 3 - CASO 2: Log de diagnostico quando boundaries falham:**
- Adicionar toast informativo quando boundaries nao sao detectados para o usuario saber que a precisao pode ser menor

### Arquivo: `src/hooks/useAnalysisJob.ts`

**Mudanca 4 - Passar `boundaries` tambem na re-analise (consistencia):**
- Nenhuma mudanca necessaria - a re-analise ja funciona porque usa SRT com timestamps

### Resultado Esperado

Apos as mudancas:
- CASO 2 (jogo completo): Se `detectBoundaries` falhar, usara boundaries estimados em vez de nenhum
- CASO 3 (tempos separados): 2T passara `halfType: 'second'` explicitamente
- Re-analise: Sem mudanca (ja funciona)

## Detalhes Tecnicos

### Diferencas entre os fluxos:

| Aspecto | Analise Inicial | Re-analise |
|---|---|---|
| Transcricao | Whisper recente (pode ser texto puro) | SRT salvo no storage (com timestamps) |
| Boundaries | Tenta detectar via endpoint (pode falhar) | Nao envia (backend usa timestamps do SRT) |
| halfType | CASO 3/2T: nao passa explicitamente | Sempre passa `halfType: half` |

### Arquivos afetados:

| Arquivo | Mudanca |
|---|---|
| `src/pages/Upload.tsx` | Adicionar halfType explicito no CASO 3 + fallback de boundaries no CASO 2 |

### Impacto:

- CASO 1 (video curto): Sem mudanca
- CASO 2 (jogo completo): Boundaries estimados como fallback
- CASO 3 (tempos separados): halfType explicito no 2T
- Re-analise: Sem mudanca

