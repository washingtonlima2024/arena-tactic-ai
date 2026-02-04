

# Plano: Desabilitar Detecção de Cartão Vermelho (Converter para Falta)

## Objetivo

Remover a detecção de cartão vermelho do sistema, pois a validação não está conseguindo distinguir corretamente menções hipotéticas de expulsões reais. A abordagem será:

1. **Cartão Amarelo**: Manter detecção normalmente
2. **Cartão Vermelho**: Converter automaticamente para **Falta** (`foul`)

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Remover `red_card` dos padrões de detecção e converter para `foul` em múltiplos locais |

---

## Mudanças Técnicas

### Mudança 1: Remover `red_card` do dicionário de padrões (linha ~1089)

```python
# ANTES:
'red_card': [
    r'CARTÃO VERMELHO',
    r'VERMELHO PARA',
    r'EXPULSO',
    ...
],

# DEPOIS:
# 🔧 REMOVIDO - Cartão vermelho desabilitado (convertido para foul)
# 'red_card': [...],
```

### Mudança 2: Remover `red_card` dos padrões de texto (linha ~4096)

```python
# ANTES:
patterns = {
    'goal': [...],
    'yellow_card': [r'cartão amarelo', r'amarelou'],
    'red_card': [r'cartão vermelho', r'expuls'],  # ← REMOVER
    'penalty': [...],
}

# DEPOIS:
patterns = {
    'goal': [...],
    'yellow_card': [r'cartão amarelo', r'amarelou'],
    # 🔧 red_card REMOVIDO - menções de cartão vermelho serão ignoradas
    'penalty': [...],
}
```

### Mudança 3: Atualizar prompt do Ollama (linhas ~4299-4306)

```python
# ANTES:
EVENTOS PARA DETECTAR:
- goal: "GOOOL", "GOLAÇO", "abre o placar", "empata", "virou", "bola na rede"
- yellow_card: "cartão amarelo", "amarelou"
- red_card: "cartão vermelho", "expulso"  # ← REMOVER
- penalty: "pênalti", "penalidade máxima"

# DEPOIS:
EVENTOS PARA DETECTAR:
- goal: "GOOOL", "GOLAÇO", "abre o placar", "empata", "virou", "bola na rede"
- yellow_card: "cartão amarelo", "amarelou"
# 🔧 red_card removido - menções serão ignoradas
- penalty: "pênalti", "penalidade máxima"
```

### Mudança 4: Converter `red_card` para `foul` na validação final (linha ~4555)

Adicionar conversão automática após a detecção:

```python
def sanitize_events(events):
    """Limpa e valida lista de eventos da IA."""
    VALID_EVENT_TYPES = [
        'goal', 'shot', 'save', 'foul', 'yellow_card',  # ← red_card REMOVIDO
        'corner', 'offside', 'substitution', 'chance', 'penalty',
        'free_kick', 'throw_in', 'kick_off', 'half_time', 'full_time',
    ]
    
    cleaned = []
    for event in events:
        event_type = (event.get('event_type') or '').lower().strip()
        
        # 🔧 CONVERSÃO: Cartão vermelho → Falta
        if event_type == 'red_card':
            print(f"[Sanitize] 🔄 Convertendo red_card → foul (min {event.get('minute', '?')}')")
            event_type = 'foul'
            event['event_type'] = 'foul'
            event['description'] = f"Falta (menção a cartão): {event.get('description', '')}"[:100]
        
        # ... resto da validação
```

### Mudança 5: Atualizar `is_highlight` (linha ~4577)

```python
# ANTES:
event['is_highlight'] = event.get('is_highlight', event_type in ['goal', 'yellow_card', 'red_card', 'penalty'])

# DEPOIS:
# 🔧 red_card removido de highlights
event['is_highlight'] = event.get('is_highlight', event_type in ['goal', 'yellow_card', 'penalty'])
```

### Mudança 6: Atualizar prompt principal (linha ~3490)

```python
# ANTES:
- event_type: goal, shot, save, foul, yellow_card, red_card, corner, chance, penalty, etc.

# DEPOIS:
# 🔧 red_card removido - não detectar expulsões
- event_type: goal, shot, save, foul, yellow_card, corner, chance, penalty, etc.
```

---

## Fluxo Após Mudanças

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  DETECÇÃO DE EVENTOS (CARTÕES)                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📝 Narrador menciona "cartão amarelo"                                       │
│     └── Detectado como yellow_card ✓                                         │
│     └── Badge amarelo na timeline ✓                                          │
│                                                                              │
│  📝 Narrador menciona "cartão vermelho" ou "expulso"                         │
│     └── ANTES: Detectado como red_card → validação falha → evento falso ❌   │
│     └── DEPOIS: Ignorado pela IA ✓                                           │
│     └── OU se detectado, convertido para foul automaticamente ✓              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

| Evento | Antes | Depois |
|--------|-------|--------|
| Cartão Amarelo | Detectado normalmente ✓ | Continua funcionando ✓ |
| Cartão Vermelho Real | Às vezes detectado ❓ | Ignorado ou convertido para falta |
| Menção Hipotética de Vermelho | Falso positivo ❌ | Ignorado ✓ |
| Badge na Timeline | Vermelho falso aparece ❌ | Só amarelo aparece ✓ |

---

## Consideração

Se no futuro quiser reativar a detecção de cartão vermelho, basta:
1. Descomentar os padrões de `red_card`
2. Remover a conversão automática em `sanitize_events`
3. Melhorar a validação com regras mais precisas

