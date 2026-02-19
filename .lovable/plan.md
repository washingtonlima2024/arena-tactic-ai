

# Plano Arena Play - Correções Implementadas

## ✅ Corrigido: Importação do 2T Apaga Eventos do 1T

**Problema:** Ao importar apenas o 2T, o pipeline re-analisava e apagava eventos do 1T.

**Solução:** Adicionadas flags `should_analyze_first` e `should_analyze_second` baseadas em `video_paths` no pipeline async (`server.py`). Agora só deleta/re-analisa tempos cujo vídeo foi efetivamente enviado nesta importação.

## ✅ Corrigido: Sobreposição do 2T sobre o 1T

**Problema:** Eventos do 2T apareciam com minutos 0-45 em vez de 45-90.

**Solução:** Corrigido `_enrich_events` em `ai_services.py` para aplicar offset `game_start_minute` quando a IA retorna minutos relativos ao SRT. Pipeline async não re-aplica offset manualmente.
