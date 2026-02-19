

# Corrigir Exibicao de Times nos Cards de Partidas

## Problema Raiz

O hook `useMatches` (src/hooks/useMatches.ts) tem dois caminhos:
1. **Servidor local**: Funciona, retorna `home_team`/`away_team` corretamente via `to_dict(include_teams=True)`
2. **Fallback Supabase** (linhas 38-48): Usa referencia de foreign key `teams!matches_home_team_id_fkey` que **NAO EXISTE** na tabela `matches`

Quando o fallback e acionado (ou em momentos de instabilidade do tunel), a query falha e os matches retornam sem dados dos times. Resultado: cards mostram "Casa" e "Time Casa" sem escudo.

## Solucao

### Mudanca 1 - Adicionar Foreign Keys na tabela `matches`

Criar migracao SQL para adicionar as constraints que faltam:

```text
ALTER TABLE public.matches 
  ADD CONSTRAINT matches_home_team_id_fkey 
  FOREIGN KEY (home_team_id) REFERENCES public.teams(id);

ALTER TABLE public.matches 
  ADD CONSTRAINT matches_away_team_id_fkey 
  FOREIGN KEY (away_team_id) REFERENCES public.teams(id);
```

Isso permite que o join do Supabase funcione corretamente no fallback.

### Mudanca 2 - Query alternativa sem dependencia de FK

Caso as FKs nao possam ser adicionadas (dados orfaos), alterar a query do Supabase em `useMatches.ts` para usar a sintaxe de join explicito sem referencia de FK:

```text
// ANTES (falha sem FK):
home_team:teams!matches_home_team_id_fkey(...)

// DEPOIS (funciona sem FK):
home_team:teams!home_team_id(...)
away_team:teams!away_team_id(...)
```

A sintaxe `teams!home_team_id` diz ao PostgREST para usar a coluna `home_team_id` como chave de join, sem precisar de uma FK formal.

### Mudanca 3 - Tratamento de erro robusto

No `useMatches`, caso o join com times falhe, fazer uma segunda query mais simples (sem join) para pelo menos mostrar os matches:

```text
// Se a query com join falhar, buscar sem join
const { data, error } = await supabase
  .from('matches')
  .select('*')
  .order('created_at', { ascending: false });
```

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| Migracao SQL | Adicionar FKs matches -> teams |
| src/hooks/useMatches.ts | Corrigir sintaxe do join e adicionar fallback sem join |

## Resultado

| Cenario | Antes | Depois |
|---|---|---|
| Servidor local online | Times aparecem (funciona) | Sem mudanca |
| Servidor offline, fallback Supabase | Query com FK falha, times nao aparecem | Join funciona, times aparecem |
| Times genericos ("Time Casa") | Sem logo, mostra fallback | Sem mudanca (dados corretos, so nao tem logo) |

