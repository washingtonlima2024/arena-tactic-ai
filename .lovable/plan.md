
# Buscar Logos dos Times Automaticamente

## Problema

O sistema ja tem toda a infraestrutura de busca automatica de logos (`autoFetchTeamLogo`, edge function `fetch-football-logos`, hook `useAutoTeamLogos`), mas ela so e acionada quando times estao **vinculados a uma partida** e sem logo. Times cadastrados na tela de Configuracoes que nao tem logo ficam sem escudo indefinidamente.

## Solucao

Adicionar o hook `useAutoTeamLogos` na pagina de **Settings** (onde os times sao gerenciados), para que ao carregar a lista de times, qualquer time sem `logo_url` tenha sua logo buscada automaticamente em background.

### Arquivo: `src/pages/Settings.tsx`

**Mudanca 1 - Importar o hook:**
- Adicionar `import { useAutoTeamLogos } from '@/hooks/useAutoTeamLogos'`

**Mudanca 2 - Usar o hook:**
- Apos a linha `const { data: teams, isLoading: teamsLoading } = useTeams();` (linha 123), adicionar:
```
useAutoTeamLogos(teams || []);
```

Isso fara com que, ao abrir a pagina de Settings, todos os times sem logo sejam automaticamente buscados no football-logos.cc, baixados e armazenados localmente. O hook ja possui protecao contra buscas duplicadas (Set de IDs ja buscados por sessao).

## Impacto

- Apenas 1 linha de codigo + 1 import
- Sem mudancas no backend
- O hook ja invalida as queries de teams apos atualizar, entao os logos aparecerao automaticamente na tela
