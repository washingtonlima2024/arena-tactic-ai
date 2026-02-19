
# Problema: 2º Tempo Sempre Mostra 45 Minutos de Duração

## Causa Raiz

O problema ocorre em **duas camadas independentes**, ambas usando valores hardcoded de 45 minutos ao invés da duração real do vídeo.

### Camada 1 — Backend Python (server.py)

Em 3 pontos diferentes do `server.py` (linhas 1278-1279, 1370-1371 e 1445-1446), o registro de vídeo é criado com `end_minute` **fixo em 45 para primeiro tempo e 90 para segundo tempo**, sem levar em conta a duração real detectada pelo `ffprobe`:

```text
# PROBLEMA: end_minute hardcoded — ignora duração real do vídeo
start_minute=0 if video_type in ['first_half', 'full'] else 45,
end_minute=45 if video_type == 'first_half' else 90  ← sempre 45 ou 90
```

O `duration_seconds` é detectado corretamente via ffprobe logo acima, mas não é usado para calcular o `end_minute` correto.

### Camada 2 — Frontend (Upload.tsx)

Quando o usuário faz upload de um arquivo pelo frontend, o `endMinute` do segmento é fixado em 45 ou 90 no momento da criação do segmento (linhas 947-950). O código detecta a duração real via `detectVideoDuration()` de forma assíncrona (linha 483), mas **nunca atualiza `endMinute`** com base na duração detectada — só atualiza `durationSeconds`.

```text
// O durationSeconds é atualizado...
s.id === segmentId ? { ...s, durationSeconds: duration || null } : s
// ...mas endMinute permanece em 45 ou 90 fixos
```

### Impacto

- Badge de duração mostra "45min" mesmo para vídeos de 48 ou 50 minutos
- O `end_minute` salvo no banco é sempre 45 ou 90, não reflete acréscimos
- A análise de IA usa `gameEndMinute` baseado nesse valor, potencialmente truncando eventos dos acréscimos

## Solução

### Mudança 1 — Backend: Calcular end_minute pela duração real (server.py)

Em todos os 3 pontos onde o Video é criado, substituir o `end_minute` hardcoded por um cálculo baseado na duração real do vídeo detectada pelo ffprobe:

```text
# ANTES:
start_minute=0 if video_type in ['first_half', 'full'] else 45,
end_minute=45 if video_type == 'first_half' else 90

# DEPOIS:
start_minute_val = 0 if video_type in ['first_half', 'full'] else 45
duration_minutes = round(duration_seconds / 60) if duration_seconds else None
end_minute_val = (start_minute_val + duration_minutes) if duration_minutes else (45 if video_type != 'second_half' else 90)
start_minute=start_minute_val,
end_minute=end_minute_val
```

Por exemplo: um segundo tempo de 47 minutos (com acréscimos) terá `start_minute=45, end_minute=92`.

### Mudança 2 — Frontend: Atualizar endMinute após detectar duração (Upload.tsx)

No callback da detecção de duração (linha 483), além de atualizar `durationSeconds`, também recalcular e atualizar `endMinute`:

```text
// ANTES:
detectVideoDuration(file).then(duration => {
  setSegments(prev => 
    prev.map(s => 
      s.id === segmentId ? { ...s, durationSeconds: duration || null } : s
    )
  );
});

// DEPOIS:
detectVideoDuration(file).then(duration => {
  if (!duration) return;
  setSegments(prev => 
    prev.map(s => {
      if (s.id !== segmentId) return s;
      const durationMinutes = Math.round(duration / 60);
      const newEndMinute = (s.startMinute ?? 0) + durationMinutes;
      return { ...s, durationSeconds: duration, endMinute: newEndMinute };
    })
  );
});
```

## Arquivos Afetados

| Arquivo | Linhas | Mudança |
|---|---|---|
| `video-processor/server.py` | 1278-1279, 1370-1371, 1445-1446 | Calcular end_minute pela duração real do vídeo |
| `src/pages/Upload.tsx` | ~483-488 | Atualizar endMinute ao detectar duração do arquivo |

## Resultado

| Cenário | Antes | Depois |
|---|---|---|
| 2º tempo com 47 min (acréscimos) | end_minute=90, badge "45min" | end_minute=92, badge "47min" |
| 1º tempo com 48 min | end_minute=45, badge "48min" mas salva errado | end_minute=48, correto |
| Badge de duração na UI | Sempre 45min para 2T | Duração real detectada |
| Análise de IA | Trunca acréscimos | Inclui eventos dos acréscimos corretamente |
