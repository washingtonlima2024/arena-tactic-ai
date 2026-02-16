


# ✅ CORRIGIDO: Zero Eventos no Pipeline Kakttus

## Correções Aplicadas

### Bug 1: Fallback movido para FORA do `if events:` (ai_services.py)
- Adicionado `else: final_events = []` quando Kakttus retorna 0 eventos
- Bloco de fallback por keywords agora executa independentemente do resultado da IA
- Bloco de save/return também movido para fora, protegido com `if final_events:`
- `enriched_events` referenciado de forma segura no rejected_events

### Bug 2: Proteção contra transcrição parcial (server.py)
- Threshold mínimo de chars aumentado de 100 para 1000 em `_validate_storage_transcription`
- Transcrições do Smart Import (< 30k chars) agora salvas como `_partial.txt`
- Pipeline async não reutiliza transcrições parciais como completas

## Arquivos Modificados
1. `video-processor/ai_services.py` - Reestruturação do bloco Kakttus
2. `video-processor/server.py` - Proteção contra transcrição parcial
