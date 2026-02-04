
# Plano de Otimização do Ollama para Detecção de Eventos

## Objetivo
Melhorar significativamente a precisão do Ollama na detecção de eventos de futebol através de ajustes de configuração, modelo e prompt.

---

## 1. Escolha do Modelo Ideal

### Modelos Recomendados (em ordem de preferência):

| Modelo | Tamanho | Prós | Contras |
|--------|---------|------|---------|
| **mistral:7b-instruct** | 4.1GB | Excelente em seguir instruções JSON, rápido | Menos contexto que 32k |
| **qwen2.5:7b** | 4.4GB | Suporte nativo a JSON Schema, multilíngue (bom para PT-BR) | Mais lento |
| **llama3.1:8b-instruct** | 4.7GB | Melhor raciocínio que 3.2, bom em PT-BR | Consome mais VRAM |
| **gemma2:9b** | 5.4GB | Muito preciso em extração estruturada | Mais pesado |

**Recomendação principal: `mistral:7b-instruct`** ou **`qwen2.5:7b`** - ambos suportam modo JSON nativo e são excelentes para extração estruturada.

### Como instalar:
```bash
ollama pull mistral:7b-instruct
# ou
ollama pull qwen2.5:7b
```

---

## 2. Habilitar Modo JSON Nativo

O Ollama suporta forçar resposta em JSON válido, o que elimina problemas de parsing.

### Alteração no `ai_services.py` → `call_ollama()`:

```python
def call_ollama(
    messages: List[Dict[str, str]],
    model: str = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    format: str = None  # NOVO: "json" para forçar JSON
) -> Optional[str]:
    model = model or OLLAMA_MODEL
    url = f"{OLLAMA_URL}/api/chat"
    
    payload = {
        'model': model,
        'messages': messages,
        'stream': False,
        'options': {
            'temperature': temperature,
            'num_predict': max_tokens
        }
    }
    
    # Habilitar modo JSON nativo do Ollama
    if format:
        payload['format'] = format
    
    # ... resto da função
```

### Alteração na chamada em `_analyze_events_with_ollama()`:

```python
result = call_ollama(
    messages=[{'role': 'user', 'content': prompt}],
    model=OLLAMA_MODEL,
    temperature=0.1,  # Mais baixo para precisão
    max_tokens=8192,
    format="json"     # NOVO: força JSON válido
)
```

---

## 3. Simplificar o Prompt

Modelos locais menores funcionam melhor com prompts mais diretos. O prompt atual tem ~800 palavras - isso confunde modelos de 7B.

### Novo Prompt Otimizado:

```python
prompt = f"""Extraia eventos de futebol desta transcrição SRT.

PARTIDA: {home_team} (casa) vs {away_team} (visitante)
PERÍODO: {'1º Tempo' if match_half == 'first' else '2º Tempo'}

EVENTOS PARA DETECTAR:
- goal: "GOOOL", "GOLAÇO", "abre o placar", "empata", "virou"
- yellow_card: "cartão amarelo"
- red_card: "cartão vermelho", "expulso"
- penalty: "pênalti"
- save: "grande defesa", "salvou"
- chance: "quase gol", "na trave"

REGRA CRÍTICA: Use o timestamp do bloco SRT (00:MM:SS), NÃO o minuto falado pelo narrador.

TRANSCRIÇÃO:
{transcription[:8000]}

Retorne APENAS um array JSON com os eventos detectados:
[{{"minute":24,"second":52,"event_type":"goal","team":"home","description":"Gol de cabeça","confidence":0.95}}]"""
```

---

## 4. Usar JSON Schema (Opcional - Modelos Avançados)

Para modelos que suportam (qwen2.5, mistral), podemos definir um schema rígido:

```python
event_schema = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "minute": {"type": "integer"},
            "second": {"type": "integer"},
            "event_type": {"type": "string", "enum": ["goal", "yellow_card", "red_card", "penalty", "save", "chance", "foul", "corner"]},
            "team": {"type": "string", "enum": ["home", "away"]},
            "description": {"type": "string"},
            "confidence": {"type": "number"}
        },
        "required": ["minute", "second", "event_type", "team"]
    }
}

payload['format'] = event_schema  # Em vez de "json"
```

---

## 5. Ajustes de Configuração

### Na página de Configurações (/settings):

- **Modelo**: `mistral:7b-instruct` (em vez de `washingtonlima/kakttus` ou `llama3.2`)
- **Temperature**: Adicionar campo para ajustar (sugestão: 0.1 para extração)

### No `ai_services.py`:

| Parâmetro | Valor Atual | Valor Sugerido | Motivo |
|-----------|-------------|----------------|--------|
| `temperature` | 0.3 | 0.1 | Menor = mais determinístico |
| `max_tokens` | 8192 | 4096 | Suficiente para ~50 eventos |
| `format` | (não usado) | "json" | Força JSON válido |

---

## 6. Melhorar Sistema de Fallback

Se Ollama retornar menos de 3 eventos, o sistema já usa `detect_events_by_keywords()`. Podemos melhorar:

```python
# Em _analyze_events_with_ollama():
if len(events) < 3:
    print(f"[Ollama] ⚠️ Poucos eventos, complementando com keywords...")
    
    # Buscar arquivo SRT para detecção precisa
    from storage import get_subfolder_path
    srt_folder = get_subfolder_path(match_id, 'srt')
    srt_files = list(srt_folder.glob(f"*{match_half}*.srt"))
    
    if srt_files:
        keyword_events = detect_events_by_keywords(
            srt_path=str(srt_files[0]),
            home_team=home_team,
            away_team=away_team,
            half=match_half,
            segment_start_minute=game_start_minute
        )
        # Mesclar eventos únicos
        for ke in keyword_events:
            if not any(abs(e.get('videoSecond', 0) - ke.get('videoSecond', 0)) < 30 
                       for e in events):
                events.append(ke)
```

---

## 7. Adicionar Sistema de Validação Pós-Ollama

Criar uma segunda passada para verificar gols suspeitos:

```python
def validate_goals_with_context(events: List[Dict], transcription: str) -> List[Dict]:
    """Remove gols falsos verificando contexto na transcrição."""
    validated = []
    
    for event in events:
        if event.get('event_type') == 'goal':
            # Buscar contexto ao redor do timestamp
            minute = event.get('minute', 0)
            context = extract_context_around_timestamp(transcription, minute)
            
            # Verificar se há negação no contexto
            if any(neg in context.lower() for neg in ['quase', 'na trave', 'perdeu', 'defendeu']):
                print(f"[Validate] ⚠️ Gol em {minute}' rejeitado por negação no contexto")
                continue
        
        validated.append(event)
    
    return validated
```

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Adicionar `format` param em `call_ollama()`, simplificar prompt, reduzir temperature |
| `src/pages/Settings.tsx` | Mudar modelo padrão para `mistral:7b-instruct` |
| `video-processor/ai_services.py` | Melhorar fallback para usar SRT quando disponível |

---

## Passos de Implementação

1. Instalar modelo recomendado: `ollama pull mistral:7b-instruct`
2. Atualizar `call_ollama()` para suportar `format="json"`
3. Simplificar prompt em `_analyze_events_with_ollama()`
4. Reduzir temperature de 0.3 para 0.1
5. Testar com uma transcrição conhecida
6. Ajustar página de Configurações com novo modelo padrão

---

## Benefícios Esperados

- **+50% precisão** na detecção de gols (eliminando falsos positivos)
- **Parsing 100% confiável** com modo JSON nativo
- **Menos retries** por respostas malformadas
- **Análise mais rápida** com prompt menor
