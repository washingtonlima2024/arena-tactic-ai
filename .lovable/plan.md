
# Status: ✅ IMPLEMENTADO

## Correções Aplicadas

### 1. ✅ Detecção de Time Melhorada (ai_services.py)
- `detect_team_from_text()` agora usa aliases do dicionário `TEAM_ALIASES`
- Matching mais robusto com palavras > 3 caracteres
- Remove duplicatas antes de verificar

### 2. ✅ Deduplicação Aprimorada (ai_services.py)
- `deduplicate_events()` com threshold de **60s** (antes: 30s)
- Considera **time** além do tipo de evento
- Logs detalhados para debug
- Fallback para `minute*60+second` quando `videoSecond` não existe

### 3. ✅ Deduplicação Cross-Half (server.py)
- Antes de salvar, verifica eventos existentes em **qualquer** half
- Ignora duplicatas do mesmo tipo+time dentro de ±2 minutos
- Log claro quando evento é ignorado

### 4. ✅ Score Attribution Seguro (server.py)
- Default mudou de `'home'` para `'unknown'`
- Não atribui gol ao mandante por default
- Usa aliases para inferir time da descrição
- Log detalhado de cada gol com team/description/isOwnGoal

### 5. ✅ Logs Detalhados
- Cada gol logado com contexto completo
- Deduplicação mostra eventos ignorados/substituídos
- Cross-half mostra quantos eventos existem antes de salvar

## Teste Recomendado

1. Deletar partida Brasil x Argentina existente
2. Reimportar vídeo com transcrição
3. Verificar logs do servidor para:
   - `[SCORE]` - atribuição de cada gol
   - `[DEDUP]` - eventos duplicados removidos
   - `[ANALYZE-MATCH]` - cross-half checks
4. Confirmar placar: Brasil 2 x 0 Argentina
5. Confirmar apenas 2 gols na timeline (sem repetições)
