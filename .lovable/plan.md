
# Corrigir Exibição de Nomes e Escudos dos Times nos Eventos

## Problema Identificado

No componente `EventRow` (src/pages/Events.tsx, linhas 141-149), os nomes e escudos dos times so aparecem quando `teamLogo` nao e null. Quando o time nao tem logo (como "Time Casa" e "Time Visitante" nesta partida), o codigo cai no `else` e mostra apenas o icone de aprovacao -- sem nenhuma indicacao do time.

```text
Logica atual:
  teamLogo existe? → Mostra Avatar com logo + fallback de iniciais
  teamLogo null?   → Mostra icone de aprovacao (sem nome do time)
```

O `teamName` e calculado na linha 110 mas nunca e exibido fora do bloco condicional do logo.

## Solucao

Modificar o `EventRow` em `src/pages/Events.tsx` para **sempre mostrar o badge do time** (nome + escudo/iniciais), independente de ter logo ou nao.

### Mudanca no EventRow (linhas 141-149)

Substituir a logica condicional por um bloco que sempre mostra o time:

```text
ANTES:
  Se tem logo → Avatar com imagem
  Senao → Icone de aprovacao

DEPOIS:
  Se tem logo → Avatar com imagem + nome do time
  Se nao tem logo mas tem teamName → Circulo com iniciais + nome do time
  Senao → Icone de aprovacao (fallback)
```

O novo codigo tera:
1. Um Avatar que mostra a imagem do logo quando disponivel, ou as iniciais do time como fallback
2. O nome curto do time (short_name ou primeiras 3 letras) sempre visivel ao lado
3. O icone de aprovacao so aparece quando nao ha informacao de time

### Arquivo Afetado

| Arquivo | Mudanca |
|---|---|
| src/pages/Events.tsx | Modificar linhas 141-149 do EventRow para sempre exibir nome/badge do time quando disponivel |

## Resultado Esperado

| Cenario | Antes | Depois |
|---|---|---|
| Time com logo | Mostra avatar com logo | Mostra avatar com logo + nome |
| Time sem logo (ex: "Time Casa") | Mostra apenas icone de aprovacao | Mostra circulo com iniciais + nome "TC" |
| Evento sem time identificado | Mostra icone de aprovacao | Sem mudanca |
