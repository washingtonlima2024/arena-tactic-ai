

# Plano: Simplificar Extração de Contexto (Palavra-chave no Centro + Janela 40s)

## Problema Atual

A função `_extract_context_around_timestamp` tenta localizar contexto baseado no timestamp do evento:

```python
# Linha 513 - Busca padrões de timestamp
time_patterns = [
    rf'{minute:02d}:{second:02d}',  # ← Falha se formato diferente
    rf'{minute}:{second:02d}',
    rf'{minute}\s*minuto',
]
```

**Problema**: Se o padrão não for encontrado, o fallback usa uma estimativa imprecisa baseada na posição proporcional no texto. Isso resulta em contexto errado → validação falha → eventos falsos passam.

## Solução Proposta

Mudar a abordagem para:

1. **Palavra-chave no centro**: Quando o Ollama detecta um evento em determinado minuto, buscar a palavra-chave do evento no texto e centralizar ali
2. **Janela expandida**: 20 segundos para cada lado (~40s total = ~1000-1200 caracteres)
3. **Fallback simples**: Se não encontrar palavra-chave, usar janela de caracteres ao redor da posição estimada

---

## Mudanças Necessárias

### Arquivo: `video-processor/ai_services.py`

#### Mudança 1: Reescrever `_extract_context_around_timestamp()` (linha 513)

**Lógica Nova:**
```python
def _extract_context_around_timestamp(
    transcription: str, 
    minute: int, 
    second: int, 
    event_type: str = None,
    window_chars: int = 1000  # ~40 segundos = 20s cada lado
) -> str:
    """
    Extrai contexto centrado na palavra-chave do evento.
    
    Estratégia:
    1. Buscar palavra-chave do tipo de evento no texto
    2. Centralizar janela de 1000 chars (500 antes, 500 depois)
    3. Fallback: posição estimada se não encontrar keyword
    """
    
    # Mapa de keywords por tipo de evento
    event_keywords = {
        'goal': ['gol', 'golaço', 'bola na rede', 'abre o placar'],
        'red_card': ['vermelho', 'expuls', 'cartão vermelho'],
        'yellow_card': ['amarelo', 'cartão amarelo', 'amarelou'],
        'penalty': ['pênalti', 'penalidade'],
        'save': ['defesa', 'salvou', 'espalmou'],
    }
    
    # 1. Tentar encontrar keyword do evento
    keywords = event_keywords.get(event_type, [])
    
    for keyword in keywords:
        # Buscar todas as ocorrências
        pattern = re.escape(keyword)
        matches = list(re.finditer(pattern, transcription.lower()))
        
        if matches:
            # Usar a primeira ocorrência (ou a mais próxima do timestamp estimado)
            best_match = matches[0]
            center_pos = best_match.start()
            
            # Extrair janela centrada na keyword
            half_window = window_chars // 2
            start = max(0, center_pos - half_window)
            end = min(len(transcription), center_pos + half_window)
            
            return transcription[start:end]
    
    # 2. Fallback: posição estimada baseada no timestamp
    total_seconds = minute * 60 + second
    estimated_pos = int(len(transcription) * (total_seconds / (45 * 60)))
    
    half_window = window_chars // 2
    start = max(0, estimated_pos - half_window)
    end = min(len(transcription), estimated_pos + half_window)
    
    return transcription[start:end]
```

#### Mudança 2: Atualizar chamada em `_validate_all_events_with_context()` (linha 561)

**Antes:**
```python
context = _extract_context_around_timestamp(transcription, minute, second)
```

**Depois:**
```python
context = _extract_context_around_timestamp(
    transcription, minute, second, 
    event_type=event_type,  # Passar tipo para buscar keyword correta
    window_chars=1000       # 40 segundos = ~1000 chars
)
```

#### Mudança 3: Remover função duplicada (linha 4175)

A segunda definição de `_extract_context_around_timestamp` (linha 4175-4207) **sobrescreve a primeira** e deve ser **removida** para evitar conflito.

#### Mudança 4: Atualizar chamada em `_validate_goals_with_context()` (linha 4147)

**Antes:**
```python
context = _extract_context_around_timestamp(transcription, minute, second)
```

**Depois:**
```python
context = _extract_context_around_timestamp(
    transcription, minute, second,
    event_type='goal',
    window_chars=1000
)
```

---

## Fluxo Corrigido

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                      EXTRAÇÃO DE CONTEXTO (NOVO)                          │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Evento: red_card em 15'                                                  │
│                    │                                                      │
│                    ▼                                                      │
│  Buscar keywords: ['vermelho', 'expuls', 'cartão vermelho']               │
│                    │                                                      │
│                    ▼                                                      │
│  Encontrou "vermelho" na posição 12340?                                   │
│       ├── SIM → Extrair [11840...12840] (keyword no centro)               │
│       └── NÃO → Fallback: posição estimada                                │
│                    │                                                      │
│                    ▼                                                      │
│  Validar: contexto contém 'expuls'?                                       │
│       ├── SIM → Evento VÁLIDO ✓                                           │
│       └── NÃO → Evento REJEITADO ✗                                        │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Método | Busca timestamp exato | Busca keyword do evento |
| Janela | 30s (400 chars) | 40s (1000 chars) |
| Centro | Timestamp (impreciso) | Keyword (preciso) |
| Fallback | 500 chars iniciais | Posição proporcional |
| Funções duplicadas | 2 definições | 1 definição consolidada |

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Reescrever `_extract_context_around_timestamp` (linha 513) |
| `video-processor/ai_services.py` | Atualizar chamada em `_validate_all_events_with_context` (linha 561) |
| `video-processor/ai_services.py` | **Remover** função duplicada (linhas 4175-4207) |
| `video-processor/ai_services.py` | Atualizar chamada em `_validate_goals_with_context` (linha 4147) |

