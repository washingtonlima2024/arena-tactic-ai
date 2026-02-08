

# Correcao: Fallback por Keywords no Pipeline Kakttus

## Problema

O pipeline Kakttus em `video-processor/ai_services.py` (linha 5057-5277) aceita qualquer quantidade de eventos como sucesso e retorna imediatamente. Quando o modelo retorna apenas 2 gols, o sistema para por ali sem buscar outros eventos (cartoes, penaltis, substituicoes) que existem na transcricao.

O pipeline Ollama (linhas 4751-4835) ja tem essa logica de fallback funcionando corretamente.

## Causa Raiz

```text
Linha 5057:  if events:           --> Se tem 1+ eventos, pula direto pro return
Linha 5277:      return final_events  --> Retorna sem verificar se < 3 eventos
```

Nao existe bloco `else` para quando `events` esta vazio, e nao existe verificacao de quantidade minima.

## Solucao

Reestruturar o fluxo do pipeline Kakttus para:

1. Manter o bloco `if events:` para enriquecimento e salvamento (linhas 5057-5276)
2. **Remover** o `return final_events` da linha 5277
3. Adicionar bloco `else: final_events = []` para quando nenhum evento e detectado
4. Adicionar verificacao `if len(final_events) < 3:` com fallback por keywords (mesma logica do Ollama)
5. Retornar `final_events` somente apos o fallback

## Detalhes Tecnicos

### Arquivo: `video-processor/ai_services.py`

**Mudanca 1** - Linha 5277: Remover o `return final_events` prematuro

De:
```python
                return final_events
```
Para: (remover esta linha completamente)

**Mudanca 2** - Apos o bloco `if events:` (apos linha 5276), adicionar `else` e fallback:

```python
            else:
                final_events = []
                print(f"[Kakttus] ⚠️ Nenhum evento extraído pela IA")

            # FALLBACK KAKTTUS: Se retornou poucos eventos, complementar com keywords
            if len(final_events) < 3:
                print(f"[Kakttus] ⚠️ Poucos eventos ({len(final_events)}), acionando fallback por keywords...")
                keyword_events = []

                if match_id:
                    try:
                        from storage import get_subfolder_path
                        srt_folder = get_subfolder_path(match_id, 'srt')
                        srt_files = list(srt_folder.glob('*.srt')) if srt_folder.exists() else []

                        print(f"[Kakttus] SRTs disponíveis: {[f.name for f in srt_files]}")
                        print(f"[Kakttus] Buscando SRT para tempo: {match_half}")

                        target_srt = None
                        if srt_files:
                            srt_patterns = [
                                f'{match_half}_half.srt',
                                f'{match_half}_transcription.srt',
                                f'{match_half}.srt',
                            ]
                            for pattern in srt_patterns:
                                for srt_file in srt_files:
                                    if pattern in srt_file.name.lower():
                                        target_srt = srt_file
                                        break
                                if target_srt:
                                    break
                            if not target_srt and len(srt_files) == 1:
                                target_srt = srt_files[0]

                        if target_srt:
                            print(f"[Kakttus] Usando SRT: {target_srt.name}")
                            keyword_events = detect_events_by_keywords(
                                srt_path=str(target_srt),
                                home_team=home_team,
                                away_team=away_team,
                                half=match_half,
                                segment_start_minute=game_start_minute
                            )
                        else:
                            print(f"[Kakttus] SRT não encontrado, usando texto bruto...")
                            keyword_events = detect_events_by_keywords_from_text(
                                transcription=transcription,
                                home_team=home_team,
                                away_team=away_team,
                                game_start_minute=game_start_minute,
                                video_duration=None
                            )
                    except Exception as e:
                        print(f"[Kakttus] Erro ao buscar SRT: {e}, usando texto bruto...")
                        keyword_events = detect_events_by_keywords_from_text(
                            transcription=transcription,
                            home_team=home_team,
                            away_team=away_team,
                            game_start_minute=game_start_minute,
                            video_duration=None
                        )
                else:
                    keyword_events = detect_events_by_keywords_from_text(
                        transcription=transcription,
                        home_team=home_team,
                        away_team=away_team,
                        game_start_minute=game_start_minute,
                        video_duration=None
                    )

                # Merge com deduplicação (mesma lógica do Ollama)
                for ke in keyword_events:
                    already_exists = any(
                        abs(e.get('minute', 0) - ke.get('minute', 0)) < 2
                        and e.get('event_type') == ke.get('event_type')
                        for e in final_events
                    )
                    if not already_exists:
                        final_events.append(ke)

                print(f"[Kakttus] Total após fallback: {len(final_events)} eventos")

            return final_events
```

## Estrutura Final do Fluxo

```text
analyze_with_kakttus() retorna events
    |
    +-- if events:
    |       Enriquecer timestamps (TXT -> SRT)
    |       Salvar JSONs
    |       final_events = deduplicate(events)
    |
    +-- else:
    |       final_events = []
    |
    +-- if len(final_events) < 3:     <-- NOVO
    |       Buscar SRT do tempo correto
    |       detect_events_by_keywords() ou detect_events_by_keywords_from_text()
    |       Merge com deduplicação (tolerância 2 min + mesmo event_type)
    |
    +-- return final_events
```

## Resumo das Alteracoes

| Linha | Acao | Descricao |
|---|---|---|
| 5277 | Remover | `return final_events` prematuro |
| 5276+ | Adicionar | Bloco `else: final_events = []` |
| 5276+ | Adicionar | Verificacao `if len(final_events) < 3:` com fallback por keywords |
| 5276+ | Adicionar | Merge com deduplicacao (mesma logica do Ollama linhas 4826-4835) |

**Nota**: Este arquivo esta no servidor local (`video-processor/ai_services.py`). Apos a alteracao, reiniciar com `pm2 restart arena-backend`.

