
# Detectar Times e Baixar Logos Durante a Analise

## Problema Atual

Quando uma partida e analisada, os times ja devem estar cadastrados e associados. Se esses times nao possuem logo, nada acontece automaticamente. O download de logos so ocorre quando um time e **criado** (via `useCreateTeam`), mas nao quando um time existente e carregado sem logo.

## Solucao

Adicionar verificacao automatica de logos faltantes no hook `useMatchDetails`. Quando a partida e carregada e um ou ambos os times nao possuem `logo_url`, o sistema dispara `autoFetchTeamLogo` em background e atualiza o time no servidor.

## Mudancas Tecnicas

### Arquivo: `src/hooks/useMatchDetails.ts`

Importar `autoFetchTeamLogo` e `apiClient`, e adicionar um efeito colateral no `useMatchDetails` que:

1. Verifica se `home_team` ou `away_team` tem `logo_url` nulo/vazio
2. Para cada time sem logo, chama `autoFetchTeamLogo(team.name)` em background
3. Se encontrar logo, atualiza o time via `apiClient.updateTeam()`
4. Invalida a query `['match-details']` e `['teams']` para refletir a mudanca na UI

```typescript
// Dentro de useMatchDetails, apos o useQuery:
// Efeito para auto-buscar logos faltantes
useEffect(() => {
  if (!match) return;
  const teams = [match.home_team, match.away_team].filter(Boolean);
  
  teams.forEach(async (team) => {
    if (team && !team.logo_url && team.name) {
      try {
        const result = await autoFetchTeamLogo(team.name);
        if (result) {
          await apiClient.updateTeam(team.id, { logo_url: result.logoUrl });
          queryClient.invalidateQueries({ queryKey: ['match-details'] });
          queryClient.invalidateQueries({ queryKey: ['teams'] });
        }
      } catch (err) {
        console.warn(`[AutoLogo] Falha ao buscar logo para ${team.name}:`, err);
      }
    }
  });
}, [match?.home_team?.id, match?.away_team?.id]);
```

Como `useMatchDetails` retorna apenas dados (useQuery), sera necessario converter para um hook customizado que combine `useQuery` + `useEffect` + `useQueryClient`. O hook ja e customizado, entao basta adicionar o efeito dentro dele ou criar um wrapper.

### Alternativa mais limpa: Hook separado `useAutoTeamLogos`

Criar um novo hook `src/hooks/useAutoTeamLogos.ts` que:
- Recebe a lista de times da partida
- Verifica quais nao tem logo
- Busca e atualiza em background
- Usa um Set local para evitar buscas duplicadas durante a sessao

Este hook seria chamado nos componentes que exibem dados da partida (MatchDashboard, Events, etc).

### Abordagem escolhida: Hook separado

Cria `useAutoTeamLogos` e adiciona nos componentes principais:
- `src/pages/MatchDashboard.tsx`
- `src/pages/Events.tsx`

## Resumo

| O que | Como |
|-------|------|
| Novo hook | `useAutoTeamLogos.ts` - busca logos em background |
| MatchDashboard | Chama `useAutoTeamLogos` com times da partida |
| Events | Chama `useAutoTeamLogos` com times da partida |
| Nenhuma mudanca no backend | Reutiliza `autoFetchTeamLogo` + `apiClient.updateTeam` |
| Protecao contra duplicatas | Set local evita buscas repetidas na mesma sessao |
