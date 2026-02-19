

# Corrigir Falsos Gols no 2o Tempo e Desbloquear Pipeline de Importacao

## Problema

Ao importar o segundo tempo de Brasil vs Argentina, dois problemas ocorrem:

1. **Pipeline bloqueado**: O frontend (Upload.tsx linha 1724-1734) aborta silenciosamente se nao existe um arquivo SRT pre-carregado para o 2o tempo, impedindo que o servidor faca a transcricao automatica via Whisper.

2. **Gols falsos no 2o tempo**: A narracao do 2o tempo naturalmente faz referencias a gols do 1o tempo ("Coutinho abriu o placar", "com o gol do Neymar o Brasil ja vencia"). A IA interpreta essas mencoes como gols novos, gerando eventos duplicados. Resultado: Brasil 7x2 em vez de 3x0.

## Evidencia no Banco

Match `9d0f3f27`: 2 gols do 1o tempo (Coutinho min 35, Neymar min 45) + 2 gols duplicados no 2o tempo (Coutinho e Neymar ambos min 45 com match_half=second) = placar inflado.

Match `677801c3`: So tem 2 eventos (ambos second half), mas as descricoes sao identicas aos gols do 1o tempo.

## Solucao

### Mudanca 1 - Remover bloqueio de SRT no pipeline async (Upload.tsx)

**Arquivo**: `src/pages/Upload.tsx` (linhas 1724-1734)

Remover o `return` que aborta o pipeline. O servidor Python transcreve automaticamente via Whisper quando nao recebe SRT.

```text
// ANTES: aborta completamente
if (secondHalfSegments.length > 0 && !secondHalfTranscription) {
  setProcessingStage('idle');
  return;  // BLOQUEIA
}

// DEPOIS: apenas log informativo
if (secondHalfSegments.length > 0 && !secondHalfTranscription) {
  console.log('[ASYNC] 2o tempo sem SRT pre-carregado, servidor transcreverá via Whisper');
}
```

### Mudanca 2 - Pipeline sequencial tenta Whisper em vez de pular (Upload.tsx)

**Arquivo**: `src/pages/Upload.tsx` (linhas 2248-2261)

Em vez de mostrar toast e ignorar o 2o tempo, tentar transcrever automaticamente antes de analisar.

### Mudanca 3 - Deduplicar gols entre tempos no backend (ai_services.py)

**Arquivo**: `video-processor/ai_services.py` (funcao `_enrich_events`)

Adicionar deduplicacao cross-half: antes de salvar eventos do 2o tempo, consultar eventos existentes do 1o tempo no banco. Se um gol do 2o tempo tiver descricao muito similar (>80% de similaridade) a um gol ja existente do 1o tempo, descartar como falso positivo.

```text
# Na funcao _enrich_events ou no endpoint de analise:
if half == 'second' and match_id:
    # Buscar gols existentes do 1o tempo
    existing_goals = get_first_half_goals(match_id)
    
    # Filtrar gols do 2o tempo que sao duplicatas de descricoes do 1T
    new_events = []
    for event in events:
        if event['event_type'] == 'goal':
            is_duplicate = any(
                similarity(event['description'], eg['description']) > 0.7
                for eg in existing_goals
            )
            if is_duplicate:
                print(f"[Enrich] Gol falso removido (duplicata do 1T): {event['description']}")
                continue
        new_events.append(event)
```

### Mudanca 4 - Melhorar prompt do 2o tempo com contexto do 1T (ai_services.py)

**Arquivo**: `video-processor/ai_services.py` (funcao `analyze_match_events`)

Quando analisar o 2o tempo, incluir no prompt um resumo dos gols ja detectados no 1o tempo, instruindo a IA a **nao** re-detectar esses gols:

```text
# Adicionar ao prompt de analise do 2T:
"IMPORTANTE: Os seguintes gols ja foram detectados no 1o tempo e NAO devem ser 
contados novamente, mesmo que o narrador os mencione como referencia:
- Min 24': Gol de Coutinho (Brasil)
- Min 45': Gol de Neymar (Brasil)
Detecte APENAS gols NOVOS que acontecem durante o 2o tempo."
```

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| src/pages/Upload.tsx | Remover bloqueio de SRT (linhas 1724-1734) e ajustar pipeline sequencial (linhas 2248-2261) |
| video-processor/ai_services.py | Deduplicacao cross-half + prompt com contexto do 1T |

## Resultado Esperado

| Cenario | Antes | Depois |
|---|---|---|
| Importar 2o tempo sem SRT | Aborta silenciosamente | Servidor transcreve via Whisper |
| Gols mencionados do 1T na narracao do 2T | Re-detectados como gols novos (falsos) | Filtrados por deduplicacao e prompt contextual |
| Placar Brasil vs Argentina | 7x2 (inflado) | 3x0 (correto: Coutinho, Neymar 1T + Paulinho 2T) |
| Pipeline sequencial sem SRT | Pula analise do 2T | Tenta Whisper automaticamente |

