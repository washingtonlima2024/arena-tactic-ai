

# Plano de Correcoes e Ajustes - Arena Play

## Problema 1: Links quebrados no Mapa de Calor + Modal de Video

### Diagnostico
Na pagina `/analysis`, o componente `MatchReplayHeatmap` abre clips com `window.open(clipUrl, '_blank')` (linha 573 de `Analysis.tsx`). Isso tem dois problemas:
- As URLs dos clips nao sao normalizadas com `normalizeStorageUrl()`, causando links quebrados quando acessado via tunel ou producao
- O video abre em nova aba em vez de abrir em modal

Da mesma forma, no `AnalysisEventTimeline.tsx` (linha 209), o dropdown "Abrir" tambem usa `window.open(event.clip_url!, '_blank')`.

### Solucao
1. **Analysis.tsx**: Alterar o `onPlayClip` do `MatchReplayHeatmap` para abrir o clip normalizado em um modal (reutilizar o Dialog ja existente ou criar state para clip modal)
2. **Analysis.tsx**: Adicionar estado `clipDialogUrl` para controlar o modal de clip
3. **Analysis.tsx**: Criar um Dialog dedicado para clips com player de video
4. **AnalysisEventTimeline.tsx**: Alterar o dropdown "Abrir" para chamar um callback `onPlayClip` em vez de `window.open`, e normalizar a URL

### Arquivos afetados
- `src/pages/Analysis.tsx` - Adicionar estado e modal para clip, normalizar URLs
- `src/components/analysis/AnalysisEventTimeline.tsx` - Receber callback `onPlayClip` e usar ao inves de `window.open`

---

## Problema 2: Linhas do Grafico com mesma cor

### Diagnostico
No componente `DualLineChart` dentro de `MatchDashboard.tsx` (linhas 500-536), os graficos de area usam cores CSS:
- Time Casa: `hsl(var(--primary))` - verde emerald
- Time Visitante: `hsl(var(--destructive))` - vermelho

Essas cores deveriam ser diferentes, mas o usuario reporta que estao iguais. Isso pode ocorrer porque:
- Ambos os times no banco de dados tem `primary_color: "#10b981"` (verde) - confirmado nos dados da API
- Ou as variaveis CSS `--primary` e `--destructive` estao resolvendo para cores muito similares

### Solucao
1. **MatchDashboard.tsx**: Usar as cores reais dos times (`homeTeamColor` e `awayTeamColor`) em vez de variaveis CSS genericas
2. **Garantir contraste**: Se ambos os times tiverem a mesma cor (como `#10b981`), aplicar uma cor fallback diferente para o time visitante (ex: `#3b82f6` azul)
3. **Propagar cores para todos os graficos** (DualLineChart, AreaChart, etc.)

### Arquivos afetados
- `src/pages/MatchDashboard.tsx` - Passar cores dos times para os graficos e usar `stroke`/`fill` com cores reais

---

## Problema 3: Ajustes para Producao no dominio arenaplay.kakttus.com

### Diagnostico
Analisando o codigo, a infraestrutura de producao ja tem suporte basico ao dominio `arenaplay.kakttus.com`, mas ha pontos que precisam de atencao:

### Itens que ja funcionam
- **Deteccao de producao**: `isKakttusProduction()` em `apiMode.ts` detecta corretamente o dominio
- **Proxy Nginx**: Quando no dominio kakttus, `getApiBase()` retorna string vazia, e os endpoints `/api/...` sao encaminhados pelo Nginx
- **PM2**: `ecosystem.config.cjs` configura frontend (porta 8080) e backend (porta 5000)

### Itens que precisam de ajuste

**A. Nginx do servidor (manual - fora do Lovable)**
O proxy reverso precisa estar configurado para:
- Servir o frontend estatico (dist/) em `/`
- Proxy `/api/` para `http://localhost:5000/`
- Proxy `/api/storage/` para servir arquivos de midia
- `client_max_body_size 2G` para uploads grandes
- Timeout de 600s para operacoes de IA
- SSL via Let's Encrypt ou proxy de borda

**B. CORS no Backend Python (manual)**
O `server.py` precisa permitir o dominio `arenaplay.kakttus.com` nos headers CORS.

**C. Variavel de ambiente `.env.production`**
Ja esta configurada com `VITE_API_BASE_URL=/api`, que funciona com Nginx. Nenhuma alteracao necessaria.

**D. URLs de midia normalizadas**
O sistema de `normalizeStorageUrl` ja trata caminhos relativos `/api/storage/...` corretamente. Quando no dominio kakttus, a base e vazia, entao a URL fica como `/api/storage/...` que o Nginx resolve.

**E. Lovable Published URL vs Producao**
O Lovable publica em `arenaplay-kaktttus.lovable.app`. Para usar o dominio customizado `arenaplay.kakttus.com`, existem duas opcoes:
1. Apontar o DNS para o Lovable (185.158.133.1) - mas isso nao tera acesso ao backend Python
2. Apontar o DNS para o servidor Linux com Nginx - que serve o build e faz proxy para o backend

A opcao 2 e a correta para este projeto, ja que depende do backend Python.

### Checklist de Deploy em Producao

```text
Servidor Linux (VM)
+-- Nginx (porta 80/443)
|   +-- / -> serve dist/ (frontend)
|   +-- /api/ -> proxy_pass http://localhost:5000/
+-- PM2
|   +-- arena-frontend (serve -s dist -l 8080)
|   +-- arena-backend (python server.py :5000)
```

Nao ha alteracoes de codigo necessarias para o item 3 - apenas configuracoes no servidor. Vou incluir instrucoes detalhadas na implementacao.

---

## Resumo das Alteracoes de Codigo

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Analysis.tsx` | Adicionar modal de clip, normalizar URLs, conectar heatmap ao modal |
| `src/components/analysis/AnalysisEventTimeline.tsx` | Adicionar callback `onPlayClip`, normalizar URLs de clip |
| `src/pages/MatchDashboard.tsx` | Usar cores dos times nos graficos em vez de variaveis CSS |

---

## Detalhes Tecnicos

### Modal de Clip (Analysis.tsx)
- Novo estado: `clipUrl: string | null` para controlar o modal
- Normalizar com `normalizeStorageUrl(clipUrl)` antes de abrir
- Dialog simples com `<video>` player, sem DeviceMockup (manter leve)
- Fechar ao clicar fora ou no X

### Cores dos Graficos (MatchDashboard.tsx)
- Extrair `homeTeamColor` e `awayTeamColor` do `matchDetails`
- Aplicar fallback: se ambas cores forem iguais, usar `#3b82f6` (azul) para visitante
- Propagar para `DualLineChart` via novas props `homeColor` e `awayColor`
- Aplicar nos `stroke`, `fill` e `dot` dos componentes Recharts

### Producao (arenaplay.kakttus.com)
- Sem alteracoes de codigo necessarias
- Instrucoes de configuracao Nginx serao fornecidas como documentacao

