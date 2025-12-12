# Arena Play - Documentação Completa

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Stack Tecnológico](#stack-tecnológico)
4. [Módulos Principais](#módulos-principais)
5. [Banco de Dados](#banco-de-dados)
6. [Edge Functions](#edge-functions)
7. [Fluxos de Trabalho](#fluxos-de-trabalho)
8. [Integrações de IA](#integrações-de-ia)
9. [Guia de Uso](#guia-de-uso)
10. [API e Configurações](#api-e-configurações)

---

## Visão Geral

### O que é o Arena Play?

O **Arena Play** é uma plataforma integrada de análise esportiva construída sobre três pilares fundamentais:

1. **Visão Computacional**: Análise quadro a quadro de vídeos de partidas
2. **Inteligência Tática**: Machine learning para insights estratégicos
3. **Produção de Conteúdo**: Geração automática de mídia para redes sociais

### Propósito

O sistema analisa partidas de futebol para:
- Extrair eventos automaticamente (gols, faltas, cartões, etc.)
- Gerar relatórios táticos detalhados
- Criar dashboards interativos
- Produzir conteúdo de mídia (cortes, narração, podcasts)

### Ecossistema Kakttus

O Arena Play integra-se ao ecossistema Kakttus:
- **Arena Play** → Análise e detecção de eventos
- **Kakttus Studio** → Produção profissional de conteúdo
- **Kadrus Pipeline** → Distribuição e publicação

---

## Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  Pages: Landing │ Auth │ Index │ Upload │ Analysis │ Events    │
│         Matches │ Media │ Audio │ Live │ Settings               │
├─────────────────────────────────────────────────────────────────┤
│  Components: Tactical │ Media │ Upload │ Live │ Chatbot │ UI   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LOVABLE CLOUD (Backend)                       │
├─────────────────────────────────────────────────────────────────┤
│  Supabase: Database │ Storage │ Auth │ Realtime │ Edge Functions│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      INTEGRAÇÕES DE IA                           │
├─────────────────────────────────────────────────────────────────┤
│  Lovable AI (Gemini) │ OpenAI Whisper │ OpenAI TTS │ Vision AI  │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

```
Vídeo Upload → Extração de Áudio → Transcrição (Whisper)
                    │
                    ▼
            Análise Visual (Gemini Vision)
                    │
                    ▼
            Correlação de Eventos
                    │
                    ▼
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
 Eventos      Thumbnails      Clips/Cortes
    │               │               │
    ▼               ▼               ▼
 Database      Storage         Storage
```

---

## Stack Tecnológico

### Frontend
| Tecnologia | Uso |
|------------|-----|
| React 18 | Framework principal |
| TypeScript | Tipagem estática |
| Vite | Build tool |
| Tailwind CSS | Estilização |
| Shadcn/UI | Componentes UI |
| React Query | Gerenciamento de estado server |
| React Router | Navegação |
| Three.js | Visualizações 3D |
| Recharts | Gráficos |
| Framer Motion | Animações |

### Backend (Lovable Cloud)
| Tecnologia | Uso |
|------------|-----|
| Supabase | Backend-as-a-Service |
| PostgreSQL | Banco de dados |
| Edge Functions (Deno) | Lógica serverless |
| Storage Buckets | Armazenamento de arquivos |
| Realtime | Atualizações em tempo real |

### Integrações de IA
| Serviço | Uso |
|---------|-----|
| Lovable AI (Gemini 2.5 Flash) | Análise de vídeo, geração de texto |
| OpenAI Whisper | Transcrição de áudio |
| OpenAI TTS | Text-to-Speech para narração |
| Gemini Vision | Análise visual de frames |

---

## Módulos Principais

### 1. 🏠 Dashboard (Index)

**Localização**: `/src/pages/Index.tsx`

**Funcionalidades**:
- Cards de partidas recentes com dados reais
- Estatísticas do dashboard (total de partidas, analisadas, eventos)
- Heatmap 3D interativo (Three.js) mostrando posições de jogadores
- Campo tático animado com os 10 eventos mais recentes
- Preview de vídeo embutido nos cards de partidas

### 2. 📤 Upload de Vídeos

**Localização**: `/src/pages/Upload.tsx`

**Funcionalidades**:
- Upload de múltiplos segmentos de vídeo por partida
- Dropzones coloridos por tempo (azul: 1º Tempo, laranja: 2º Tempo)
- Configuração de tempos HH:MM:SS por segmento
- Detecção automática de duração para MP4
- Timeline de cobertura visual
- Suporte a links externos (YouTube, Twitch, HLS, Embed)
- Upload opcional de legendas (SRT/VTT)

**Componentes**:
- `HalfDropzone` - Área de drop por tempo
- `MatchSetupCard` - Configuração de times
- `VideoSegmentCard` - Card de segmento individual
- `MatchTimesConfig` - Configuração de tempos
- `CoverageTimeline` - Visualização de cobertura
- `SyncSlider` - Slider de sincronização
- `TimeInput` - Input de tempo HH:MM:SS

### 3. 🔍 Análise

**Localização**: `/src/pages/Analysis.tsx`

**Funcionalidades**:
- Progresso de análise em tempo real
- Visualização de eventos detectados
- Campo tático interativo com posições
- Heatmaps de jogadores e times
- Insights táticos gerados por IA
- Gráficos de estatísticas

**Componentes**:
- `AnalysisProgress` - Barra de progresso
- `AnalysisSummary` - Resumo da análise
- `FootballField` - Campo de futebol SVG
- `LiveTacticalField` - Campo com animações
- `Heatmap3D` - Visualização volumétrica
- `InsightCard` - Cards de insights
- `AnimatedTacticalPlay` - Animações táticas

### 4. 📅 Eventos

**Localização**: `/src/pages/Events.tsx`

**Funcionalidades**:
- Lista cronológica de eventos
- Edição de eventos (admin)
- Aprovação/rejeição de edições pendentes
- Player de vídeo no timestamp do evento
- Criação de novos eventos (admin)
- Filtros por tipo de evento

**Componentes**:
- `EventTimeline` - Timeline de eventos
- `EventEditDialog` - Modal de edição
- `VideoPlayerModal` - Player de vídeo

### 5. ⚽ Partidas

**Localização**: `/src/pages/Matches.tsx`

**Funcionalidades**:
- Lista de todas as partidas
- Cards com informações e preview de vídeo
- Edição de placar (admin)
- Exclusão de partidas com cascata
- Navegação para análise/eventos/mídia

**Componentes**:
- `MatchCard` - Card de partida
- `MatchEditDialog` - Modal de edição

### 6. 🎬 Mídia

**Localização**: `/src/pages/Media.tsx`

**Tabs**:
1. **Cortes & Capas** - Thumbnails e clips de eventos
2. **Playlists** - Organização por time para redes sociais
3. **Redes Sociais** - Exportação e preview

**Funcionalidades**:
- Geração de thumbnails por IA
- Playback de clips com vinhetas animadas
- Playlists organizadas por time
- Preview em mockups de dispositivos
- Exportação para redes sociais

**Componentes**:
- `ClipVignette` - Vinheta animada CSS
- `TransitionVignette` - Transições
- `PlaylistPlayer` - Player de playlist
- `DeviceMockup` - Simulação de dispositivos
- `ExportPreviewDialog` - Preview de exportação
- `SocialSharePanel` - Painel de compartilhamento
- `TimestampPlayer` - Player com timestamp

### 7. 🎙️ Áudio

**Localização**: `/src/pages/Audio.tsx`

**Funcionalidades**:
- Geração de narração por IA
- Criação de podcasts táticos
- Chatbots de time (um por time)
- Text-to-Speech com vozes OpenAI
- Persistência de áudio gerado

**Tipos de Podcast**:
- **Tático**: Análise profunda de formações
- **Resumo**: Recap da partida
- **Debate**: Perspectivas contrastantes

**Vozes**:
- `onyx` - Narrador/tático
- `nova` - Comentarista
- `echo` - Comentário dinâmico

**Componentes**:
- `TeamChatbotCard` - Card de chatbot por time

### 8. 📡 Live (Transmissão ao Vivo)

**Localização**: `/src/pages/Live.tsx`

**Funcionalidades**:
- Input de links de streaming (YouTube, Twitch, HLS)
- Captura de câmera local
- Transcrição em tempo real (Whisper)
- Detecção automática de eventos
- Aprovação/edição de eventos detectados
- Placar ao vivo
- Auto-save de transcrição (60s)

**Componentes**:
- `LiveStreamInput` - Input de stream
- `LiveCameraInput` - Captura de câmera
- `LiveEventsList` - Lista de eventos
- `LiveScoreDisplay` - Placar
- `LiveTranscript` - Transcrição
- `LiveRecordingPanel` - Controles de gravação
- `LiveMatchForm` - Formulário de partida

### 9. ⚙️ Configurações

**Localização**: `/src/pages/Settings.tsx`

**Funcionalidades**:
- Gerenciamento de times
- Upload de logos de times
- Configuração de cores primárias/secundárias
- Configurações de API (chaves)

**Componentes**:
- `TeamCard` - Card de time
- `TeamFormDialog` - Formulário de time

### 10. 🔐 Autenticação

**Localização**: `/src/pages/Auth.tsx`

**Funcionalidades**:
- Login com email/senha
- Cadastro de novos usuários
- Login com Google OAuth
- Reset de senha
- Auto-redirect após autenticação

---

## Banco de Dados

### Tabelas Principais

#### `teams`
```sql
id: uuid (PK)
name: text
short_name: text
logo_url: text
primary_color: text
secondary_color: text
created_at: timestamp
updated_at: timestamp
```

#### `matches`
```sql
id: uuid (PK)
home_team_id: uuid (FK → teams)
away_team_id: uuid (FK → teams)
home_score: integer
away_score: integer
match_date: timestamp
competition: text
venue: text
status: text ('pending', 'analyzing', 'completed', 'live')
created_at: timestamp
updated_at: timestamp
```

#### `match_events`
```sql
id: uuid (PK)
match_id: uuid (FK → matches)
event_type: text
minute: integer
second: integer
description: text
player_id: uuid (FK → players)
position_x: numeric
position_y: numeric
is_highlight: boolean
clip_url: text
approval_status: text ('pending', 'approved', 'rejected')
approved_by: uuid
approved_at: timestamp
metadata: jsonb {
  eventMs: number,
  videoSecond: number,
  confidence: number
}
created_at: timestamp
```

#### `videos`
```sql
id: uuid (PK)
match_id: uuid (FK → matches)
file_url: text
file_name: text
video_type: text ('full', 'first_half', 'second_half', 'clip')
start_minute: integer
end_minute: integer
duration_seconds: integer
status: text
created_at: timestamp
```

#### `analysis_jobs`
```sql
id: uuid (PK)
match_id: uuid (FK → matches)
video_id: uuid (FK → videos)
status: text ('queued', 'processing', 'completed', 'failed')
progress: integer
current_step: text
result: jsonb
error_message: text
started_at: timestamp
completed_at: timestamp
created_at: timestamp
```

#### `generated_audio`
```sql
id: uuid (PK)
match_id: uuid (FK → matches)
audio_type: text ('narration', 'podcast', 'chatbot')
voice: text
script: text
audio_url: text
duration_seconds: integer
created_at: timestamp
updated_at: timestamp
```

#### `thumbnails`
```sql
id: uuid (PK)
match_id: uuid
event_id: uuid
event_type: text
title: text
image_url: text
created_at: timestamp
```

#### `chatbot_conversations`
```sql
id: uuid (PK)
match_id: uuid
team_name: text
team_type: text ('home', 'away')
messages: jsonb[]
created_at: timestamp
updated_at: timestamp
```

#### `players`
```sql
id: uuid (PK)
team_id: uuid (FK → teams)
name: text
number: integer
position: text
photo_url: text
created_at: timestamp
updated_at: timestamp
```

#### `profiles`
```sql
id: uuid (PK)
user_id: uuid (FK → auth.users)
email: text
display_name: text
created_at: timestamp
updated_at: timestamp
```

#### `user_roles`
```sql
id: uuid (PK)
user_id: uuid
role: app_role ('admin', 'user')
created_at: timestamp
```

### Storage Buckets

| Bucket | Uso | Público |
|--------|-----|---------|
| `match-videos` | Vídeos de partidas | Sim |
| `generated-audio` | Áudio gerado (narração, podcasts) | Sim |
| `thumbnails` | Imagens de thumbnails | Sim |
| `event-clips` | Clips de eventos | Sim |
| `smart-editor` | Vídeos do Smart Editor | Sim |

---

## Edge Functions

### `analyze-video`
**Propósito**: Análise completa de vídeo de partida

**Fluxo**:
1. Download do vídeo (se necessário)
2. Extração de áudio
3. Transcrição via Whisper
4. Análise visual via Gemini Vision
5. Correlação de eventos
6. Inserção no banco de dados

**Endpoints**: POST

**Parâmetros**:
```json
{
  "matchId": "uuid",
  "videoUrl": "string",
  "videoId": "uuid",
  "startMinute": 0,
  "endMinute": 45,
  "durationSeconds": 2700
}
```

### `transcribe-audio`
**Propósito**: Transcrição de áudio usando Whisper

**Endpoints**: POST

**Parâmetros**:
```json
{
  "audioData": "base64",
  "language": "pt"
}
```

### `extract-live-events`
**Propósito**: Extração de eventos de transcrição ao vivo

**Endpoints**: POST

**Parâmetros**:
```json
{
  "transcription": "string",
  "matchContext": {
    "homeTeam": "string",
    "awayTeam": "string",
    "currentScore": { "home": 0, "away": 0 }
  }
}
```

### `generate-narration`
**Propósito**: Geração de narração em áudio

**Fluxo**:
1. Busca eventos da partida
2. Gera script via Lovable AI
3. Converte para áudio via OpenAI TTS
4. Salva no Storage

**Endpoints**: POST

### `generate-podcast`
**Propósito**: Geração de podcast tático

**Tipos**: tactical, summary, debate

**Endpoints**: POST

### `arena-chatbot`
**Propósito**: Chatbot assistente do Arena Play

**Modelo**: Gemini 2.5 Flash (streaming)

**Endpoints**: POST

### `team-chatbot`
**Propósito**: Chatbot de perspectiva de time

**Features**:
- Resposta em texto
- Conversão para áudio (TTS)
- Contexto de partida

**Endpoints**: POST

### `generate-thumbnail`
**Propósito**: Geração de thumbnail para evento

**Modelo**: Gemini (descrição) → Lovable AI Image

**Endpoints**: POST

### `arena-tts`
**Propósito**: Text-to-Speech genérico

**Endpoints**: POST

### `extract-audio-srt`
**Propósito**: Extração de áudio e geração de SRT

**Endpoints**: POST

---

## Fluxos de Trabalho

### Fluxo 1: Upload e Análise de Partida

```
1. Usuário acessa /upload
2. Seleciona times (home/away)
3. Faz upload de vídeos por segmento
4. Configura tempos de cada segmento
5. Clica "Continuar"
6. Sistema cria partida no banco
7. Inicia job de análise
8. Usuário acompanha progresso em /analysis
9. Eventos são detectados e salvos
10. Partida marcada como "completed"
```

### Fluxo 2: Edição e Aprovação de Eventos (Admin)

```
1. Admin acessa /events
2. Seleciona evento para editar
3. Modifica dados (tipo, tempo, descrição)
4. Evento marcado como "pending"
5. Admin visualiza preview do vídeo
6. Aprova ou rejeita edição
7. Status atualizado para "approved" ou "rejected"
```

### Fluxo 3: Geração de Conteúdo de Mídia

```
1. Usuário acessa /media
2. Seleciona partida analisada
3. Visualiza eventos disponíveis
4. Gera thumbnails por IA
5. Organiza clips em playlist
6. Preview em mockup de dispositivo
7. Exporta para rede social
```

### Fluxo 4: Transmissão ao Vivo

```
1. Usuário acessa /live
2. Insere link de stream ou ativa câmera
3. Clica "Iniciar Gravação"
4. Sistema captura áudio do microfone
5. A cada 30s, transcreve e detecta eventos
6. Usuário aprova/edita eventos em tempo real
7. Atualiza placar manualmente
8. Clica "Finalizar"
9. Dados salvos como partida completa
```

### Fluxo 5: Chatbot de Time

```
1. Usuário acessa /audio
2. Seleciona partida
3. Escolhe chatbot de time (home/away)
4. Digita ou grava mensagem por voz
5. Sistema transcreve (se voz)
6. Envia para team-chatbot edge function
7. IA responde como torcedor do time
8. Resposta convertida para áudio
9. Usuário ouve resposta
```

---

## Integrações de IA

### Lovable AI Gateway

**URL**: `https://ai.gateway.lovable.dev/v1/chat/completions`

**Modelos Disponíveis**:
- `google/gemini-2.5-flash` (padrão)
- `google/gemini-2.5-pro`
- `google/gemini-2.5-flash-lite`
- `openai/gpt-5`
- `openai/gpt-5-mini`

**Uso**: Análise de vídeo, geração de scripts, chatbots

### OpenAI Whisper

**Endpoint**: `https://api.openai.com/v1/audio/transcriptions`

**Modelo**: `whisper-1`

**Uso**: Transcrição de áudio de partidas

### OpenAI TTS

**Endpoint**: `https://api.openai.com/v1/audio/speech`

**Modelo**: `tts-1`

**Vozes**:
- `onyx` - Voz masculina grave (narrador)
- `nova` - Voz feminina (comentarista)
- `echo` - Voz masculina dinâmica

**Uso**: Narração, podcasts, chatbot

---

## Guia de Uso

### Primeiro Acesso

1. Acesse a landing page (`/welcome`)
2. Clique em "Começar" ou "Ver Partidas"
3. Faça login ou cadastre-se
4. Primeiro usuário é automaticamente admin

### Cadastro de Times

1. Vá para Configurações (`/settings`)
2. Clique em "Adicionar Time"
3. Preencha nome, sigla, cores
4. Faça upload da logo (opcional)
5. Salve

### Upload de Partida

1. Acesse Upload (`/upload`)
2. Selecione times da partida
3. Arraste vídeos para os dropzones
4. Configure tempos de cada segmento
5. Verifique cobertura na timeline
6. Clique "Continuar"

### Acompanhamento de Análise

1. Após upload, vá para Análise (`/analysis`)
2. Selecione a partida
3. Acompanhe progresso em tempo real
4. Visualize eventos conforme são detectados
5. Notificação sonora ao completar

### Edição de Eventos (Admin)

1. Vá para Eventos (`/events`)
2. Clique no ícone de edição
3. Modifique campos necessários
4. Salve alterações
5. Visualize preview do vídeo
6. Aprove ou rejeite

### Geração de Mídia

1. Acesse Mídia (`/media`)
2. Gere thumbnails para eventos
3. Visualize clips com vinhetas
4. Organize playlists por time
5. Preview em diferentes dispositivos
6. Exporte para redes sociais

---

## API e Configurações

### Variáveis de Ambiente

```env
VITE_SUPABASE_URL=https://[project-id].supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=[anon-key]
VITE_SUPABASE_PROJECT_ID=[project-id]
```

### Secrets (Edge Functions)

| Secret | Uso |
|--------|-----|
| `LOVABLE_API_KEY` | Lovable AI Gateway |
| `OPENAI_API_KEY` | Whisper + TTS |
| `GOOGLE_CLOUD_API_KEY` | Google APIs |
| `ELEVENLABS_API_KEY` | ElevenLabs (legado) |
| `SUPABASE_SERVICE_ROLE_KEY` | Operações admin |
| `SUPABASE_URL` | URL do projeto |
| `SUPABASE_ANON_KEY` | Chave pública |

### Roles de Usuário

| Role | Permissões |
|------|------------|
| `admin` | Editar partidas, eventos, aprovar edições, criar eventos |
| `user` | Visualizar dados, usar chatbots, gerar mídia |

### Tipos de Evento

```typescript
type EventType = 
  | 'goal'           // Gol
  | 'assist'         // Assistência
  | 'shot'           // Chute
  | 'shot_on_target' // Chute no gol
  | 'save'           // Defesa
  | 'foul'           // Falta
  | 'yellow_card'    // Cartão amarelo
  | 'red_card'       // Cartão vermelho
  | 'offside'        // Impedimento
  | 'corner'         // Escanteio
  | 'free_kick'      // Falta
  | 'penalty'        // Pênalti
  | 'substitution'   // Substituição
  | 'pass'           // Passe
  | 'cross'          // Cruzamento
  | 'tackle'         // Desarme
  | 'interception'   // Interceptação
  | 'clearance'      // Corte
  | 'duel_won'       // Duelo ganho
  | 'duel_lost'      // Duelo perdido
  | 'ball_recovery'  // Recuperação
  | 'ball_loss'      // Perda de bola
  | 'high_press'     // Pressão alta
  | 'transition'     // Transição
  | 'buildup';       // Construção
```

---

## Considerações de Performance

### Limites

- **Supabase Query**: 1000 rows por query
- **Edge Function Memory**: 150MB
- **Video Analysis**: Streaming approach para evitar memory overflow
- **Clip Buffer**: 3s antes, 5s depois do evento

### Otimizações

- Timestamp-based playback (não extrai clips físicos)
- Streaming de respostas de IA
- Realtime subscriptions para progresso
- Lazy loading de componentes pesados
- Cache de queries com React Query

---

## Troubleshooting

### Análise não detecta eventos

1. Verifique metadados do vídeo (duration_seconds)
2. Confirme que tempos start/end estão corretos
3. Cheque logs da edge function
4. Verifique se o áudio é audível

### Vídeo não carrega

1. Confirme URL é acessível publicamente
2. Verifique formato (MP4, embed)
3. Teste URL diretamente no navegador
4. Cheque CORS do servidor de origem

### Áudio não gera

1. Verifique OPENAI_API_KEY
2. Confirme eventos existem para a partida
3. Cheque logs de generate-narration
4. Verifique quota da API OpenAI

### Chatbot não responde

1. Verifique LOVABLE_API_KEY
2. Confirme partida tem eventos
3. Cheque rate limits (429)
4. Verifique créditos (402)

---

## Contato e Suporte

Para suporte técnico ou dúvidas sobre o Arena Play, entre em contato com a equipe Kakttus.

---

*Documentação atualizada em: Dezembro 2025*
*Versão: 1.0.0*
