"""
Script de migração de storage antigo (por bucket) para nova estrutura (por partida).

Estrutura antiga:
  storage/
    match-videos/
    event-clips/
    generated-audio/
    thumbnails/

Nova estrutura:
  storage/
    {match_id}/
      videos/
      clips/
      images/
      audio/
      texts/
      srt/
      json/

Uso:
  python migrate_storage.py                    # Migra todos os arquivos
  python migrate_storage.py --dry-run          # Simula migração sem mover arquivos
  python migrate_storage.py --match abc123     # Migra apenas arquivos de uma partida
"""

import os
import re
import shutil
import argparse
import json
from pathlib import Path
from datetime import datetime
from database import get_session
from models import Match, MatchEvent, Video, GeneratedAudio, Thumbnail

# Diretório base de storage
STORAGE_DIR = Path(os.path.dirname(__file__)) / 'storage'

# Mapeamento de buckets antigos para subfolders novos
BUCKET_TO_SUBFOLDER = {
    'match-videos': 'videos',
    'event-clips': 'clips',
    'generated-audio': 'audio',
    'thumbnails': 'images',
    'smart-editor': 'videos',
    'vignettes': 'videos'
}

# Subfolders da nova estrutura
NEW_SUBFOLDERS = ['videos', 'clips', 'images', 'audio', 'texts', 'srt', 'json']


def get_all_matches():
    """Obtém todos os match IDs do banco de dados."""
    session = get_session()
    try:
        matches = session.query(Match).all()
        return {m.id: m for m in matches}
    finally:
        session.close()


def get_match_id_from_filename(filename: str, bucket: str) -> str | None:
    """
    Tenta extrair o match_id do nome do arquivo.
    Padrões comuns:
    - {match_id}.mp4
    - {match_id}_first_half.mp4
    - {match_id}_second_half.mp4
    - live-{match_id}.mp4
    - {match_id}/{event_id}.mp4
    - {event_id}.mp4 (precisa buscar no banco)
    """
    # Padrão: live-{match_id}
    if filename.startswith('live-'):
        parts = filename.replace('live-', '').split('_')[0].split('.')[0]
        if is_uuid(parts):
            return parts
    
    # Padrão: {match_id}_first_half ou {match_id}_second_half
    for suffix in ['_first_half', '_second_half', '_full']:
        if suffix in filename:
            match_id = filename.split(suffix)[0]
            if is_uuid(match_id):
                return match_id
    
    # Padrão: {uuid}.ext (pode ser match_id ou event_id)
    base_name = Path(filename).stem
    if is_uuid(base_name):
        return base_name
    
    return None


def is_uuid(s: str) -> bool:
    """Verifica se string parece um UUID."""
    uuid_pattern = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$', re.I)
    return bool(uuid_pattern.match(s))


def get_event_match_id(event_id: str) -> str | None:
    """Busca o match_id de um evento no banco de dados."""
    session = get_session()
    try:
        event = session.query(MatchEvent).filter_by(id=event_id).first()
        return event.match_id if event else None
    finally:
        session.close()


def get_video_match_id(video_id: str) -> str | None:
    """Busca o match_id de um vídeo no banco de dados."""
    session = get_session()
    try:
        video = session.query(Video).filter_by(id=video_id).first()
        return video.match_id if video else None
    finally:
        session.close()


def get_audio_match_id(audio_id: str) -> str | None:
    """Busca o match_id de um áudio no banco de dados."""
    session = get_session()
    try:
        audio = session.query(GeneratedAudio).filter_by(id=audio_id).first()
        return audio.match_id if audio else None
    finally:
        session.close()


def get_thumbnail_match_id(thumbnail_id: str) -> str | None:
    """Busca o match_id de uma thumbnail no banco de dados."""
    session = get_session()
    try:
        thumb = session.query(Thumbnail).filter_by(id=thumbnail_id).first()
        return thumb.match_id if thumb else None
    finally:
        session.close()


def resolve_match_id(filename: str, bucket: str, matches: dict) -> str | None:
    """
    Resolve o match_id para um arquivo.
    Tenta múltiplas estratégias.
    """
    # Tenta extrair do nome do arquivo
    match_id = get_match_id_from_filename(filename, bucket)
    
    if match_id:
        # Verifica se é um match_id válido
        if match_id in matches:
            return match_id
        
        # Pode ser um event_id, video_id, etc - busca no banco
        if bucket == 'event-clips':
            db_match_id = get_event_match_id(match_id)
            if db_match_id:
                return db_match_id
        elif bucket == 'match-videos':
            db_match_id = get_video_match_id(match_id)
            if db_match_id:
                return db_match_id
        elif bucket == 'generated-audio':
            db_match_id = get_audio_match_id(match_id)
            if db_match_id:
                return db_match_id
        elif bucket == 'thumbnails':
            db_match_id = get_thumbnail_match_id(match_id)
            if db_match_id:
                return db_match_id
    
    return None


def create_match_folders(match_id: str):
    """Cria a estrutura de pastas para uma partida."""
    match_dir = STORAGE_DIR / match_id
    match_dir.mkdir(exist_ok=True)
    
    for subfolder in NEW_SUBFOLDERS:
        (match_dir / subfolder).mkdir(exist_ok=True)
    
    return match_dir


def migrate_file(source_path: Path, match_id: str, subfolder: str, dry_run: bool = False) -> dict:
    """
    Move um arquivo para a nova estrutura.
    Retorna informações sobre a migração.
    """
    dest_dir = STORAGE_DIR / match_id / subfolder
    dest_path = dest_dir / source_path.name
    
    result = {
        'source': str(source_path),
        'destination': str(dest_path),
        'match_id': match_id,
        'subfolder': subfolder,
        'size': source_path.stat().st_size,
        'migrated': False,
        'error': None
    }
    
    if dry_run:
        result['dry_run'] = True
        return result
    
    try:
        # Cria estrutura de pastas se não existir
        create_match_folders(match_id)
        
        # Move o arquivo
        shutil.move(str(source_path), str(dest_path))
        result['migrated'] = True
        
    except Exception as e:
        result['error'] = str(e)
    
    return result


def scan_old_buckets() -> dict:
    """
    Escaneia os buckets antigos e retorna lista de arquivos.
    """
    files_by_bucket = {}
    
    for bucket_name in BUCKET_TO_SUBFOLDER.keys():
        bucket_path = STORAGE_DIR / bucket_name
        if not bucket_path.exists():
            continue
        
        files = []
        for file_path in bucket_path.rglob('*'):
            if file_path.is_file():
                files.append({
                    'path': file_path,
                    'name': file_path.name,
                    'relative': str(file_path.relative_to(bucket_path)),
                    'size': file_path.stat().st_size
                })
        
        if files:
            files_by_bucket[bucket_name] = files
    
    return files_by_bucket


def run_migration(dry_run: bool = False, target_match: str = None, verbose: bool = True):
    """
    Executa a migração completa.
    """
    print("=" * 60)
    print("MIGRAÇÃO DE STORAGE - Arena Play")
    print("=" * 60)
    print(f"Modo: {'SIMULAÇÃO (dry-run)' if dry_run else 'EXECUÇÃO REAL'}")
    print(f"Storage: {STORAGE_DIR}")
    print()
    
    # Carrega matches do banco
    print("Carregando partidas do banco de dados...")
    matches = get_all_matches()
    print(f"  {len(matches)} partidas encontradas")
    print()
    
    # Escaneia buckets antigos
    print("Escaneando buckets antigos...")
    files_by_bucket = scan_old_buckets()
    
    total_files = sum(len(files) for files in files_by_bucket.values())
    print(f"  {total_files} arquivos encontrados em {len(files_by_bucket)} buckets")
    print()
    
    if not files_by_bucket:
        print("Nenhum arquivo para migrar nos buckets antigos.")
        return
    
    # Resultados da migração
    results = {
        'migrated': [],
        'skipped': [],
        'errors': [],
        'unmatched': []
    }
    
    # Processa cada bucket
    for bucket_name, files in files_by_bucket.items():
        subfolder = BUCKET_TO_SUBFOLDER[bucket_name]
        print(f"\n📁 Bucket: {bucket_name} -> {subfolder}")
        print(f"   {len(files)} arquivos")
        
        for file_info in files:
            file_path = file_info['path']
            filename = file_info['name']
            
            # Resolve match_id
            match_id = resolve_match_id(filename, bucket_name, matches)
            
            if not match_id:
                results['unmatched'].append({
                    'file': str(file_path),
                    'bucket': bucket_name,
                    'reason': 'Could not determine match_id'
                })
                if verbose:
                    print(f"   ⚠️  {filename} - match_id não identificado")
                continue
            
            # Filtra por match específico se solicitado
            if target_match and match_id != target_match:
                results['skipped'].append({
                    'file': str(file_path),
                    'match_id': match_id,
                    'reason': 'Filtered by target_match'
                })
                continue
            
            # Migra o arquivo
            result = migrate_file(file_path, match_id, subfolder, dry_run)
            
            if result.get('error'):
                results['errors'].append(result)
                if verbose:
                    print(f"   ❌ {filename} -> {match_id}/{subfolder}/ - ERRO: {result['error']}")
            else:
                results['migrated'].append(result)
                if verbose:
                    status = "🔄" if dry_run else "✅"
                    print(f"   {status} {filename} -> {match_id}/{subfolder}/")
    
    # Resumo
    print("\n" + "=" * 60)
    print("RESUMO DA MIGRAÇÃO")
    print("=" * 60)
    print(f"✅ Migrados:     {len(results['migrated'])}")
    print(f"⏭️  Ignorados:    {len(results['skipped'])}")
    print(f"⚠️  Sem match_id: {len(results['unmatched'])}")
    print(f"❌ Erros:        {len(results['errors'])}")
    
    # Tamanho total migrado
    total_size = sum(r['size'] for r in results['migrated'])
    print(f"\n📊 Tamanho total: {total_size / (1024*1024):.2f} MB")
    
    # Salva log
    log_file = STORAGE_DIR / f"migration_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(log_file, 'w') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'dry_run': dry_run,
            'target_match': target_match,
            'summary': {
                'migrated': len(results['migrated']),
                'skipped': len(results['skipped']),
                'unmatched': len(results['unmatched']),
                'errors': len(results['errors']),
                'total_size': total_size
            },
            'details': {
                'migrated': results['migrated'],
                'unmatched': results['unmatched'],
                'errors': results['errors']
            }
        }, f, indent=2, default=str)
    
    print(f"\n📝 Log salvo em: {log_file}")
    
    # Limpeza de buckets vazios
    if not dry_run and results['migrated']:
        print("\n🧹 Verificando buckets vazios para limpeza...")
        for bucket_name in files_by_bucket.keys():
            bucket_path = STORAGE_DIR / bucket_name
            if bucket_path.exists():
                remaining = list(bucket_path.rglob('*'))
                if not any(f.is_file() for f in remaining):
                    shutil.rmtree(bucket_path)
                    print(f"   🗑️  Bucket '{bucket_name}' removido (vazio)")
                else:
                    count = sum(1 for f in remaining if f.is_file())
                    print(f"   📁 Bucket '{bucket_name}' mantido ({count} arquivos restantes)")
    
    return results


def cleanup_empty_buckets():
    """Remove buckets antigos vazios."""
    print("Limpando buckets antigos vazios...")
    
    for bucket_name in BUCKET_TO_SUBFOLDER.keys():
        bucket_path = STORAGE_DIR / bucket_name
        if bucket_path.exists():
            files = list(bucket_path.rglob('*'))
            if not any(f.is_file() for f in files):
                shutil.rmtree(bucket_path)
                print(f"  ✅ Removido: {bucket_name}")
            else:
                count = sum(1 for f in files if f.is_file())
                print(f"  ⏭️  Mantido: {bucket_name} ({count} arquivos)")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Migra storage de buckets para estrutura por partida')
    parser.add_argument('--dry-run', action='store_true', help='Simula migração sem mover arquivos')
    parser.add_argument('--match', type=str, help='Migra apenas arquivos de uma partida específica')
    parser.add_argument('--quiet', action='store_true', help='Mostra apenas resumo')
    parser.add_argument('--cleanup', action='store_true', help='Apenas limpa buckets vazios')
    
    args = parser.parse_args()
    
    if args.cleanup:
        cleanup_empty_buckets()
    else:
        run_migration(
            dry_run=args.dry_run,
            target_match=args.match,
            verbose=not args.quiet
        )
