

# Corrigir Deteccao Completa de Eventos (Alem de Gols)

## Analise do Anexo

O arquivo `analise_eventos.txt` identificou 5 problemas criticos que explicam porque apenas gols sao detectados corretamente:

1. **Cartoes desabilitados no EVENT_KEYWORDS** - `yellow_card` e `red_card` estao comentados (linhas 2242-2258)
2. **Filtro anti-times-externos muito agressivo** - `is_other_game_commentary` descarta eventos legitimos quando o narrador menciona outro time como referencia (ex: "veio do Flamengo")
3. **event_detector.py nao integrado** - O import falha silenciosamente e cai no fallback legado menos eficiente
4. **Keywords de cartoes desabilitadas na extracao de contexto** - `red_card` e `yellow_card` tambem estao comentados no mapa de keywords da funcao `extract_event_context` (linhas 1622-1626)
5. **Validacoes muito restritas** - `validate_card_event` e `validate_penalty_event` exigem contextos muito especificos

## Mudancas Tecnicas

**Arquivo unico**: `video-processor/ai_services.py`

### Mudanca 1: Descomentar cartoes no EVENT_KEYWORDS (linhas 2242-2258)

Reativar `yellow_card` e `red_card` no dicionario `EVENT_KEYWORDS`:

```python
'yellow_card': [
    r'CARTÃO AMARELO',
    r'AMARELO PARA',
    r'RECEBE O AMARELO',
    r'LEVA AMARELO',
    r'ESTÁ AMARELADO',
],
'red_card': [
    r'CARTÃO VERMELHO',
    r'VERMELHO PARA',
    r'EXPULSO',
    r'FOI EXPULSO',
    r'RECEBE O VERMELHO',
    r'LEVA VERMELHO',
],
```

### Mudanca 2: Descomentar cartoes no mapa de contexto (linhas 1622-1626)

Reativar keywords de cartoes na funcao `extract_event_context`:

```python
event_keywords = {
    'goal': ['gol', 'golaço', 'bola na rede', 'abre o placar', 'marca', 'gooool'],
    'red_card': ['vermelho', 'expuls', 'cartão vermelho', 'direto pro chuveiro'],
    'yellow_card': ['amarelo', 'cartão amarelo', 'amarelou', 'recebe amarelo'],
    'penalty': ['pênalti', 'penalidade', 'marca pênalti', 'penalty'],
    'save': ['defesa', 'salvou', 'espalmou', 'defendeu'],
}
```

### Mudanca 3: Suavizar filtro `is_other_game_commentary` para eventos nao-gol

O filtro atual descarta o evento inteiro se detectar qualquer time externo na janela de 5 blocos. Para eventos como cartoes e faltas, o time mencionado pode ser uma referencia biografica ("veio do Flamengo"). A correcao:

- **Gols**: Manter filtro rigoroso (como esta)
- **Outros eventos**: Aplicar filtro apenas se a frase explicitamente indicar "outro jogo" (`looks_like_other_game_commentary`), mas **nao** rejeitar por simples mencao de time externo

Na funcao `detect_events_by_keywords` (linha 2850), mudar:

```python
# ANTES: Rejeita qualquer evento se detectar time externo
if is_other_game_commentary(window_text, home_team, away_team):
    continue

# DEPOIS: Para nao-gol, usar apenas o filtro de frases explicitas
if event_type == 'goal':
    if is_other_game_commentary(window_text, home_team, away_team):
        continue
else:
    if looks_like_other_game_commentary(window_text.lower()):
        continue
```

### Mudanca 4: Adicionar tipos de evento faltantes ao EVENT_KEYWORDS

Adicionar `shot`, `offside`, `free_kick` e `substitution` que existem no `event_detector.py` mas faltam no `EVENT_KEYWORDS`:

```python
'shot': [
    r'CHUTOU',
    r'FINALIZOU',
    r'FINALIZAÇÃO',
    r'NA TRAVE',
    r'QUASE GOL',
    r'POR POUCO',
    r'PERDEU O GOL',
],
'offside': [
    r'IMPEDIMENTO',
    r'IMPEDIDO',
    r'POSIÇÃO IRREGULAR',
    r'BANDEIRA LEVANTADA',
],
'free_kick': [
    r'COBROU A FALTA',
    r'COBRANÇA DE FALTA',
    r'BATE A FALTA',
    r'COBRA A FALTA',
],
'substitution': [
    r'SUBSTITUIÇÃO',
    r'SAI .+ ENTRA',
    r'ENTRA .+ SAI',
],
```

Tambem remover o tipo `chance` do `EVENT_KEYWORDS` (ja e um tipo proibido conforme as regras do sistema) e mover seus patterns para `shot`:

```python
# REMOVER 'chance' e incorporar patterns relevantes em 'shot'
```

### Mudanca 5: Relaxar validacoes de cartoes e penaltis

Na validacao de cartoes (`validate_card_event`), aceitar com confianca mais baixa ao inves de rejeitar:

- Reduzir exigencia de contexto: se a keyword primaria for encontrada, aceitar com `confidence=0.7` mesmo sem contexto de confirmacao
- Manter rejeicao apenas para negacoes explicitas ("nao houve cartao", "recuou o cartao")

Na validacao de penaltis (`validate_penalty_event`):
- Aceitar com `confidence=0.7` se keyword primaria presente, sem exigir confirmacao

## Resumo de Impacto

| Problema | Causa | Correcao |
|----------|-------|----------|
| Cartoes nao detectados | Keywords comentadas | Descomentar yellow_card e red_card |
| Eventos descartados injustamente | Filtro anti-externo agressivo | Filtro brando para nao-gol |
| Poucos tipos detectados | Faltam shot, offside, etc | Adicionar ao EVENT_KEYWORDS |
| Contexto sem cartoes | Keywords de contexto comentadas | Descomentar no extract_event_context |
| Validacao rejeitando demais | Exigencias muito estritas | Aceitar com confianca menor |

- Nenhuma mudanca no frontend
- `event_detector.py` ja existe e sera usado quando o import funcionar; estas mudancas melhoram o fallback legado que roda quando ele nao esta disponivel
- Compativel com as correcoes de boundaries/pre-jogo ja aplicadas

