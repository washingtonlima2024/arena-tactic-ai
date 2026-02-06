

# Reestruturacao Completa da Pagina de Analise Tatica

## Objetivo

Transformar a pagina de Analise em um relatorio tatico profissional e detalhado, com 7 secoes distintas que cobrem todos os aspectos do jogo. A principal novidade e a geracao de um relatorio completo pela IA com analise por tempo, avaliacao individual dos times, analise tatica profunda e resumo final com recomendacoes.

---

## Estrutura Final da Pagina

```text
+------------------------------------------+
|  1. VISAO GERAL DA PARTIDA               |
|  (Placar, competicao, cenario inicial)    |
+------------------------------------------+
|  2. LINHA DO TEMPO DE EVENTOS             |
|  (Momentos principais com clips e         |
|   analise curta de cada evento)           |
+------------------------------------------+
|  3. PRIMEIRO TEMPO                        |
|  (Posicionamento, construcao, erros,      |
|   intensidade, transicoes)                |
+------------------------------------------+
|  4. SEGUNDO TEMPO                         |
|  (Ajustes taticos, mudancas de ritmo,     |
|   momentos decisivos)                     |
+------------------------------------------+
|  5. ANALISE INDIVIDUAL DOS TIMES          |
|  (Bloco casa + bloco visitante:           |
|   fortalezas, fragilidades, sincronia)    |
+------------------------------------------+
|  6. ANALISE TATICA COMPLETA               |
|  (Fases do jogo, padronizacoes,           |
|   bola parada, marcacao, sequencias)      |
+------------------------------------------+
|  7. RESUMO FINAL                          |
|  (Melhores pontos, falhas, correcoes,     |
|   fatores que influenciaram o placar)     |
+------------------------------------------+
|  COMPARATIVO DE ESTATISTICAS              |
|  (Barras visuais lado a lado)             |
+------------------------------------------+
|  MELHOR JOGADOR EM CAMPO                  |
+------------------------------------------+
|  MAPA DE CALOR - REPLAY DO JOGO           |
+------------------------------------------+
|  ESTATISTICAS DETALHADAS (Grid)           |
+------------------------------------------+
```

---

## O Que Sera Feito

### 1. Nova Edge Function: generate-match-report

Funcao backend que recebe todos os eventos e estatisticas da partida e envia para a IA (google/gemini-2.5-flash via Lovable AI gateway) com um prompt detalhado pedindo:

- Secao 1: Visao geral da partida (contexto, adversario, competicao, cenario inicial)
- Secao 2: Resumo dos eventos principais com analise curta de cada momento
- Secao 3: Analise do primeiro tempo (posicionamento, construcao desde a defesa, ocupacao de espaco, intensidade com e sem bola, transicoes, erros recorrentes)
- Secao 4: Analise do segundo tempo (ajustes taticos, entrada de novos jogadores, mudanca de ritmo, padroes de ataque e recomposicao, momentos de pressao, situacoes que decidiram o resultado)
- Secao 5: Analise individual dos times (time principal: comportamento coletivo, sincronia entre setores, fortalezas, fragilidades, melhorias entre tempos; adversario: como marcou, como atacou, pontos de dificuldade, movimentos repetidos)
- Secao 6: Analise tatica completa (fases do jogo, padronizacoes, modelo de jogo, bola parada, marcacao, sequencias repetitivas)
- Secao 7: Resumo final (melhores pontos, maiores falhas, o que corrigir no proximo treino, o que funcionou, fatores que influenciaram o placar)

O formato de resposta sera JSON com cada secao separada, permitindo renderizar cada uma individualmente na interface.

Modelo: google/gemini-2.5-flash (bom equilibrio entre custo e qualidade)
Max tokens: 4096 (relatorio detalhado)
Temperatura: 0.7

### 2. Novo Hook: useMatchReport

Hook React que gerencia:
- Chamada a edge function generate-match-report
- Estado de loading enquanto a IA processa
- Cache do resultado com React Query
- Funcao para gerar/regenerar o relatorio
- Armazena o relatorio gerado em estado local

### 3. Novo Componente: TacticalReportSection

Componente que renderiza cada secao do relatorio da IA como um card estilizado com:
- Titulo da secao (ex: "Primeiro Tempo", "Analise Tatica Completa")
- Icone correspondente
- Texto do relatorio em paragrafos limpos
- Animacao de fade-in
- Se a secao nao tem conteudo, nao aparece

### 4. Pagina Analysis.tsx Reformulada

A pagina sera reorganizada para seguir a estrutura de 7 secoes do relatorio:
- Cabecalho com placar e info (ja existe, manter)
- Botao "Gerar Relatorio Tatico com IA" que dispara a geracao
- As 7 secoes do relatorio IA aparecem em sequencia
- Abaixo do relatorio, mantem os componentes existentes: comparativo, melhor jogador, mapa de calor, grid de stats, timeline
- Se o relatorio ainda nao foi gerado, mostra o resumo local como fallback

### 5. Enriquecimento do useEventBasedAnalysis

O hook local sera expandido para gerar summaries mais detalhados por tempo (primeiro e segundo tempo), servindo como fallback quando o relatorio IA nao foi gerado.

---

## Detalhes Tecnicos

### Arquivos a criar:
1. `supabase/functions/generate-match-report/index.ts` - Edge function com prompt detalhado para as 7 secoes
2. `src/hooks/useMatchReport.ts` - Hook para gerenciar a geracao do relatorio
3. `src/components/analysis/TacticalReportSection.tsx` - Componente para renderizar cada secao do relatorio

### Arquivos a modificar:
1. `src/pages/Analysis.tsx` - Adicionar botao de gerar relatorio e renderizar as 7 secoes
2. `src/hooks/useEventBasedAnalysis.ts` - Expandir summaries locais com analise por tempo
3. `supabase/config.toml` - Adicionar configuracao da nova edge function

### Formato do JSON retornado pela IA:
```text
{
  "visaoGeral": "texto...",
  "linhaDoTempo": "texto...",
  "primeiroTempo": "texto...",
  "segundoTempo": "texto...",
  "analiseIndividual": {
    "timePrincipal": "texto...",
    "adversario": "texto..."
  },
  "analiseTatica": "texto...",
  "resumoFinal": "texto..."
}
```

### Dados enviados para a IA:
- Nomes dos times, placar, competicao, data, local
- Lista completa de eventos (tipo, minuto, descricao, time, jogador)
- Estatisticas calculadas (finalizacoes, faltas, cartoes, escanteios, posse, defesas, etc.)
- Melhor jogador calculado
- Padroes taticos identificados
- Eventos separados por tempo (primeiro e segundo)

### Regras do texto:
- Sem emojis, sem asteriscos, sem markdown
- Portugues brasileiro com terminologia de futebol
- Detalhado mas objetivo
- Paragrafos claros por tema
- Baseado exclusivamente nos dados reais dos eventos

### Dependencias:
- Usa LOVABLE_API_KEY ja configurada
- Usa o mesmo gateway de IA do arena-chatbot (ai.gateway.lovable.dev)
- Nenhuma dependencia nova necessaria

