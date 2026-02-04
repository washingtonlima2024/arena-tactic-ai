
# Plano: Corrigir Validação de Contaminação e Adicionar Opção de Bypass

## Problema
A análise de transcrição está falhando com erro "CONTAMINAÇÃO DETECTADA" porque:
1. O narrador menciona outros times (Flamengo, Corinthians, seleções, etc.) em comentários
2. A busca por "Sport" ou "Novorizontino" pode estar falhando
3. O fluxo automático `handleProcessMatch` não passa `skipValidation`

## Solução Proposta

### 1. Ajustar Lógica de Validação no Backend (ai_services.py)

Mudar a lógica de contaminação para ser menos rigorosa:

```python
def validate_transcription_teams(...) -> Dict[str, Any]:
    # ...
    
    # NOVA LÓGICA: Só marca contaminação se:
    # 1. Nenhum dos times esperados foi encontrado E
    # 2. Mais de 5 times diferentes são mencionados (indica outra partida)
    # OU
    # 3. Nenhum time esperado E a transcrição menciona placar/gol com times específicos
    
    is_valid = home_found or away_found
    
    # Relaxar contaminação: só bloquear se muitos times estranhos
    has_severe_contamination = (
        not is_valid and 
        len(unexpected_teams) > 5  # Muitos times = provavelmente outra partida
    )
    
    return {
        'hasContamination': has_severe_contamination,  # Antes: qualquer time estranho
        # ...
    }
```

### 2. Adicionar Opção skipValidation no Fluxo Automático (Events.tsx)

Adicionar um checkbox ou opção para forçar análise:

```typescript
// Em handleProcessMatch, adicionar skipValidation baseado em preferência do usuário
await apiClient.analyzeMatch({
  // ... outros params
  skipValidation: forceAnalysis  // Nova variável de estado
});
```

### 3. Adicionar UI para Bypass de Validação (Events.tsx)

Adicionar um toggle ou opção no menu de processamento:

```tsx
<DropdownMenuItem onClick={() => setForceAnalysis(true)}>
  <AlertCircle className="mr-2 h-4 w-4" />
  Forçar Análise (ignorar validação)
</DropdownMenuItem>
```

### 4. Melhorar Detecção de "Sport" e Variantes

Adicionar variantes do nome do time:

```python
KNOWN_TEAMS = [
    # ...
    'sport', 'sport recife', 'sport club',  # Variantes
    'novorizontino', 'novo horizontino', 'tigre',  # Apelidos
    # ...
]
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Relaxar lógica de contaminação, adicionar variantes de times |
| `src/pages/Events.tsx` | Adicionar state `forceAnalysis` e passar para `analyzeMatch` |
| `src/pages/Events.tsx` | Adicionar opção de menu "Forçar Análise" |

---

## Implementação Detalhada

### ai_services.py - Relaxar Validação

```python
def validate_transcription_teams(
    transcription: str, 
    home_team: str, 
    away_team: str
) -> Dict[str, Any]:
    text_lower = transcription.lower()
    home_lower = home_team.lower()
    away_lower = away_team.lower()
    
    # Melhorar busca: incluir variantes e apelidos
    home_variants = [home_lower] + home_lower.split()
    away_variants = [away_lower] + away_lower.split()
    
    # Adicionar apelidos conhecidos
    TEAM_ALIASES = {
        'sport': ['sport recife', 'leão', 'rubro-negro'],
        'novorizontino': ['novo horizontino', 'tigre', 'novori'],
        # ... outros
    }
    
    home_variants.extend(TEAM_ALIASES.get(home_lower, []))
    away_variants.extend(TEAM_ALIASES.get(away_lower, []))
    
    home_found = any(
        variant in text_lower 
        for variant in home_variants 
        if len(variant) > 3
    )
    away_found = any(
        variant in text_lower 
        for variant in away_variants 
        if len(variant) > 3
    )
    
    detected_teams, _ = detect_teams_in_transcription(transcription)
    
    unexpected_teams = [
        t for t in detected_teams 
        if not any(v in t or t in v for v in home_variants + away_variants)
    ]
    
    is_valid = home_found or away_found
    
    # RELAXADO: Só contamina se MUITOS times estranhos e NENHUM esperado
    has_contamination = not is_valid and len(unexpected_teams) > 5
    
    return {
        'isValid': is_valid,
        'homeFound': home_found,
        'awayFound': away_found,
        'detectedTeams': detected_teams,
        'unexpectedTeams': unexpected_teams,
        'hasContamination': has_contamination,
        'warning': None if is_valid else f"Times esperados não encontrados"
    }
```

### Events.tsx - Adicionar Bypass

```typescript
// Novo state
const [forceAnalysis, setForceAnalysis] = useState(false);

// Em handleProcessMatch
await apiClient.analyzeMatch({
  matchId: currentMatchId,
  transcription: transcription.text,
  homeTeam,
  awayTeam,
  gameStartMinute: startMinute,
  gameEndMinute: endMinute,
  halfType: halfType as 'first' | 'second',
  autoClip: false,
  includeSubtitles: true,
  skipValidation: forceAnalysis  // NOVO
});

// No menu dropdown
<DropdownMenuCheckboxItem 
  checked={forceAnalysis}
  onCheckedChange={setForceAnalysis}
>
  Ignorar validação de times
</DropdownMenuCheckboxItem>
```

---

## Alternativa Rápida (Hotfix)

Se quiser uma correção imediata sem mudar a UI, podemos simplesmente mudar o threshold de contaminação de `len(unexpected_teams) > 0` para `len(unexpected_teams) > 5` no backend.

---

## Benefícios

- Narradores podem mencionar outros times em comentários sem bloquear análise
- Usuário tem opção de forçar análise quando necessário
- Reduz falsos positivos de contaminação
- Mantém proteção contra transcrições completamente erradas (muitos times diferentes)
