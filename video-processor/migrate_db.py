"""
Arena Play - Script de Migração Automática do SQLite
Verifica e adiciona colunas faltantes ao banco de dados para manter
sincronização com os modelos SQLAlchemy.
"""
import sqlite3
import os

DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'arena_play.db')

# Lista de migrações pendentes
# Cada migração define uma coluna que deve existir em uma tabela
MIGRATIONS = [
    # Match events
    {
        'table': 'match_events',
        'column': 'clip_pending',
        'type': 'BOOLEAN',
        'default': '1'
    },
    {
        'table': 'match_events',
        'column': 'event_metadata',
        'type': 'TEXT',
        'default': "'{}'"
    },
    # TranscriptionJob columns
    {
        'table': 'transcription_jobs',
        'column': 'video_path',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'transcription_jobs',
        'column': 'chunk_results',
        'type': 'TEXT',
        'default': "'[]'"
    },
    {
        'table': 'transcription_jobs',
        'column': 'stage',
        'type': 'TEXT',
        'default': "'queued'"
    },
    {
        'table': 'transcription_jobs',
        'column': 'chunk_duration_seconds',
        'type': 'INTEGER',
        'default': '10'
    },
    {
        'table': 'transcription_jobs',
        'column': 'manifest_path',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'transcription_jobs',
        'column': 'chunks_dir',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'transcription_jobs',
        'column': 'media_prepared',
        'type': 'BOOLEAN',
        'default': '0'
    },
    # User - approval system
    {
        'table': 'users',
        'column': 'is_approved',
        'type': 'BOOLEAN',
        'default': '0'
    },
    # Profile - new fields for complete registration
    {
        'table': 'profiles',
        'column': 'phone',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'profiles',
        'column': 'cpf_cnpj',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'profiles',
        'column': 'address_cep',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'profiles',
        'column': 'address_street',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'profiles',
        'column': 'address_number',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'profiles',
        'column': 'address_complement',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'profiles',
        'column': 'address_neighborhood',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'profiles',
        'column': 'address_city',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'profiles',
        'column': 'address_state',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'profiles',
        'column': 'credits_balance',
        'type': 'INTEGER',
        'default': '0'
    },
    {
        'table': 'profiles',
        'column': 'organization_id',
        'type': 'TEXT',
        'default': 'NULL'
    },
    # Video dual-quality system (proxy for processing, original for export)
    {
        'table': 'videos',
        'column': 'original_url',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'videos',
        'column': 'proxy_url',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'videos',
        'column': 'proxy_status',
        'type': 'TEXT',
        'default': "'pending'"
    },
    {
        'table': 'videos',
        'column': 'proxy_progress',
        'type': 'INTEGER',
        'default': '0'
    },
    {
        'table': 'videos',
        'column': 'original_size_bytes',
        'type': 'INTEGER',
        'default': 'NULL'
    },
    {
        'table': 'videos',
        'column': 'proxy_size_bytes',
        'type': 'INTEGER',
        'default': 'NULL'
    },
    {
        'table': 'videos',
        'column': 'proxy_resolution',
        'type': 'TEXT',
        'default': "'480p'"
    },
    {
        'table': 'videos',
        'column': 'original_resolution',
        'type': 'TEXT',
        'default': 'NULL'
    },
    # Upload Jobs - chunked upload system
    {
        'table': 'upload_jobs',
        'column': 'match_id',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'upload_jobs',
        'column': 'original_filename',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'upload_jobs',
        'column': 'file_extension',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'upload_jobs',
        'column': 'file_type',
        'type': 'TEXT',
        'default': "'video'"
    },
    {
        'table': 'upload_jobs',
        'column': 'total_size_bytes',
        'type': 'INTEGER',
        'default': '0'
    },
    {
        'table': 'upload_jobs',
        'column': 'chunk_size_bytes',
        'type': 'INTEGER',
        'default': '8388608'
    },
    {
        'table': 'upload_jobs',
        'column': 'total_chunks',
        'type': 'INTEGER',
        'default': '1'
    },
    {
        'table': 'upload_jobs',
        'column': 'received_chunks',
        'type': 'TEXT',
        'default': "'[]'"
    },
    {
        'table': 'upload_jobs',
        'column': 'chunks_dir',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'upload_jobs',
        'column': 'status',
        'type': 'TEXT',
        'default': "'uploading'"
    },
    {
        'table': 'upload_jobs',
        'column': 'stage',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'upload_jobs',
        'column': 'progress',
        'type': 'INTEGER',
        'default': '0'
    },
    {
        'table': 'upload_jobs',
        'column': 'current_step',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'upload_jobs',
        'column': 'error_message',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'upload_jobs',
        'column': 'conversion_progress',
        'type': 'INTEGER',
        'default': '0'
    },
    {
        'table': 'upload_jobs',
        'column': 'output_path',
        'type': 'TEXT',
        'default': 'NULL'
    },
    {
        'table': 'upload_jobs',
        'column': 'transcription_segment_current',
        'type': 'INTEGER',
        'default': '0'
    },
    {
        'table': 'upload_jobs',
        'column': 'transcription_segment_total',
        'type': 'INTEGER',
        'default': '0'
    },
    {
        'table': 'upload_jobs',
        'column': 'transcription_progress',
        'type': 'INTEGER',
        'default': '0'
    },
    {
        'table': 'upload_jobs',
        'column': 'events_log',
        'type': 'TEXT',
        'default': "'[]'"
    },
]


def create_upload_jobs_table():
    """Create upload_jobs table if it doesn't exist."""
    if not os.path.exists(DATABASE_PATH):
        return
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS upload_jobs (
                id TEXT PRIMARY KEY,
                match_id TEXT,
                original_filename TEXT,
                file_extension TEXT,
                file_type TEXT DEFAULT 'video',
                total_size_bytes INTEGER DEFAULT 0,
                chunk_size_bytes INTEGER DEFAULT 8388608,
                total_chunks INTEGER DEFAULT 1,
                received_chunks TEXT DEFAULT '[]',
                chunks_dir TEXT,
                status TEXT DEFAULT 'uploading',
                stage TEXT,
                progress INTEGER DEFAULT 0,
                current_step TEXT,
                error_message TEXT,
                upload_speed_bytes_per_sec INTEGER,
                estimated_time_remaining_sec INTEGER,
                needs_conversion BOOLEAN DEFAULT 0,
                conversion_progress INTEGER DEFAULT 0,
                output_path TEXT,
                transcription_segment_current INTEGER DEFAULT 0,
                transcription_segment_total INTEGER DEFAULT 0,
                transcription_progress INTEGER DEFAULT 0,
                srt_path TEXT,
                txt_path TEXT,
                events_log TEXT DEFAULT '[]',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                started_at TEXT,
                completed_at TEXT,
                paused_at TEXT
            )
        ''')
        conn.commit()
        print("  ✓ Tabela upload_jobs verificada/criada")
    except Exception as e:
        print(f"  ⚠ Erro ao criar upload_jobs: {e}")
    finally:
        conn.close()


def create_profiles_table():
    """Create profiles table if it doesn't exist."""
    if not os.path.exists(DATABASE_PATH):
        return
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                user_id TEXT UNIQUE,
                email TEXT,
                display_name TEXT,
                avatar_url TEXT,
                phone TEXT,
                cpf_cnpj TEXT,
                address_cep TEXT,
                address_street TEXT,
                address_number TEXT,
                address_complement TEXT,
                address_neighborhood TEXT,
                address_city TEXT,
                address_state TEXT,
                credits_balance INTEGER DEFAULT 0,
                credits_monthly_quota INTEGER DEFAULT 10,
                organization_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        print("  ✓ Tabela profiles verificada/criada")
    except Exception as e:
        print(f"  ⚠ Erro ao criar profiles: {e}")
    finally:
        conn.close()


def create_transcription_jobs_table():
    """Create transcription_jobs table if it doesn't exist."""
    if not os.path.exists(DATABASE_PATH):
        return
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS transcription_jobs (
                id TEXT PRIMARY KEY,
                match_id TEXT,
                video_id TEXT,
                video_path TEXT,
                status TEXT DEFAULT 'queued',
                progress INTEGER DEFAULT 0,
                current_step TEXT,
                error_message TEXT,
                stage TEXT DEFAULT 'queued',
                total_chunks INTEGER DEFAULT 1,
                completed_chunks INTEGER DEFAULT 0,
                chunk_results TEXT DEFAULT '[]',
                chunk_duration_seconds INTEGER DEFAULT 10,
                manifest_path TEXT,
                chunks_dir TEXT,
                media_prepared BOOLEAN DEFAULT 0,
                srt_content TEXT,
                plain_text TEXT,
                provider_used TEXT,
                started_at TEXT,
                completed_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        print("  ✓ Tabela transcription_jobs verificada/criada")
    except Exception as e:
        print(f"  ⚠ Erro ao criar transcription_jobs: {e}")
    finally:
        conn.close()


# Execute table creation on import
create_profiles_table()
create_transcription_jobs_table()
create_upload_jobs_table()


def force_add_column_if_missing():
    """
    Força a adição de colunas críticas que podem estar faltando.
    Executa antes do SQLAlchemy para evitar erros de inicialização.
    """
    if not os.path.exists(DATABASE_PATH):
        return
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Verificar se tabela match_events existe
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='match_events'")
    if not cursor.fetchone():
        conn.close()
        return
    
    # Verificar colunas existentes
    cursor.execute('PRAGMA table_info(match_events)')
    columns = [col[1] for col in cursor.fetchall()]
    
    # Adicionar clip_pending se não existir
    if 'clip_pending' not in columns:
        try:
            cursor.execute('ALTER TABLE match_events ADD COLUMN clip_pending BOOLEAN DEFAULT 1')
            print("  ✓ Coluna clip_pending adicionada à tabela match_events")
        except Exception as e:
            print(f"  ⚠ Aviso ao adicionar clip_pending: {e}")
    
    # Adicionar event_metadata se não existir
    if 'event_metadata' not in columns:
        try:
            cursor.execute("ALTER TABLE match_events ADD COLUMN event_metadata TEXT DEFAULT '{}'")
            print("  ✓ Coluna event_metadata adicionada à tabela match_events")
        except Exception as e:
            print(f"  ⚠ Aviso ao adicionar event_metadata: {e}")
    
    conn.commit()
    conn.close()


# Executar migração forçada imediatamente ao importar o módulo
force_add_column_if_missing()


def run_migrations():
    """
    Executa migrações pendentes no banco SQLite.
    Verifica se cada coluna existe e adiciona se necessário.
    """
    if not os.path.exists(DATABASE_PATH):
        print("⚠ Banco de dados não existe ainda. Será criado na inicialização.")
        return
    
    print("\n" + "=" * 50)
    print("🔄 Verificando migrações do banco de dados...")
    print("=" * 50)
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    migrations_applied = 0
    
    for migration in MIGRATIONS:
        table = migration['table']
        column = migration['column']
        col_type = migration['type']
        default = migration.get('default', 'NULL')
        
        try:
            # Verificar se a tabela existe
            cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
            if not cursor.fetchone():
                print(f"  ⚠ Tabela '{table}' não existe - pulando migração")
                continue
            
            # Verificar colunas existentes
            cursor.execute(f'PRAGMA table_info({table})')
            columns = [col[1] for col in cursor.fetchall()]
            
            if column not in columns:
                sql = f'ALTER TABLE {table} ADD COLUMN {column} {col_type} DEFAULT {default}'
                cursor.execute(sql)
                print(f"  ✓ Migração aplicada: {table}.{column} ({col_type})")
                migrations_applied += 1
            else:
                print(f"  • Coluna já existe: {table}.{column}")
                
        except Exception as e:
            print(f"  ✗ Erro na migração {table}.{column}: {e}")
    
    conn.commit()
    conn.close()
    
    if migrations_applied > 0:
        print(f"\n✓ {migrations_applied} migração(ões) aplicada(s) com sucesso!")
    else:
        print("\n✓ Banco de dados está atualizado.")
    
    print("=" * 50 + "\n")


def check_schema():
    """
    Exibe o schema atual das tabelas principais para diagnóstico.
    """
    if not os.path.exists(DATABASE_PATH):
        print("Banco de dados não encontrado.")
        return
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    tables = ['matches', 'match_events', 'videos', 'teams', 'players']
    
    print("\n" + "=" * 50)
    print("📊 Schema atual do banco de dados")
    print("=" * 50)
    
    for table in tables:
        cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
        if cursor.fetchone():
            cursor.execute(f'PRAGMA table_info({table})')
            columns = cursor.fetchall()
            print(f"\n{table}:")
            for col in columns:
                print(f"  - {col[1]} ({col[2]}){' [PK]' if col[5] else ''}{' NOT NULL' if col[3] else ''}")
        else:
            print(f"\n{table}: (não existe)")
    
    conn.close()
    print("\n" + "=" * 50)


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == '--check':
        check_schema()
    else:
        run_migrations()
