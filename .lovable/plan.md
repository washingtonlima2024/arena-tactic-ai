

# Plano: Alinhar Tempos de Clip para 20s Antes / 10s Depois

## Contexto

Quando uma palavra-chave é detectada no SRT/transcrição, o **evento já aconteceu** - o narrador está descrevendo algo que ocorreu segundos antes. A lógica correta é:

```text
  ← 20 segundos →  🎯  ← 10 segundos →
       ANTES      EVENTO    DEPOIS
```

- **20s antes**: Capturar o contexto e o lance que levou ao evento
- **10s depois**: Capturar a comemoração/resultado

## Estado Atual

| Local | `pre_buffer` | `post_buffer` | Total |
|-------|--------------|---------------|-------|
| `ai_services.py` (`ensure_clip_window`) | 20s | 10s | 30s ✅ |
| `server.py` (`EVENT_CLIP_CONFIG`) | 15s | 15s | 30s ❌ |

O problema: `EVENT_CLIP_CONFIG` no `server.py` (que é realmente usado para extrair os clips) está com valores simétricos.

## Mudanças Necessárias

### Arquivo: `video-processor/server.py`

Atualizar `EVENT_CLIP_CONFIG` (linhas 444-487) de:
```python
'goal': {
    'pre_buffer': 15,         # ← Mudar
    'post_buffer': 15,        # ← Mudar
    ...
}
```

Para:
```python
'goal': {
    'pre_buffer': 20,         # 20s antes (captura o lance)
    'post_buffer': 10,        # 10s depois (comemoração)
    ...
}
```

### Configuração Final

| Tipo de Evento | Antes | Depois | Total | Justificativa |
|----------------|-------|--------|-------|---------------|
| `goal` | 20s | 10s | 30s | Capturar jogada completa |
| `penalty` | 20s | 10s | 30s | Falta + cobrança |
| `red_card` | 20s | 10s | 30s | Falta + expulsão |
| `shot_on_target` | 15s | 10s | 25s | Jogada + defesa |
| `save` | 15s | 10s | 25s | Finalização + defesa |
| `yellow_card` | 15s | 10s | 25s | Falta + cartão |
| `default` | 20s | 10s | 30s | Padrão assimétrico |

**Importante**: Para manter clips de ~30s, gols usam 20+10. Para eventos menores, 15+10=25s é suficiente.

## Fluxo de Extração (Confirmado)

```text
1. Evento detectado → minute=5, second=30, event_type='goal'
2. get_event_clip_timings('goal') retorna:
   - pre_buffer: 20
   - post_buffer: 10
3. total_seconds = 330 (5*60 + 30)
4. start_seconds = 330 - 20 = 310
5. duration = 20 + 10 = 30
6. FFmpeg extrai de 310s a 340s ✅
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/server.py` | Atualizar `EVENT_CLIP_CONFIG` com novos valores |

## Resultado Esperado

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Janela de gol | Simétrica (15+15) | Assimétrica (20+10) |
| Início do clip | Perde contexto do lance | Captura jogada completa |
| Final do clip | Muito pós-evento | Termina após comemoração |
| Sincronia narrador | Inconsistente | Compensada |

