
# Correção do Placar: Suporte a Gol Contra

## Problema Identificado

O placar entre **Botafogo e Novorizontino** está incorreto porque houve um **gol contra** que não está sendo contabilizado corretamente. O sistema:

1. **Detecta** gols contra corretamente via palavras-chave ("contra", "próprio gol") durante a análise
2. **Calcula** o placar corretamente quando `metadata.isOwnGoal = true`  
3. **Mas não permite** editar/corrigir esse campo manualmente no diálogo de edição

Quando a detecção automática falha em marcar `isOwnGoal`, o gol é atribuído ao time errado e **não há forma de corrigir via interface**.

---

## Solução Proposta

### Adicionar Checkbox "Gol Contra" no Diálogo de Edição

Modificar o componente `EventEditDialog.tsx` para incluir uma opção visível de "Gol Contra" que:
- Aparece apenas quando o tipo de evento for "goal"
- Salva o campo `metadata.isOwnGoal = true`
- Permite corrigir manualmente gols que foram detectados incorretamente

---

## Detalhes Técnicos

### Arquivo: `src/components/events/EventEditDialog.tsx`

**Alterações:**

1. **Novo estado** para controlar o checkbox:
   ```typescript
   const [isOwnGoal, setIsOwnGoal] = useState(false);
   ```

2. **Carregar valor existente** no `useEffect`:
   ```typescript
   setIsOwnGoal(event.metadata?.isOwnGoal || false);
   ```

3. **Novo campo de UI** (após seletor de Time, somente para gols):
   ```text
   ┌─────────────────────────────────────────────────┐
   │ ☑ Gol Contra                                    │
   │   Marque se foi gol contra (beneficia o outro   │
   │   time)                                         │
   └─────────────────────────────────────────────────┘
   ```

4. **Salvar no metadata** ao criar/editar:
   ```typescript
   metadata: { 
     team, 
     player: playerName || undefined,
     isOwnGoal,  // ← Novo campo
     // ... outros
   }
   ```

---

## Fluxo de Correção

1. Usuário abre a página de Eventos
2. Clica no gol incorreto para editar
3. Marca a checkbox "Gol Contra"
4. Salva → O placar é recalculado automaticamente via `syncMatchScoreFromEvents`
5. O placar no header reflete a correção

---

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/events/EventEditDialog.tsx` | Adicionar checkbox para `isOwnGoal` |

---

## Benefícios

- Correção manual de gols contra mal detectados
- Interface intuitiva para o usuário
- Placar atualiza automaticamente após salvar
- Sem impacto em outras funcionalidades
