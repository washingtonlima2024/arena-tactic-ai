

# Separacao Automatica de Tempos e Importacao Incremental

## Contexto

O usuario quer duas funcionalidades complementares:
1. **Separacao automatica de tempos**: quando um video `full` (>50 min) e importado via Smart Import, o backend deve detectar o ponto de intervalo e processar cada tempo independentemente.
2. **Importacao incremental**: apos a importacao automatica do primeiro tempo (ou do jogo completo), permitir que o usuario adicione o segundo tempo, um trecho ou outro video diretamente pela pagina de Eventos ou Upload, sem perder os eventos ja detectados.

## Mudancas Propostas

### 1. Backend: Deteccao de Intervalo e Split Automatico (server.py)

**Arquivo:** `video-processor/server.py`

Quando o pipeline async detecta um video `full` com duracao > 50 minutos, ele deve:

1. **Detectar o ponto de intervalo** usando FFmpeg `silencedetect` na regiao central do video (40%-60% da duracao):
   - Buscar silencio de >= 8 segundos na faixa de 35% a 65% da duracao
   - Se encontrar, usar o ponto medio do silencio como corte
   - Se nao encontrar, usar a metade exata da duracao como fallback

2. **Dividir o video em dois arquivos temporarios**:
   - `first_half.mp4`: do inicio ate o ponto de corte
   - `second_half.mp4`: do ponto de corte ate o final
   
3. **Processar cada metade independentemente** no pipeline existente:
   - Cada metade gera sua propria transcricao
   - Cada metade e analisada separadamente (0-45 e 45-90)
   - Clips sao gerados para cada metade

Logica de deteccao de silencio (pseudocodigo):

```text
# Executa FFmpeg silencedetect na regiao central
ffmpeg -i video.mp4 -ss {35% duracao} -t {30% duracao} 
       -af silencedetect=noise=-40dB:d=8 -f null -

# Parseia output para encontrar silence_start e silence_end
# Retorna o ponto medio como split_point
# Fallback: duracao / 2
```

Impacto no pipeline (Phase 2):
- Antes de dividir em partes para transcricao, verificar se e video full e se deve ser split
- Criar dois entries em `video_paths`: `first` e `second`
- O restante do pipeline ja suporta processar primeiro e segundo tempo separadamente

### 2. Frontend: Importacao Incremental do Segundo Tempo (Upload.tsx)

**Arquivo:** `src/pages/Upload.tsx`

Apos o Smart Import completar e redirecionar para `/events`, o usuario pode querer adicionar mais videos. Duas abordagens complementares:

#### 2a. SmartImportCard com duas entradas (primeiro e segundo tempo)

**Arquivo:** `src/components/upload/SmartImportCard.tsx`

Modificar o SmartImportCard para aceitar dois videos (um para cada tempo) ao inves de apenas um:

- Adicionar duas zonas de upload/link: "1o Tempo" (azul) e "2o Tempo" (laranja)
- Cada zona e opcional -- o usuario pode fornecer apenas um
- A IA transcreve os primeiros 5 minutos do primeiro video disponivel para identificar a partida
- Ao disparar o pipeline, ambos os videos sao enviados como `VideoInput[]`

UI proposta:

```text
+-----------------------------------+
|     Importacao Inteligente        |
|                                   |
|  +-------------+ +-------------+  |
|  | 1o Tempo    | | 2o Tempo    |  |
|  | [Upload]    | | [Upload]    |  |
|  | ou link     | | ou link     |  |
|  |  (azul)     | |  (laranja)  |  |
|  +-------------+ +-------------+  |
|                                   |
|  +-----------------------------+  |
|  | Jogo Completo (verde)      |  |
|  | [Upload] ou link            |  |
|  +-----------------------------+  |
|                                   |
|        [Iniciar Importacao]       |
+-----------------------------------+
```

O usuario escolhe UMA das opcoes:
- Dois videos separados (1o + 2o tempo)
- Um video completo
- Apenas um tempo (o outro pode ser adicionado depois)

#### 2b. Botao "Adicionar Video" na pagina de Eventos

**Arquivo:** `src/pages/Events.tsx`

Adicionar um botao discreto "Adicionar 2o Tempo" ou "Adicionar Video" na pagina de Eventos que redireciona para `/upload?match={matchId}` (fluxo de partida existente), permitindo importar videos adicionais sem perder eventos ja detectados.

### 3. Pipeline Async: Suporte a Multiplos Videos por Tempo

**Arquivo:** `video-processor/server.py`

Na Phase 1 do pipeline, quando um video `full` e detectado E a funcao de split automatico esta disponivel:

```text
FLUXO ATUALIZADO:

Video full detectado (duracao > 50 min)
    |
    v
Detectar intervalo via silencedetect (regiao 35%-65%)
    |
    v
Split em first_half.mp4 e second_half.mp4
    |
    v
video_paths = {'first': first_half.mp4, 'second': second_half.mp4}
    |
    v
Pipeline continua normalmente (ja suporta 2 tempos)
```

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `video-processor/server.py` | Nova funcao `_detect_halftime_split_point()` usando FFmpeg silencedetect |
| `video-processor/server.py` | Phase 1.5: Split automatico de video full em dois tempos |
| `src/components/upload/SmartImportCard.tsx` | Duas zonas de entrada (1o tempo, 2o tempo, completo) |
| `src/pages/Upload.tsx` | Passar multiplos videos do SmartImport para o pipeline |
| `src/pages/Events.tsx` | Botao "Adicionar Video" para importacao incremental |

## O Que NAO Muda

- Nenhuma alteracao nos componentes de UI existentes (VideoSegmentCard, HalfDropzone, etc.)
- O fluxo manual (Nova Partida > Videos > Analise) permanece identico
- A logica de transcricao e analise por tempo permanece a mesma
- O pipeline de clips permanece o mesmo

