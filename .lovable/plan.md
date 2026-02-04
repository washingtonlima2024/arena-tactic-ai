
## Plano: Remover Visualizações Fictícias da Página de Análise

### Problema Identificado

A página de Análise contém **três seções** que exibem dados fictícios não derivados do jogo real:

1. **Cards de Formação (linhas 532-585)**: Dois cards "Formation Overview 2D" com jogadores em posições hardcoded (4-3-3 e 4-4-2 fixas)
2. **Animações Táticas (linhas 587-644)**: O componente `AnimatedTacticalPlay` que gera sequências de movimentação pré-definidas para cada tipo de evento (o que você vê na screenshot com "Construção do Ataque")

Nenhuma dessas informações vem da análise do vídeo ou dos eventos detectados.

---

### Solução Proposta

Remover completamente essas seções da página de Análise, mantendo apenas dados reais:

| O que fica | Fonte |
|------------|-------|
| Mapa de Calor 2D | Zonas derivadas dos eventos detectados ✅ |
| Comparativo de Estatísticas | Calculado a partir dos eventos ✅ |
| Lista de Eventos | Banco de dados (detecção de IA) ✅ |
| Insights e Resumo | Gerado a partir dos eventos ✅ |

| O que será removido | Motivo |
|---------------------|--------|
| Cards "Formation Overview 2D" | Posições de jogadores são hardcoded |
| "Jogadas Táticas Animadas" | Animações são genéricas pré-definidas |

---

### Alterações Técnicas

#### 1. Arquivo: `src/pages/Analysis.tsx`

Remover:
- **Linhas 532-585**: Bloco dos dois cards de formação com `FootballField` e jogadores hardcoded
- **Linhas 587-644**: Bloco do card "Jogadas Táticas Animadas" com `AnimatedTacticalPlay`
- **Linhas 8**: Importação do `AnimatedTacticalPlay`
- **Linha 7**: Importação do `FootballField`
- **Linhas 78-79**: States `selectedEventForPlay` e `videoDialogOpen` relacionados às animações

#### 2. Limpeza (opcional futuro)

Os arquivos `AnimatedTacticalPlay.tsx` e `FootballField.tsx` podem ser mantidos para uso futuro caso existam dados reais de rastreamento (YOLO), mas não serão usados na página de Análise.

---

### Resultado Esperado

A página de Análise exibirá apenas:
1. **Mapa de Calor 2D** - Zonas de atividade baseadas em eventos reais detectados
2. **Comparativo de Estatísticas** - Dados calculados dos eventos (passes, chutes, etc.)
3. **Lista de Eventos Importantes** - Eventos detectados pela IA com thumbnails reais
4. **Insights** - Análise textual gerada a partir dos eventos

Nenhuma visualização fictícia será exibida em produção.
