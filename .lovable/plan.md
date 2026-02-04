

# Plano: Corrigir Detecção de Cartões Vermelhos Falsos

## Problema Identificado

Dois cartões vermelhos estão sendo gerados **sem existir** na partida. Há **duas fontes** de eventos não validados:

| Fonte | Problema |
|-------|----------|
| **Ollama** (linhas 4152-4296) | Gera eventos de cartão diretos, mas só valida **gols** com `_validate_goals_with_context()` |
| **Keywords Texto** (linhas 3935-3999) | Detecta `cartão vermelho` e `expuls` **sem validação contextual** |

### Fluxo Atual

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  Ollama responde:                                                       │
│  [{"event_type":"red_card", "minute":15, ...}]  ← SEM VALIDAÇÃO!        │
│                                │                                        │
│                                ▼                                        │
│            _validate_goals_with_context()                               │
│            ├── Só valida GOLS                                           │
│            └── Cartões passam direto ❌                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Por Que Cartões Falsos Aparecem

O Ollama pode interpretar frases como:
- "poderia ter sido expulso" → detecta `red_card`
- "mereceu cartão vermelho" → detecta `red_card`
- "levou amarelo, poderia ser vermelho" → detecta `red_card`

Sem verificar contexto de **expulsão real** (jogador deixando o campo), eventos falsos são criados.

---

## Solução Proposta

### 1. Criar função de validação pós-Ollama para TODOS os eventos

Nova função `_validate_all_events_with_context()` que valida:
- **Cartões vermelhos**: Exigir contexto de expulsão real
- **Cartões amarelos**: Verificar se realmente foi dado
- **Pênaltis**: Validar intensidade e contexto

### 2. Adicionar validação em `detect_events_by_keywords_from_text()`

A função de texto bruto atualmente não valida cartões. Adicionar chamada a `validate_card_event()`.

---

## Mudanças Necessárias

### Arquivo: `video-processor/ai_services.py`

#### Mudança 1: Criar `_validate_all_events_with_context()` (nova função)

```python
def _validate_all_events_with_context(events: List[Dict], transcription: str, home_team: str, away_team: str) -> List[Dict]:
    """
    Validação pós-Ollama para TODOS os tipos de eventos.
    Remove eventos falsos verificando contexto na transcrição.
    """
    validated = []
    
    for event in events:
        event_type = event.get('event_type')
        minute = event.get('minute', 0)
        second = event.get('second', 0)
        
        # Extrair contexto
        context = _extract_context_around_timestamp(transcription, minute, second)
        
        # 1. Validar cartões vermelhos
        if event_type == 'red_card':
            validation = validate_card_event(context, context, 'red_card', home_team, away_team)
            if not validation['is_valid']:
                print(f"[Validate] ⚠️ Cartão vermelho {minute}' REJEITADO: {validation['reason']}")
                continue
        
        # 2. Validar cartões amarelos
        if event_type == 'yellow_card':
            validation = validate_card_event(context, context, 'yellow_card', home_team, away_team)
            if not validation['is_valid']:
                print(f"[Validate] ⚠️ Cartão amarelo {minute}' REJEITADO: {validation['reason']}")
                continue
        
        # 3. Validar pênaltis
        if event_type == 'penalty':
            validation = validate_penalty_event(context, context, home_team, away_team)
            if not validation['is_valid']:
                print(f"[Validate] ⚠️ Pênalti {minute}' REJEITADO: {validation['reason']}")
                continue
        
        validated.append(event)
    
    return validated
```

#### Mudança 2: Atualizar `_analyze_events_with_ollama()` (linha ~4296)

**Substituir**:
```python
events = _validate_goals_with_context(events, transcription)
```

**Por**:
```python
# Validar TODOS os eventos (gols, cartões, pênaltis)
events = _validate_goals_with_context(events, transcription)
events = _validate_all_events_with_context(events, transcription, home_team, away_team)
```

#### Mudança 3: Atualizar `detect_events_by_keywords_from_text()` (linhas 3944-3999)

Adicionar validação para cartões na seção de criação de eventos:

```python
# Após linha 3974 (antes de criar o evento):
# Validar cartões antes de adicionar
if event_type in ['red_card', 'yellow_card']:
    # Obter contexto ao redor
    context_start = max(0, keyword_pos - 200)
    context_end = min(len(transcription), keyword_pos + 200)
    context = transcription[context_start:context_end]
    
    validation = validate_card_event(match.group(), context, event_type, home_team, away_team)
    if not validation['is_valid']:
        print(f"[Keywords-Text] ⚠ {event_type} ignorado: {validation['reason']}")
        continue
```

---

## Resultado Esperado

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Validação de gols | ✓ Sim | ✓ Sim |
| Validação de cartões | ❌ Não | ✓ Sim |
| Validação de pênaltis | ❌ Não (Ollama) | ✓ Sim |
| Falsos positivos | Cartões sem expulsão | Rejeitados |

---

## Regras de Validação Existentes (já implementadas)

A função `validate_card_event()` (linhas 469-510) já tem regras robustas:

```python
# Para cartão vermelho:
has_expulsion = any(kw in window_text.lower() for kw in [
    'expuls', 'expulso', 'vermelho direto', 'fora de jogo', 
    'fora de campo', 'deixa o campo', 'vai embora'
])
if not has_expulsion:
    return {'is_valid': False, 'reason': 'no_expulsion_context'}
```

**O problema é que essa validação não estava sendo chamada para eventos do Ollama!**

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Nova função `_validate_all_events_with_context()` |
| `video-processor/ai_services.py` | Atualizar `_analyze_events_with_ollama()` para validar todos os eventos |
| `video-processor/ai_services.py` | Atualizar `detect_events_by_keywords_from_text()` para validar cartões |

