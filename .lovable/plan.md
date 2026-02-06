
# Reformulacao Completa da Pagina de Analise Tatica

## Visao Geral

A pagina de Analise sera reestruturada para oferecer uma experiencia profissional de analise de jogo, com dados reais extraidos dos eventos da partida. A proposta inclui: resumo executivo do jogo, comparativo detalhado entre os dois times, melhor jogador em campo, mapa de calor funcional com animacao de leitura do jogo, e estatisticas completas organizadas de forma visual.

---

## Estrutura da Nova Pagina

A pagina sera organizada em secoes verticais claras, substituindo a estrutura de abas atual por um layout de "relatorio completo":

```text
+------------------------------------------+
|  CABECALHO (Placar + Info da Partida)    |
+------------------------------------------+
|  RESUMO EXECUTIVO DO JOGO                |
|  (Texto narrativo gerado dos eventos)    |
+------------------------------------------+
|  COMPARATIVO DE TIMES (lado a lado)      |
|  Gols | Chutes | Defesas | Faltas | etc  |
+------------------------------------------+
|  MELHOR JOGADOR EM CAMPO                 |
|  (Card destacado com estatisticas)       |
+------------------------------------------+
|  MAPA DE CALOR ANIMADO                   |
|  (Replay dos eventos no campo com timer) |
+------------------------------------------+
|  RESUMO TATICO                           |
|  (Formacao, posse, padroes)              |
+------------------------------------------+
|  ESTATISTICAS DETALHADAS                 |
|  (Grid completo de todas as metricas)    |
+------------------------------------------+
|  TIMELINE DE EVENTOS PRINCIPAIS          |
|  (Com clips reais do jogo)               |
+------------------------------------------+
```

---

## Detalhamento das Secoes

### 1. Cabecalho Reformulado
- Escudos dos times (logos) com cores primarias
- Placar grande e centralizado
- Competicao, data, local
- Total de eventos detectados
- Status do jogo (ao vivo/finalizado/analisado)

### 2. Resumo Executivo
- Texto narrativo completo gerado a partir dos eventos reais
- Menciona resultado, destaques, momentos decisivos
- Sem emojis, sem markdown - texto limpo e profissional
- Extraido do `eventAnalysis.matchSummary` ja existente, porem enriquecido com mais detalhes dos eventos

### 3. Comparativo de Times (Reformulado)
- Layout visual lado a lado com barras proporcionais
- Metricas incluidas:
  - Gols
  - Finalizacoes (total e no alvo)
  - Posse de Bola estimada
  - Defesas
  - Faltas
  - Cartoes Amarelos
  - Cartoes Vermelhos  
  - Escanteios
  - Impedimentos
  - Recuperacoes de Bola
  - Jogadas Taticas (transicoes, pressing)
- Todas calculadas via `useDynamicMatchStats` (dados reais)

### 4. Melhor Jogador em Campo
- Card destacado com gradiente
- Selecao automatica baseada em eventos: jogador com mais participacoes em gols, assistencias, defesas decisivas
- Extraido da analise de `standoutPlayers` e enriquecido com contagem de eventos por jogador
- Se nenhum jogador identificado nos metadados, a secao nao aparece (sem dados ficticios)

### 5. Mapa de Calor com Animacao de Leitura do Jogo
- Usa o `Heatmap2D` ja existente como base
- Adiciona um "modo replay": os eventos aparecem sequencialmente no campo conforme um timer avanca
- Cada evento pisca no campo na posicao correspondente
- Controles de play/pause/velocidade
- Timer mostrando o minuto atual da partida
- Os eventos que tem `clip_url` mostram um indicador clicavel para ver o video real
- Legenda indicando cor de cada time

### 6. Resumo Tatico
- Formacoes dos times (badges)
- Posse de bola com barra visual
- Padroes taticos identificados (pressing, transicoes, esquemas defensivos/ofensivos)
- Texto de overview tatico do `eventAnalysis.tacticalOverview`

### 7. Estatisticas Detalhadas
- Grid responsivo com cards pequenos
- Cada card mostra: icone + label + valor Casa vs Visitante
- Inclui TODAS as metricas disponiveis:
  - Gols, Chutes, Chutes no alvo, Defesas
  - Faltas, Cartoes amarelos, Cartoes vermelhos
  - Escanteios, Impedimentos, Substituicoes
  - Recuperacoes, Jogadas taticas
  - Eventos totais, aprovados, pendentes

### 8. Timeline de Eventos com Clips Reais
- Lista cronologica dos eventos principais
- Cada evento mostra: minuto, tipo (badge colorido), descricao, time
- Se tem thumbnail, exibe a miniatura
- Se tem clip_url, botao para assistir o video real da jogada
- Filtro por tipo de evento e por time

---

## Detalhes Tecnicos

### Arquivos a criar:
1. **`src/components/analysis/MatchReplayHeatmap.tsx`** - Componente do mapa de calor com animacao de replay dos eventos (timer, play/pause, eventos sequenciais no campo)
2. **`src/components/analysis/TeamComparisonPanel.tsx`** - Painel comparativo detalhado dos dois times
3. **`src/components/analysis/BestPlayerCard.tsx`** - Card do melhor jogador baseado em eventos reais
4. **`src/components/analysis/MatchStatsGrid.tsx`** - Grid completo de estatisticas detalhadas
5. **`src/components/analysis/EventTimeline.tsx`** - Timeline cronologica com clips reais

### Arquivos a modificar:
1. **`src/pages/Analysis.tsx`** - Reestruturacao completa do layout para usar os novos componentes
2. **`src/hooks/useEventBasedAnalysis.ts`** - Enriquecer com calculo do melhor jogador e mais metricas detalhadas

### Fontes de dados (todas reais):
- `useMatchEvents(matchId)` - eventos reais da partida
- `useDynamicMatchStats(events)` - estatisticas calculadas dos eventos
- `useEventBasedAnalysis(events)` - analise tatica e insights
- `useEventHeatZones(events)` - zonas de calor baseadas em eventos
- `useMatchAnalysis(matchId)` - analise de IA (resumo, formacoes)

### Regras importantes:
- Zero dados ficticios - tudo vem dos eventos reais
- Se uma secao nao tem dados, ela nao aparece (sem placeholders com dados inventados)
- Textos sem emojis, sem asteriscos, sem markdown
- Layout responsivo (mobile e desktop)
- Animacoes suaves com as classes ja existentes (animate-fade-in, etc)

---

## Animacao do Mapa de Calor (Replay)

O componente `MatchReplayHeatmap` tera:

- Um slider de tempo (0 a 90 minutos)
- Botoes de Play/Pause e velocidade (1x, 2x, 4x)
- Ao dar play, o timer avanca e os eventos aparecem no campo SVG na posicao correspondente
- Cada evento aparece como um circulo pulsante com a cor do time
- Eventos antigos ficam como manchas de calor (opacity reduzida)
- O tipo do evento e mostrado como tooltip ou badge junto ao ponto
- Eventos com clip_url mostram um icone de video clicavel

Isso cria a sensacao de "assistir o jogo no campo tatico" baseado nos eventos reais detectados pela IA.
