"""
SQLAlchemy models for Arena Play database.
100% Local SQLite storage - No cloud dependencies.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())


# ============================================================================
# LOCAL AUTHENTICATION MODELS
# ============================================================================

class User(Base):
    """Local user for authentication."""
    __tablename__ = 'users'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(255))
    is_active = Column(Boolean, default=True)
    is_approved = Column(Boolean, default=False)  # Requires SuperAdmin approval
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    roles = relationship('UserRole', back_populates='user', cascade='all, delete-orphan')
    sessions = relationship('UserSession', back_populates='user', cascade='all, delete-orphan')
    profile = relationship('Profile', back_populates='user', uselist=False, cascade='all, delete-orphan')
    
    def to_dict(self, include_email=True):
        result = {
            'id': self.id,
            'display_name': self.display_name,
            'is_active': self.is_active,
            'is_approved': self.is_approved,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        if include_email:
            result['email'] = self.email
        return result


class UserSession(Base):
    """User session for JWT token management."""
    __tablename__ = 'user_sessions'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    token = Column(String(500), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship('User', back_populates='sessions')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


# ============================================================================
# CORE MODELS
# ============================================================================

class Team(Base):
    __tablename__ = 'teams'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    short_name = Column(String(50))
    logo_url = Column(Text)
    primary_color = Column(String(20), default='#10b981')
    secondary_color = Column(String(20), default='#ffffff')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    home_matches = relationship('Match', foreign_keys='Match.home_team_id', back_populates='home_team')
    away_matches = relationship('Match', foreign_keys='Match.away_team_id', back_populates='away_team')
    players = relationship('Player', back_populates='team')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'short_name': self.short_name,
            'logo_url': self.logo_url,
            'primary_color': self.primary_color,
            'secondary_color': self.secondary_color,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Match(Base):
    __tablename__ = 'matches'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    home_team_id = Column(String(36), ForeignKey('teams.id'))
    away_team_id = Column(String(36), ForeignKey('teams.id'))
    home_score = Column(Integer, default=0)
    away_score = Column(Integer, default=0)
    competition = Column(String(255))
    match_date = Column(DateTime)
    venue = Column(String(255))
    status = Column(String(50), default='pending')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    home_team = relationship('Team', foreign_keys=[home_team_id], back_populates='home_matches')
    away_team = relationship('Team', foreign_keys=[away_team_id], back_populates='away_matches')
    events = relationship('MatchEvent', back_populates='match', cascade='all, delete-orphan')
    videos = relationship('Video', back_populates='match', cascade='all, delete-orphan')
    analysis_jobs = relationship('AnalysisJob', back_populates='match', cascade='all, delete-orphan')
    generated_audio = relationship('GeneratedAudio', back_populates='match', cascade='all, delete-orphan')
    thumbnails = relationship('Thumbnail', back_populates='match', cascade='all, delete-orphan')
    chatbot_conversations = relationship('ChatbotConversation', back_populates='match', cascade='all, delete-orphan')
    stream_configurations = relationship('StreamConfiguration', back_populates='match', cascade='all, delete-orphan')
    
    def to_dict(self, include_teams=False):
        result = {
            'id': self.id,
            'home_team_id': self.home_team_id,
            'away_team_id': self.away_team_id,
            'home_score': self.home_score,
            'away_score': self.away_score,
            'competition': self.competition,
            'match_date': self.match_date.isoformat() if self.match_date else None,
            'venue': self.venue,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        if include_teams:
            result['home_team'] = self.home_team.to_dict() if self.home_team else None
            result['away_team'] = self.away_team.to_dict() if self.away_team else None
        return result


class Player(Base):
    __tablename__ = 'players'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    team_id = Column(String(36), ForeignKey('teams.id'))
    name = Column(String(255), nullable=False)
    number = Column(Integer)
    position = Column(String(50))
    photo_url = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    team = relationship('Team', back_populates='players')
    events = relationship('MatchEvent', back_populates='player')
    
    def to_dict(self):
        return {
            'id': self.id,
            'team_id': self.team_id,
            'name': self.name,
            'number': self.number,
            'position': self.position,
            'photo_url': self.photo_url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class MatchEvent(Base):
    __tablename__ = 'match_events'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    match_id = Column(String(36), ForeignKey('matches.id'), nullable=False)
    player_id = Column(String(36), ForeignKey('players.id'))
    video_id = Column(String(36), ForeignKey('videos.id'))
    event_type = Column(String(50), nullable=False)
    description = Column(Text)
    minute = Column(Integer)
    second = Column(Integer)
    match_half = Column(String(20))
    position_x = Column(Float)
    position_y = Column(Float)
    is_highlight = Column(Boolean, default=False)
    clip_url = Column(Text)
    clip_pending = Column(Boolean, default=True)
    approval_status = Column(String(20), default='pending')
    approved_by = Column(String(36))
    approved_at = Column(DateTime)
    event_metadata = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    match = relationship('Match', back_populates='events')
    player = relationship('Player', back_populates='events')
    video = relationship('Video', back_populates='events')
    
    def to_dict(self):
        return {
            'id': self.id,
            'match_id': self.match_id,
            'player_id': self.player_id,
            'video_id': self.video_id,
            'event_type': self.event_type,
            'description': self.description,
            'minute': self.minute,
            'second': self.second,
            'match_half': self.match_half,
            'position_x': self.position_x,
            'position_y': self.position_y,
            'is_highlight': self.is_highlight,
            'clip_url': self.clip_url,
            'clip_pending': self.clip_pending,
            'approval_status': self.approval_status,
            'approved_by': self.approved_by,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'metadata': self.event_metadata,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Video(Base):
    __tablename__ = 'videos'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    match_id = Column(String(36), ForeignKey('matches.id'))
    file_url = Column(Text, nullable=False)
    file_name = Column(String(255))
    video_type = Column(String(50), default='full')
    status = Column(String(50), default='pending')
    duration_seconds = Column(Integer)
    start_minute = Column(Integer, default=0)
    end_minute = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Dual-quality system: original + proxy
    original_url = Column(Text)                          # URL/path to original high-quality video
    proxy_url = Column(Text)                             # URL/path to proxy (480p/360p) for processing
    proxy_status = Column(String(50), default='pending') # pending | converting | ready | error
    proxy_progress = Column(Integer, default=0)          # 0-100 conversion progress
    original_size_bytes = Column(Integer)                # Size of original file in bytes
    proxy_size_bytes = Column(Integer)                   # Size of proxy file in bytes
    proxy_resolution = Column(String(20), default='480p') # 480p | 360p | 720p_lite
    original_resolution = Column(String(20))             # e.g., 1080p, 4K
    
    # Relationships
    match = relationship('Match', back_populates='videos')
    events = relationship('MatchEvent', back_populates='video')
    analysis_jobs = relationship('AnalysisJob', back_populates='video')
    
    def to_dict(self):
        # Calculate savings percentage
        savings_percent = 0
        if self.original_size_bytes and self.proxy_size_bytes:
            savings_percent = round((1 - self.proxy_size_bytes / self.original_size_bytes) * 100)
        
        return {
            'id': self.id,
            'match_id': self.match_id,
            'file_url': self.file_url,
            'file_name': self.file_name,
            'video_type': self.video_type,
            'status': self.status,
            'duration_seconds': self.duration_seconds,
            'start_minute': self.start_minute,
            'end_minute': self.end_minute,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            # Dual-quality fields
            'original_url': self.original_url,
            'proxy_url': self.proxy_url,
            'proxy_status': self.proxy_status,
            'proxy_progress': self.proxy_progress,
            'original_size_bytes': self.original_size_bytes,
            'proxy_size_bytes': self.proxy_size_bytes,
            'proxy_resolution': self.proxy_resolution,
            'original_resolution': self.original_resolution,
            'savings_percent': savings_percent
        }


class AnalysisJob(Base):
    __tablename__ = 'analysis_jobs'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    match_id = Column(String(36), ForeignKey('matches.id'), nullable=False)
    video_id = Column(String(36), ForeignKey('videos.id'))
    status = Column(String(50), default='queued')
    progress = Column(Integer, default=0)
    current_step = Column(String(255))
    result = Column(JSON, default=dict)
    error_message = Column(Text)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Campos adicionais para processamento paralelo
    stage = Column(String(50), default='queued')
    progress_message = Column(Text)
    parts_completed = Column(Integer, default=0)
    total_parts = Column(Integer, default=0)
    parts_status = Column(JSON, default=list)
    estimated_time_remaining = Column(Integer)
    
    # Relationships
    match = relationship('Match', back_populates='analysis_jobs')
    video = relationship('Video', back_populates='analysis_jobs')
    
    def to_dict(self):
        return {
            'id': self.id,
            'match_id': self.match_id,
            'video_id': self.video_id,
            'status': self.status,
            'progress': self.progress,
            'current_step': self.current_step,
            'result': self.result,
            'error_message': self.error_message,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'stage': self.stage,
            'progress_message': self.progress_message,
            'parts_completed': self.parts_completed,
            'total_parts': self.total_parts,
            'parts_status': self.parts_status,
            'estimated_time_remaining': self.estimated_time_remaining
        }


class TranscriptionJob(Base):
    """Persistent transcription job for async processing with chunk tracking."""
    __tablename__ = 'transcription_jobs'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    match_id = Column(String(36), ForeignKey('matches.id'))
    video_id = Column(String(36), ForeignKey('videos.id'))
    video_path = Column(Text)
    
    # Status tracking
    status = Column(String(50), default='queued')
    progress = Column(Integer, default=0)
    current_step = Column(String(255))
    error_message = Column(Text)
    
    # Processing stage for granular progress
    stage = Column(String(50), default='queued')  # queued, downloading, splitting, extracting_audio, transcribing, combining, completed
    
    # Chunk tracking for resilient processing
    total_chunks = Column(Integer, default=1)
    completed_chunks = Column(Integer, default=0)
    chunk_results = Column(JSON, default=list)
    
    # Media chunking configuration
    chunk_duration_seconds = Column(Integer, default=10)
    manifest_path = Column(Text)
    chunks_dir = Column(Text)
    media_prepared = Column(Boolean, default=False)
    
    # Results
    srt_content = Column(Text)
    plain_text = Column(Text)
    provider_used = Column(String(50))
    
    # Timestamps
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'match_id': self.match_id,
            'video_id': self.video_id,
            'video_path': self.video_path,
            'status': self.status,
            'progress': self.progress,
            'current_step': self.current_step,
            'error_message': self.error_message,
            'stage': self.stage,
            'total_chunks': self.total_chunks,
            'completed_chunks': self.completed_chunks,
            'chunk_results': self.chunk_results,
            'chunk_duration_seconds': self.chunk_duration_seconds,
            'manifest_path': self.manifest_path,
            'chunks_dir': self.chunks_dir,
            'media_prepared': self.media_prepared,
            'srt_content': self.srt_content,
            'plain_text': self.plain_text,
            'provider_used': self.provider_used,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class GeneratedAudio(Base):

    __tablename__ = 'generated_audio'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    match_id = Column(String(36), ForeignKey('matches.id'), nullable=False)
    audio_type = Column(String(50), nullable=False)
    audio_url = Column(Text)
    script = Column(Text)
    voice = Column(String(50))
    duration_seconds = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    match = relationship('Match', back_populates='generated_audio')
    
    def to_dict(self):
        return {
            'id': self.id,
            'match_id': self.match_id,
            'audio_type': self.audio_type,
            'audio_url': self.audio_url,
            'script': self.script,
            'voice': self.voice,
            'duration_seconds': self.duration_seconds,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Thumbnail(Base):
    __tablename__ = 'thumbnails'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    match_id = Column(String(36), ForeignKey('matches.id'), nullable=False)
    event_id = Column(String(36), nullable=False)
    event_type = Column(String(50), nullable=False)
    image_url = Column(Text, nullable=False)
    title = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    match = relationship('Match', back_populates='thumbnails')
    
    def to_dict(self):
        return {
            'id': self.id,
            'match_id': self.match_id,
            'event_id': self.event_id,
            'event_type': self.event_type,
            'image_url': self.image_url,
            'title': self.title,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Profile(Base):
    __tablename__ = 'profiles'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id'), unique=True, nullable=False)
    email = Column(String(255))
    display_name = Column(String(255))
    phone = Column(String(20))
    cpf_cnpj = Column(String(18))
    
    # Address fields
    address_cep = Column(String(9))
    address_street = Column(String(255))
    address_number = Column(String(20))
    address_complement = Column(String(100))
    address_neighborhood = Column(String(100))
    address_city = Column(String(100))
    address_state = Column(String(2))
    
    # Credits (kept for compatibility but not used in 100% local mode)
    credits_balance = Column(Integer, default=0)
    credits_monthly_quota = Column(Integer, default=10)
    
    # Organization
    organization_id = Column(String(36))
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship('User', back_populates='profile')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'email': self.email,
            'display_name': self.display_name,
            'phone': self.phone,
            'cpf_cnpj': self.cpf_cnpj,
            'address_cep': self.address_cep,
            'address_street': self.address_street,
            'address_number': self.address_number,
            'address_complement': self.address_complement,
            'address_neighborhood': self.address_neighborhood,
            'address_city': self.address_city,
            'address_state': self.address_state,
            'credits_balance': self.credits_balance,
            'credits_monthly_quota': self.credits_monthly_quota,
            'organization_id': self.organization_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class UserRole(Base):
    __tablename__ = 'user_roles'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    role = Column(String(20), default='user')
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship('User', back_populates='roles')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'role': self.role,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class ApiSetting(Base):
    __tablename__ = 'api_settings'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    setting_key = Column(String(255), unique=True, nullable=False)
    setting_value = Column(Text)
    is_encrypted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'setting_key': self.setting_key,
            'setting_value': self.setting_value,
            'is_encrypted': self.is_encrypted,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ChatbotConversation(Base):
    __tablename__ = 'chatbot_conversations'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    match_id = Column(String(36), ForeignKey('matches.id'), nullable=False)
    team_name = Column(String(255), nullable=False)
    team_type = Column(String(50), nullable=False)
    messages = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    match = relationship('Match', back_populates='chatbot_conversations')
    
    def to_dict(self):
        return {
            'id': self.id,
            'match_id': self.match_id,
            'team_name': self.team_name,
            'team_type': self.team_type,
            'messages': self.messages,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class StreamConfiguration(Base):
    __tablename__ = 'stream_configurations'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    match_id = Column(String(36), ForeignKey('matches.id'))
    stream_url = Column(Text, nullable=False)
    video_resolution = Column(String(20), default='720p')
    video_codec = Column(String(50), default='H.264')
    video_frame_rate = Column(Integer, default=30)
    video_bitrate = Column(Integer, default=5000)
    video_aspect_ratio = Column(String(20), default='16:9')
    video_scan_type = Column(String(20), default='progressive')
    audio_channels = Column(JSON, default=list)
    ntp_server = Column(String(255), default='pool.ntp.org')
    ntp_offset_ms = Column(Integer, default=0)
    ntp_last_sync = Column(DateTime)
    validation_status = Column(String(50), default='pending')
    validation_errors = Column(JSON, default=list)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    match = relationship('Match', back_populates='stream_configurations')
    
    def to_dict(self):
        return {
            'id': self.id,
            'match_id': self.match_id,
            'stream_url': self.stream_url,
            'video_resolution': self.video_resolution,
            'video_codec': self.video_codec,
            'video_frame_rate': self.video_frame_rate,
            'video_bitrate': self.video_bitrate,
            'video_aspect_ratio': self.video_aspect_ratio,
            'video_scan_type': self.video_scan_type,
            'audio_channels': self.audio_channels,
            'ntp_server': self.ntp_server,
            'ntp_offset_ms': self.ntp_offset_ms,
            'ntp_last_sync': self.ntp_last_sync.isoformat() if self.ntp_last_sync else None,
            'validation_status': self.validation_status,
            'validation_errors': self.validation_errors,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class SmartEditProject(Base):
    __tablename__ = 'smart_edit_projects'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36))
    title = Column(String(255), nullable=False)
    source_video_url = Column(Text, nullable=False)
    transcription = Column(Text)
    status = Column(String(50), default='pending')
    language = Column(String(10), default='pt')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    clips = relationship('SmartEditClip', back_populates='project', cascade='all, delete-orphan')
    renders = relationship('SmartEditRender', back_populates='project', cascade='all, delete-orphan')
    settings = relationship('SmartEditSetting', back_populates='project', cascade='all, delete-orphan', uselist=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'source_video_url': self.source_video_url,
            'transcription': self.transcription,
            'status': self.status,
            'language': self.language,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class SmartEditClip(Base):
    __tablename__ = 'smart_edit_clips'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey('smart_edit_projects.id'))
    title = Column(String(255))
    event_type = Column(String(50))
    start_second = Column(Float, nullable=False)
    end_second = Column(Float, nullable=False)
    confidence = Column(Float)
    is_enabled = Column(Boolean, default=True)
    sort_order = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    project = relationship('SmartEditProject', back_populates='clips')
    
    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'title': self.title,
            'event_type': self.event_type,
            'start_second': self.start_second,
            'end_second': self.end_second,
            'confidence': self.confidence,
            'is_enabled': self.is_enabled,
            'sort_order': self.sort_order,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class SmartEditRender(Base):
    __tablename__ = 'smart_edit_renders'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey('smart_edit_projects.id'))
    status = Column(String(50), default='pending')
    progress = Column(Integer, default=0)
    video_url = Column(Text)
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    project = relationship('SmartEditProject', back_populates='renders')
    
    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'status': self.status,
            'progress': self.progress,
            'video_url': self.video_url,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class SmartEditSetting(Base):
    __tablename__ = 'smart_edit_settings'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey('smart_edit_projects.id'))
    channel_name = Column(String(255), default='Meu Canal')
    opening_text = Column(String(255), default='Bem-vindo!')
    transition_text = Column(String(255), default='Oferecimento')
    closing_text = Column(String(255), default='Até o próximo vídeo!')
    cut_intensity = Column(String(20), default='medium')
    min_clip_duration = Column(Integer, default=5)
    max_clip_duration = Column(Integer, default=60)
    max_clips = Column(Integer, default=10)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    project = relationship('SmartEditProject', back_populates='settings')
    
    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'channel_name': self.channel_name,
            'opening_text': self.opening_text,
            'transition_text': self.transition_text,
            'closing_text': self.closing_text,
            'cut_intensity': self.cut_intensity,
            'min_clip_duration': self.min_clip_duration,
            'max_clip_duration': self.max_clip_duration,
            'max_clips': self.max_clips,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


# ============================================================================
# ADMIN MODELS - For local admin management
# ============================================================================

class Organization(Base):
    """Organization/Company model for multi-tenant support."""
    __tablename__ = 'organizations'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    logo_url = Column(Text)
    owner_id = Column(String(36))
    plan_id = Column(String(36), ForeignKey('subscription_plans.id'))
    stripe_customer_id = Column(String(255))
    stripe_subscription_id = Column(String(255))
    credits_balance = Column(Integer, default=0)
    credits_monthly_quota = Column(Integer, default=50)
    storage_used_bytes = Column(Integer, default=0)
    storage_limit_bytes = Column(Integer, default=5368709120)  # 5GB
    is_active = Column(Boolean, default=True)
    trial_ends_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    plan = relationship('SubscriptionPlan', back_populates='organizations')
    members = relationship('OrganizationMember', back_populates='organization', cascade='all, delete-orphan')
    credit_transactions = relationship('CreditTransaction', back_populates='organization', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'logo_url': self.logo_url,
            'owner_id': self.owner_id,
            'plan_id': self.plan_id,
            'stripe_customer_id': self.stripe_customer_id,
            'stripe_subscription_id': self.stripe_subscription_id,
            'credits_balance': self.credits_balance,
            'credits_monthly_quota': self.credits_monthly_quota,
            'storage_used_bytes': self.storage_used_bytes,
            'storage_limit_bytes': self.storage_limit_bytes,
            'is_active': self.is_active,
            'trial_ends_at': self.trial_ends_at.isoformat() if self.trial_ends_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class SubscriptionPlan(Base):
    """Subscription plan model for billing tiers."""
    __tablename__ = 'subscription_plans'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    slug = Column(String(50), unique=True, nullable=False)
    price_monthly = Column(Integer, default=0)
    price_yearly = Column(Integer)
    credits_per_month = Column(Integer, default=50)
    max_users = Column(Integer, default=1)
    max_matches_per_month = Column(Integer)
    storage_limit_bytes = Column(Integer, default=5368709120)  # 5GB
    features = Column(JSON, default=list)
    stripe_price_id_monthly = Column(String(255))
    stripe_price_id_yearly = Column(String(255))
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    organizations = relationship('Organization', back_populates='plan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'price_monthly': self.price_monthly,
            'price_yearly': self.price_yearly,
            'credits_per_month': self.credits_per_month,
            'max_users': self.max_users,
            'max_matches_per_month': self.max_matches_per_month,
            'storage_limit_bytes': self.storage_limit_bytes,
            'features': self.features,
            'stripe_price_id_monthly': self.stripe_price_id_monthly,
            'stripe_price_id_yearly': self.stripe_price_id_yearly,
            'is_active': self.is_active,
            'sort_order': self.sort_order,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class OrganizationMember(Base):
    """Organization membership model."""
    __tablename__ = 'organization_members'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    organization_id = Column(String(36), ForeignKey('organizations.id'))
    user_id = Column(String(36))
    role = Column(String(20), default='member')  # owner, admin, member
    invited_by = Column(String(36))
    invited_at = Column(DateTime, default=datetime.utcnow)
    accepted_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    organization = relationship('Organization', back_populates='members')
    
    def to_dict(self):
        return {
            'id': self.id,
            'organization_id': self.organization_id,
            'user_id': self.user_id,
            'role': self.role,
            'invited_by': self.invited_by,
            'invited_at': self.invited_at.isoformat() if self.invited_at else None,
            'accepted_at': self.accepted_at.isoformat() if self.accepted_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class CreditTransaction(Base):
    """Credit transaction model for tracking credit usage and purchases."""
    __tablename__ = 'credit_transactions'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    organization_id = Column(String(36), ForeignKey('organizations.id'))
    amount = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    transaction_type = Column(String(50), nullable=False)  # purchase, usage, refund, bonus, manual
    description = Column(Text)
    match_id = Column(String(36))
    stripe_payment_id = Column(String(255))
    created_by = Column(String(36))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    organization = relationship('Organization', back_populates='credit_transactions')
    
    def to_dict(self):
        return {
            'id': self.id,
            'organization_id': self.organization_id,
            'amount': self.amount,
            'balance_after': self.balance_after,
            'transaction_type': self.transaction_type,
            'description': self.description,
            'match_id': self.match_id,
            'stripe_payment_id': self.stripe_payment_id,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


# ============================================================================
# SOCIAL MEDIA MODELS
# ============================================================================

class SocialConnection(Base):
    """Social media platform connection credentials."""
    __tablename__ = 'social_connections'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    platform = Column(String(50), nullable=False)
    access_token = Column(Text)
    refresh_token = Column(Text)
    token_expires_at = Column(DateTime)
    account_name = Column(String(255))
    account_id = Column(String(255))
    is_connected = Column(Boolean, default=False)
    last_sync_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'platform': self.platform,
            'access_token': self.access_token,
            'refresh_token': self.refresh_token,
            'token_expires_at': self.token_expires_at.isoformat() if self.token_expires_at else None,
            'account_name': self.account_name,
            'account_id': self.account_id,
            'is_connected': self.is_connected,
            'last_sync_at': self.last_sync_at.isoformat() if self.last_sync_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class SocialCampaign(Base):
    """Social media marketing campaign."""
    __tablename__ = 'social_campaigns'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(50), default='draft')
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    target_platforms = Column(JSON, default=list)
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    scheduled_posts = relationship('SocialScheduledPost', back_populates='campaign', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'description': self.description,
            'status': self.status,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'target_platforms': self.target_platforms or [],
            'tags': self.tags or [],
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class SocialScheduledPost(Base):
    """Scheduled social media post."""
    __tablename__ = 'social_scheduled_posts'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    platform = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    media_url = Column(Text)
    media_type = Column(String(50))
    scheduled_at = Column(DateTime, nullable=False)
    published_at = Column(DateTime)
    status = Column(String(50), default='scheduled')
    error_message = Column(Text)
    external_post_id = Column(String(255))
    campaign_id = Column(String(36), ForeignKey('social_campaigns.id'))
    match_id = Column(String(36))
    event_id = Column(String(36))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    campaign = relationship('SocialCampaign', back_populates='scheduled_posts')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'platform': self.platform,
            'content': self.content,
            'media_url': self.media_url,
            'media_type': self.media_type,
            'scheduled_at': self.scheduled_at.isoformat() if self.scheduled_at else None,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'status': self.status,
            'error_message': self.error_message,
            'external_post_id': self.external_post_id,
            'campaign_id': self.campaign_id,
            'match_id': self.match_id,
            'event_id': self.event_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class UploadJob(Base):
    """Chunked upload job for large files with resume capability."""
    __tablename__ = 'upload_jobs'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    match_id = Column(String(36))
    original_filename = Column(String(255))
    file_extension = Column(String(10))
    file_type = Column(String(20))  # 'video' or 'audio'
    total_size_bytes = Column(Integer)
    
    # Chunking
    chunk_size_bytes = Column(Integer, default=8*1024*1024)  # 8MB
    total_chunks = Column(Integer)
    received_chunks = Column(JSON, default=list)  # List of received indices
    chunks_dir = Column(Text)
    
    # Status
    status = Column(String(50), default='uploading')  # uploading, paused, assembling, converting, extracting, segmenting, transcribing, complete, error, cancelled
    stage = Column(String(50))  # Detailed stage
    progress = Column(Integer, default=0)
    current_step = Column(String(255))
    error_message = Column(Text)
    
    # Speed and time
    upload_speed_bytes_per_sec = Column(Integer)
    estimated_time_remaining_sec = Column(Integer)
    
    # Conversion
    needs_conversion = Column(Boolean, default=False)
    conversion_progress = Column(Integer, default=0)
    output_path = Column(Text)
    
    # Transcription
    transcription_segment_current = Column(Integer, default=0)
    transcription_segment_total = Column(Integer, default=0)
    transcription_progress = Column(Integer, default=0)
    srt_path = Column(Text)
    txt_path = Column(Text)
    
    # Event log
    events_log = Column(JSON, default=list)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    paused_at = Column(DateTime)
    
    def to_dict(self):
        return {
            'id': self.id,
            'match_id': self.match_id,
            'original_filename': self.original_filename,
            'file_extension': self.file_extension,
            'file_type': self.file_type,
            'total_size_bytes': self.total_size_bytes,
            'chunk_size_bytes': self.chunk_size_bytes,
            'total_chunks': self.total_chunks,
            'received_chunks': self.received_chunks,
            'chunks_dir': self.chunks_dir,
            'status': self.status,
            'stage': self.stage,
            'progress': self.progress,
            'current_step': self.current_step,
            'error_message': self.error_message,
            'upload_speed_bytes_per_sec': self.upload_speed_bytes_per_sec,
            'estimated_time_remaining_sec': self.estimated_time_remaining_sec,
            'needs_conversion': self.needs_conversion,
            'conversion_progress': self.conversion_progress,
            'output_path': self.output_path,
            'transcription_segment_current': self.transcription_segment_current,
            'transcription_segment_total': self.transcription_segment_total,
            'transcription_progress': self.transcription_progress,
            'srt_path': self.srt_path,
            'txt_path': self.txt_path,
            'events_log': self.events_log,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'paused_at': self.paused_at.isoformat() if self.paused_at else None
        }

