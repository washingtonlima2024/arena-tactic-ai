# Filtro Anti-Times-Externos + Regras Avançadas para Eventos

**Status: ✅ IMPLEMENTADO**

## Resumo

Sistema de 3 camadas para filtrar falsos positivos na detecção de eventos:

### Camada 1: Filtro Global Anti-Times-Externos

Função `is_other_game_commentary()` detecta se o texto menciona times que NÃO estão jogando. Se mencionar time externo = comentário sobre outro jogo → evento rejeitado.

### Camada 2: Frases de "Outro Jogo"

Lista `OTHER_GAME_PHRASES` com frases que indicam comentário sobre outras partidas:
- "em outro jogo", "no outro jogo", "na outra partida"
- "placar parcial", "tabela", "classificação"
- "lá no maracanã", "lá no mineirão", etc.

### Camada 3: Regras Específicas por Tipo de Evento

| Evento | Validação |
|--------|-----------|
| **Gol** | Sliding window + `is_other_game_commentary()` + `window_goal_features()` |
| **Cartão** | `validate_card_event()` - exige nome de jogador, "expulso" para vermelho |
| **Pênalti** | `validate_penalty_event()` - exige intensidade, filtra "perdeu o pênalti" |
| **Falta/Escanteio** | Keyword simples (eventos frequentes demais) |

## Funções Implementadas

- `clean_text_for_analysis()` - Normaliza texto
- `count_goal_hits()` - Conta "gol" com padrão g[o]{1,8}l
- `intensity_score()` - Score de emoção na narração
- `looks_like_other_game_commentary()` - Detecta frases de outro jogo
- `detect_teams_in_text()` - Detecta times no texto
- `get_team_variants()` - Retorna aliases de um time
- `is_other_game_commentary()` - Filtro principal anti-times-externos
- `validate_card_event()` - Validação avançada de cartões
- `validate_penalty_event()` - Validação avançada de pênaltis
- `window_goal_features()` - Extrai features de janela para gols
- `build_goal_validator_prompt()` - Prompt para validação Ollama
- `validate_goal_with_ollama()` - Validação opcional via Ollama

## Integração

### `detect_goals_by_sliding_window()`
- Chama `is_other_game_commentary()` ANTES de aceitar gol
- Usa `window_goal_features()` para análise avançada
- Filtra gols com `other_game_phrase = True`

### `detect_events_by_keywords()`
- Obtém contexto de janela (2 blocos antes/depois)
- Chama `is_other_game_commentary()` para TODOS eventos
- Chama `validate_card_event()` para cartões
- Chama `validate_penalty_event()` para pênaltis

## Exemplo de Uso

**Partida:** Sport x Novorizontino

```
SRT: "Gol do Flamengo lá no Maracanã! 1 a 0 para o Mengão!"

1. detect_teams_in_text() → ["flamengo"]
2. get_team_variants("Sport") → {"sport", "leão", ...}
3. "flamengo" NOT IN valid_teams
4. is_other_game_commentary() → True
5. EVENTO REJEITADO ✓
```
