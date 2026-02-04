
# Plano: Corrigir Análise do Segundo Tempo (SRT Errado + Validação)

## Problema Identificado

A análise do segundo tempo gerou apenas 1 evento porque:

1. **SRT Errado no Fallback**: Quando o Ollama detecta menos de 3 eventos e aciona o fallback por keywords, o código usa **o primeiro SRT encontrado** sem verificar se corresponde ao tempo sendo analisado.

2. **Filtro de SRT por Glob**: O `glob('*.srt')` não garante ordem e pode retornar o SRT do primeiro tempo antes do segundo.

## Código Problemático

**Arquivo**: `video-processor/ai_services.py` (linhas 4453-4466)

```python
srt_folder = get_subfolder_path(match_id, 'srt')
srt_files = list(srt_folder.glob('*.srt')) if srt_folder.exists() else []

if srt_files:
    # ⚠️ PROBLEMA: Usa PRIMEIRO SRT encontrado independente do tempo!
    print(f"[Ollama] Usando SRT: {srt_files[0].name}")
    keyword_events = detect_events_by_keywords(
        srt_path=str(srt_files[0]),  # ← Pode ser o SRT errado!
        home_team=home_team,
        away_team=away_team,
        half=match_half,
        segment_start_minute=game_start_minute
    )
```

## Solução

### Mudança 1: Selecionar SRT Correto Baseado no Tempo

Modificar a lógica para filtrar o SRT pelo `match_half`:

```python
srt_folder = get_subfolder_path(match_id, 'srt')
srt_files = list(srt_folder.glob('*.srt')) if srt_folder.exists() else []

# 🔧 Filtrar SRT pelo tempo correto
target_srt = None
if srt_files:
    # Prioridade: arquivo específico do tempo
    srt_patterns = [
        f'{match_half}_half.srt',      # second_half.srt
        f'{match_half}_transcription.srt',  # second_transcription.srt
        f'{match_half}.srt',           # second.srt
    ]
    
    for pattern in srt_patterns:
        for srt_file in srt_files:
            if pattern in srt_file.name.lower():
                target_srt = srt_file
                break
        if target_srt:
            break
    
    # Fallback: usar qualquer SRT se só existe um
    if not target_srt and len(srt_files) == 1:
        target_srt = srt_files[0]

if target_srt:
    print(f"[Ollama] Usando SRT do {match_half}: {target_srt.name}")
    keyword_events = detect_events_by_keywords(
        srt_path=str(target_srt),
        home_team=home_team,
        away_team=away_team,
        half=match_half,
        segment_start_minute=game_start_minute
    )
else:
    print(f"[Ollama] SRT do {match_half} não encontrado, usando texto bruto...")
    keyword_events = detect_events_by_keywords_from_text(...)
```

### Mudança 2: Logs de Diagnóstico

Adicionar logs para identificar qual SRT está sendo usado:

```python
print(f"[Ollama] 📂 SRTs disponíveis: {[f.name for f in srt_files]}")
print(f"[Ollama] 🎯 Buscando SRT para tempo: {match_half}")
```

---

## Fluxo Corrigido

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  ANÁLISE DO SEGUNDO TEMPO (CORRIGIDO)                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Ollama analisa transcrição do 2º tempo                                   │
│     └── Detecta N eventos                                                    │
│                                                                              │
│  2. Validação pós-Ollama                                                     │
│     └── _validate_goals_with_context()                                       │
│     └── _validate_all_events_with_context()                                  │
│                                                                              │
│  3. Fallback (se N < 3 eventos)                                              │
│     ├── ANTES: Usava PRIMEIRO SRT encontrado (possivelmente 1º tempo) ❌     │
│     └── DEPOIS: Filtra por 'second_half.srt' ou similar ✓                    │
│                                                                              │
│  4. Merge + Deduplicate                                                      │
│     └── Eventos finais salvos                                                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Linha ~4454: Filtrar SRT pelo tempo (`match_half`) antes de usar no fallback |

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Fallback do 2º tempo | Usa `first_half.srt` se vier primeiro | Usa `second_half.srt` especificamente |
| SRTs múltiplos no diretório | Comportamento imprevisível | Seleção determinística por padrão de nome |
| Logs | Não indicava qual SRT usado | Mostra arquivos disponíveis e selecionado |

---

## Diagnóstico Adicional

Para verificar a causa exata, seria útil:

1. **Verificar logs do servidor Python** - procurar por:
   - `[Ollama] ⚠️ Poucos eventos` - confirma se fallback foi acionado
   - `[Ollama] Usando SRT:` - mostra qual arquivo foi usado
   - `[Validate] ⚠️` - mostra eventos rejeitados

2. **Verificar arquivos SRT no storage**:
   - `storage/{match_id}/srt/` - listar arquivos existentes

Se o problema persistir após esta correção, pode haver também uma questão na validação contextual que está rejeitando eventos válidos.
