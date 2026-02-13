
# Match Center - Portal Completo da Partida

## Objetivo

Criar uma nova pagina `/match-center` que funciona como um portal completo e imersivo de uma partida, unificando video com eventos, analise tatica, estatisticas, graficos, chatbots de torcedores e galeria de clips -- tudo numa unica pagina.

## Base

O usuario enviou um arquivo `MatchCenter.tsx` com ~680 linhas que ja contem a estrutura base. Vamos usar esse arquivo como ponto de partida e aprimora-lo significativamente conforme solicitado.

## Melhorias sobre o arquivo enviado

### 1. Header/Topo elaborado com escudos grandes
- Escudos dos times maiores (80x80px) com bordas neon animadas
- Placar com tipografia gigante e gradientes das cores dos times
- Informacoes da partida (competicao, data, estadio) com icones
- Background com gradiente sutil entre as cores dos times

### 2. Player de video futurista
- Barra de progresso customizada com marcadores de eventos (bolinhas coloridas na timeline)
- Closed captions/legendas SRT sincronizadas sobre o video
- Controles estilizados com glassmorphism
- Eventos ao lado do video (layout side-by-side no desktop)
- Indicador de evento atual pulsando na timeline

### 3. Eventos com comentarios de IA (300 caracteres)
- Cada evento na timeline tera um comentario tatico gerado por IA
- Usar a edge function `arena-chatbot` existente para gerar comentarios via Lovable AI
- Comentarios serao gerados em lote ao carregar a pagina (se ainda nao existirem)
- Armazenados no campo `metadata.ai_comment` de cada evento
- Textos maiores e bem formatados na timeline

### 4. Galeria de clips com capas e comentarios
- Secao abaixo do video com grid de cards dos clips
- Cada card mostra: thumbnail/capa do clip, tipo do evento, minuto, comentario de IA
- Tipografia grande e legivel nos comentarios
- Click abre o clip no player principal

### 5. Secao de Analise Tatica e Dashboard
- Integrar componentes existentes: `TeamComparisonPanel`, `MatchStatsGrid`, `BestPlayerCard`
- Graficos de recharts: timeline de eventos acumulados, comparativo por tipo
- Cards de estatisticas (gols, chutes, faltas, escanteios, cartoes, defesas) por time
- Formacao e posse de bola quando disponivel

### 6. Forum de Torcedores com IA (2 chatbots)
- Reutilizar `TeamChatbotCard` existente
- Um chatbot para o time da casa, outro para o visitante
- Texto e audio (Web Speech API como fallback)
- Layout lado a lado no desktop
- Os chatbots ja usam o servidor local com fallback para Lovable AI

### 7. Rota e navegacao
- Nova rota `/match-center` no `App.tsx`
- Link na sidebar/navegacao

## Detalhes tecnicos

### Arquivos a criar
| Arquivo | Descricao |
|---------|-----------|
| `src/pages/MatchCenter.tsx` | Pagina principal (baseada no arquivo enviado, expandida) |
| `src/components/match-center/MatchCenterHeader.tsx` | Header elaborado com escudos e placar |
| `src/components/match-center/FuturisticVideoPlayer.tsx` | Player com legendas SRT e marcadores de eventos |
| `src/components/match-center/EventsFeed.tsx` | Timeline de eventos com comentarios de IA |
| `src/components/match-center/ClipsGallery.tsx` | Galeria de clips com capas e comentarios |
| `src/components/match-center/MatchAnalyticsSection.tsx` | Estatisticas e graficos integrados |
| `src/components/match-center/FanForumSection.tsx` | Secao dos 2 chatbots de torcedores |
| `supabase/functions/generate-event-comments/index.ts` | Edge function para gerar comentarios de IA para eventos |

### Arquivos a editar
| Arquivo | Alteracao |
|---------|-----------|
| `src/App.tsx` | Adicionar rota `/match-center` |
| `src/components/layout/Sidebar.tsx` | Adicionar link para Match Center |
| `src/components/layout/BottomNav.tsx` | Adicionar link no nav mobile |
| `supabase/config.toml` | Registrar nova edge function |

### Edge function: `generate-event-comments`
- Recebe `match_id` e lista de eventos sem comentario
- Para cada evento, gera um comentario tatico de 300 caracteres via Lovable AI (`google/gemini-3-flash-preview`)
- Salva o comentario em `match_events.metadata.ai_comment`
- Retorna os comentarios gerados
- Trata erros 429 e 402

### Legendas SRT no video
- Buscar SRT do servidor local via `apiClient`
- Parsear blocos SRT com timestamps
- Exibir legenda atual como overlay no video sincronizado com `currentTime`
- Estilo: fundo semi-transparente, texto branco, posicao inferior

### Layout da pagina (de cima para baixo)
1. **Header**: escudos + placar + info da partida (full width)
2. **Video + Eventos**: grid 7/5 -- video a esquerda, timeline de eventos a direita
3. **Momentos Importantes**: strip horizontal com thumbnails dos highlights
4. **Galeria de Clips**: grid 3-4 colunas com capas, comentarios formatados
5. **Analise Tatica**: tabs com resumo, times, MVP + graficos comparativos
6. **Estatisticas**: grid de cards com numeros por time (home x away)
7. **Forum de Torcedores**: 2 chatbots lado a lado com IA + voz

### Dependencias existentes utilizadas
- `recharts` para graficos
- `useMatchSelection`, `useMatchEvents`, `useMatchAnalysis` para dados
- `TeamChatbotCard` para chatbots
- `useDynamicMatchStats` para estatisticas
- `useEventBasedAnalysis` para analise derivada
- `useClipGeneration` para geracao de clips
- `useThumbnailGeneration` para capas

## Resultado esperado

Uma pagina unica e imersiva estilo portal esportivo profissional, onde o usuario tem acesso a tudo sobre uma partida: video com legendas, eventos comentados por IA, clips com capas, analise tatica completa, estatisticas com graficos, e forum interativo com dois chatbots representando cada time.
