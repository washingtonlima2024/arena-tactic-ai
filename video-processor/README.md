# Arena Play - Servidor de Processamento de Vídeo

Servidor local para corte preciso de vídeos e adição de vinhetas usando FFmpeg.

## Requisitos

1. **Python 3.8+**
2. **FFmpeg** instalado no sistema

### Instalando FFmpeg

**Windows:**
```bash
# Via Chocolatey
choco install ffmpeg

# Ou baixe de https://ffmpeg.org/download.html
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install ffmpeg
```

## Instalação

1. Navegue até a pasta do servidor:
```bash
cd video-processor
```

2. Crie um ambiente virtual (recomendado):
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

3. Instale as dependências:
```bash
pip install -r requirements.txt
```

## Executando o Servidor

```bash
python server.py
```

O servidor iniciará em `http://localhost:5000`

## Verificando Status

Acesse `http://localhost:5000/health` para verificar se o servidor está funcionando e se o FFmpeg está disponível.

## Endpoints

### `POST /extract-clip`
Extrai um clip único com corte preciso.

```json
{
  "videoUrl": "https://exemplo.com/video.mp4",
  "startSeconds": 45.5,
  "durationSeconds": 8,
  "filename": "gol-10min.mp4",
  "includeVignettes": true,
  "openingVignette": "abertura.mp4",
  "closingVignette": "encerramento.mp4"
}
```

### `POST /extract-batch`
Extrai múltiplos clips e retorna um ZIP.

```json
{
  "videoUrl": "https://exemplo.com/video.mp4",
  "clips": [
    {"eventId": "1", "startSeconds": 45, "durationSeconds": 8, "title": "Gol 10min"},
    {"eventId": "2", "startSeconds": 120, "durationSeconds": 8, "title": "Falta 23min"}
  ],
  "includeVignettes": false
}
```

### `GET /vignettes`
Lista vinhetas disponíveis na pasta `vinhetas/`.

## Adicionando Vinhetas

Coloque seus arquivos de vinheta (formato MP4) na pasta `video-processor/vinhetas/`:

```
video-processor/
├── vinhetas/
│   ├── abertura.mp4      # Vinheta de abertura
│   └── encerramento.mp4  # Vinheta de encerramento
├── server.py
├── requirements.txt
└── README.md
```

As vinhetas serão automaticamente normalizadas para a mesma resolução do clip antes da concatenação.

## Integração com Arena Play

No aplicativo Arena Play:
1. Inicie este servidor local
2. O app detectará automaticamente o servidor em `http://localhost:5000`
3. Ao exportar clips, selecione a opção "Servidor Local"
4. Os clips serão cortados com precisão e baixados diretamente

## Solução de Problemas

### FFmpeg não encontrado
- Verifique se o FFmpeg está no PATH do sistema
- Execute `ffmpeg -version` no terminal para confirmar

### Erro de CORS
- O servidor já está configurado para aceitar requisições de qualquer origem
- Se ainda houver problemas, verifique se o servidor está rodando na porta 5000

### Timeout em vídeos grandes
- O timeout padrão é 120 segundos por clip
- Para vídeos muito grandes, considere usar clips menores

## Licença

Parte do projeto Arena Play.
