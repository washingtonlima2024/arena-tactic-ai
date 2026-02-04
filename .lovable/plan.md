
## Análise Geral: Dados Reais vs Fictícios por Página

### Resumo Executivo

Após análise detalhada do código, identifiquei que existem **dados fictícios/placeholders** em algumas páginas que precisam ser removidos ou substituídos. A transcrição do áudio já é exibida, mas precisa de sincronização com o player.

---

## Inventário por Página

### 1. Página de Áudio (`/audio`)
| Componente | Fonte dos Dados | Status |
|------------|-----------------|--------|
| Player de áudio | Vídeo real do jogo | ✅ REAL |
| Placar dinâmico | Calculado dos eventos | ✅ REAL |
| Transcrição | `analysis.transcription` do banco | ✅ REAL |
| Highlights em áudio | Eventos detectados | ✅ REAL |

**Solicitação do usuário**: Sincronizar o scroll do texto da transcrição com o áudio enquanto toca.

---

### 2. Página de Análise (`/analysis`)
| Componente | Fonte dos Dados | Status |
|------------|-----------------|--------|
| Placar | Eventos reais | ✅ REAL |
| Lista de eventos | Banco de dados | ✅ REAL |
| Insights/Resumo | `useEventBasedAnalysis` (calculado dos eventos) | ✅ REAL |
| **Mapa de Calor 2D** | `useEventHeatZones` | ⚠️ SEMI-FICTÍCIO |
| **Posições de jogadores** | Formação 4-4-2 hardcoded | ❌ FICTÍCIO |

**Problema**: O `useEventHeatZones` usa uma formação 4-4-2 pré-definida com offsets aleatórios. Os jogadores NÃO são detectados por YOLO/IA - são posições estáticas fictícias.

---

### 3. Página Campo FIFA (`/field`)
| Componente | Fonte dos Dados | Status |
|------------|-----------------|--------|
| Campo 2D | Medidas oficiais FIFA | ✅ REAL |
| Medidas | Constantes FIFA | ✅ REAL |
| **Animação de Gols** | `generateMockGoalPlay()` | ❌ FICTÍCIO |
| Detecção YOLO | Roboflow API (se imagem enviada) | ✅ REAL (quando usado) |

**Problema**: A aba "Animação Gol" usa `generateMockGoalPlay()` que gera animações genéricas pré-definidas, NÃO baseadas no vídeo real.

---

### 4. Página de Eventos (`/events`)
| Componente | Fonte dos Dados | Status |
|------------|-----------------|--------|
| Lista de eventos | Banco de dados (IA) | ✅ REAL |
| Thumbnails | Extraídos do vídeo | ✅ REAL |
| Timestamps | Metadados da IA | ✅ REAL |
| Placar dinâmico | Calculado dos eventos | ✅ REAL |

---

### 5. Página de Mídia (`/media`)
| Componente | Fonte dos Dados | Status |
|------------|-----------------|--------|
| Clips de vídeo | Extraídos do vídeo real | ✅ REAL |
| Thumbnails | Frames do vídeo | ✅ REAL |
| Lista de eventos | Banco de dados | ✅ REAL |

---

### 6. Dashboard da Partida (`/dashboard`)
| Componente | Fonte dos Dados | Status |
|------------|-----------------|--------|
| Estatísticas | Calculadas dos eventos | ✅ REAL |
| Gráficos | Eventos por tempo | ✅ REAL |
| Validação de gols | Transcrição + eventos | ✅ REAL |

---

## Itens Fictícios a Tratar

### 1. Posições de Jogadores no Mapa de Calor
**Arquivo**: `src/hooks/useEventHeatZones.ts`
**Problema**: Usa `DEFAULT_HOME_FORMATION` e `DEFAULT_AWAY_FORMATION` hardcoded
**Solução**: 
- Opção A: Remover jogadores do mapa de calor (manter apenas zonas de calor baseadas em eventos)
- Opção B: Adicionar aviso claro que são "posições ilustrativas"

### 2. Animações Táticas Genéricas
**Arquivo**: `src/components/tactical/AnimatedTacticalPlay.tsx`
**Problema**: `generatePlaySteps()` cria animações pré-definidas por tipo de evento (goal, corner, etc.)
**Solução**:
- Opção A: Remover aba de animação
- Opção B: Adicionar aviso "Representação ilustrativa do lance"

---

## Alteração Solicitada: Sincronização Áudio + Texto

**Arquivo**: `src/pages/Audio.tsx`

Implementar scroll automático da transcrição sincronizado com o player de áudio:

1. Dividir a transcrição em segmentos (por linhas ou frases)
2. Estimar a posição do texto baseado no `currentTime` do áudio
3. Fazer auto-scroll do container de transcrição
4. Destacar visualmente a linha atual sendo reproduzida

```text
┌─────────────────────────────────────────┐
│  🎵 Player de Áudio                     │
│  [■■■■■■■▒▒▒▒▒▒▒▒▒▒▒] 02:45 / 45:00    │
├─────────────────────────────────────────┤
│  Transcrição da Narração                │
├─────────────────────────────────────────┤
│  Linha anterior...                      │
│  → LINHA ATUAL DESTACADA ← (auto-scroll)│
│  Próxima linha...                       │
│  ...                                    │
└─────────────────────────────────────────┘
```

---

## Plano de Implementação

### Fase 1: Sincronização Áudio-Texto (Solicitado)
1. Modificar `src/pages/Audio.tsx`:
   - Adicionar referência ao container de transcrição
   - Dividir texto em linhas/parágrafos
   - Calcular posição estimada baseada em `currentTime / duration`
   - Implementar auto-scroll com destaque visual

### Fase 2: Avisos de Dados Ilustrativos (Recomendado)
1. No `Heatmap2D.tsx`: Adicionar badge "Posições ilustrativas"
2. No `AnimatedTacticalPlay.tsx`: Adicionar badge "Representação conceitual"
3. Opção: Remover jogadores fictícios do mapa de calor (manter apenas zonas)

### Fase 3: Limpeza (Opcional)
1. Remover aba "Animação Gol" da página `/field` se não houver dados reais
2. Simplificar mapa de calor para mostrar apenas zonas baseadas em eventos detectados
