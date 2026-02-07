

# Integrar Football-Logos.cc ao Arena Play

## Objetivo

Permitir buscar e atribuir automaticamente logos de times a partir do site football-logos.cc, que possui 2.300+ logos organizados por pais com URLs publicas no CDN.

## Como funciona o site

O football-logos.cc organiza logos por pais (ex: `/brazil/`, `/england/`) e cada logo tem URLs previsíveis no CDN:
- PNG: `https://assets.football-logos.cc/logos/{pais}/256x256/{slug}.{hash}.png`
- SVG: `https://images.football-logos.cc/{pais}/{slug}.{hash}.svg`

Os hashes nas URLs nao sao previsíveis, entao precisamos fazer scraping das paginas para obter as URLs reais.

## Solucao

Criar uma Edge Function que faz scraping do football-logos.cc e um componente de busca/catalogo no frontend.

### Arquitetura

```text
Frontend (LogoSearchDialog)
    |
    v
Edge Function (fetch-football-logos)
    |
    v
football-logos.cc (scraping HTML)
    |
    v
Retorna lista: { name, slug, logoUrl, country }
```

## Mudancas

### 1. Edge Function: `fetch-football-logos`

Nova funcao que aceita dois modos:

**Modo "countries"**: Retorna a lista de paises disponíveis
- Faz fetch de `https://football-logos.cc`
- Extrai nomes de paises e quantidade de logos

**Modo "search"**: Busca logos por pais ou por nome
- Parametros: `country` (slug do pais) e/ou `query` (nome do time)
- Faz fetch de `https://football-logos.cc/{country}/`
- Parseia o HTML para extrair: nome do time, nome curto (apelido), URL do PNG 256x256
- Filtra por `query` se fornecido
- Retorna array de objetos: `{ name, shortName, logoUrl, country }`

### 2. Componente: `LogoSearchDialog`

Novo componente que permite buscar logos visualmente:

- Seletor de pais (dropdown com os paises disponíveis, default: Brazil)
- Campo de busca por nome de time
- Grid de resultados mostrando: logo (imagem 64x64), nome do time, nome curto
- Ao clicar em um logo, ele e selecionado e o `logo_url` e preenchido

### 3. Integracao no `TeamFormDialog`

Adicionar um botao "Buscar Logo" ao lado do upload de imagem existente, que abre o `LogoSearchDialog`. Quando o usuario seleciona um logo, o campo `logo_url` e preenchido automaticamente com a URL do CDN.

### 4. Importacao em massa (botao na aba Times)

Adicionar botao "Importar Times por Pais" na pagina de Settings (aba Times) que:
- Abre dialog para selecionar pais
- Carrega todos os times daquele pais
- Mostra lista com checkboxes para selecionar quais importar
- Para cada time selecionado: cria o time no sistema com nome, nome curto e logo_url preenchidos
- Pula times que ja existem (fuzzy match por nome)

### 5. Auto-match para times existentes

Botao "Buscar Logos Automaticamente" que:
- Percorre todos os times cadastrados sem `logo_url`
- Para cada time, busca no catalogo por nome (fuzzy match)
- Mostra preview dos matches encontrados
- Permite confirmar/rejeitar cada sugestao antes de salvar

## Arquivos a criar/modificar

| Arquivo | Acao |
|---------|------|
| `supabase/functions/fetch-football-logos/index.ts` | Criar - Edge function para scraping |
| `src/components/teams/LogoSearchDialog.tsx` | Criar - Dialog de busca de logos |
| `src/components/teams/BulkImportTeamsDialog.tsx` | Criar - Dialog de importacao em massa |
| `src/components/teams/TeamFormDialog.tsx` | Modificar - Adicionar botao "Buscar Logo" |
| `src/pages/Settings.tsx` | Modificar - Adicionar botoes de importacao em massa e auto-match |
| `supabase/config.toml` | Modificar - Registrar nova edge function |

## Detalhes Tecnicos

### Edge Function - Parsing

O HTML do site segue um padrao consistente. A partir do markdown/HTML extraido:

```text
Nome do time: texto do link principal (ex: "Flamengo")
Nome curto: texto apos "\" se existir (ex: "CRF")  
Logo URL: src da imagem no padrao assets.football-logos.cc/logos/{pais}/256x256/{slug}.{hash}.png
Pais: extraido do path da pagina
```

### Fuzzy Match para auto-match

Para encontrar logos de times ja cadastrados, usar comparacao case-insensitive e normalizacao de acentos:
- "Atletico Mineiro" deve encontrar "Atlético Mineiro"
- "Flamengo" deve encontrar "Flamengo (CRF)"
- "Internacional" deve encontrar "Internacional"

### Cache

A edge function pode cachear resultados por pais em memoria (Map) para evitar scraping repetido na mesma sessao. O cache expira apos 30 minutos.

### Uso de CDN direto

As URLs de logo apontam diretamente para o CDN do football-logos.cc (`assets.football-logos.cc`), entao nao precisamos baixar/hospedar as imagens. O `logo_url` do time apontara diretamente para la.

## Fluxo do Usuario

### Ao cadastrar um time:
1. Preenche nome do time
2. Clica em "Buscar Logo"
3. Seleciona pais (default: Brazil)
4. Ve grid de logos, busca pelo nome
5. Clica no logo desejado
6. Logo URL e preenchido automaticamente
7. Salva o time

### Importacao em massa:
1. Na aba Times, clica "Importar Times"
2. Seleciona pais (ex: Brazil)
3. Ve lista de 44 times brasileiros com logos
4. Marca os que deseja importar
5. Clica "Importar Selecionados"
6. Times sao criados com nome, abreviacao e logo

