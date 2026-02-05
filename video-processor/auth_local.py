"""
Local Authentication System for Arena Play.
100% local JWT-based authentication - No cloud dependencies.
"""

import os
import jwt
import bcrypt
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from functools import wraps
from flask import request, jsonify

# JWT Secret - generate a secure random key if not provided
JWT_SECRET = os.environ.get('JWT_SECRET', 'arena-play-local-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24 * 7  # 1 week


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except Exception:
        return False


def generate_token(user_id: str, email: str, role: str = 'user') -> Tuple[str, datetime]:
    """
    Generate a JWT token for a user.
    
    Returns:
        Tuple of (token, expiration_datetime)
    """
    expiration = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    
    payload = {
        'sub': user_id,
        'email': email,
        'role': role,
        'iat': datetime.utcnow(),
        'exp': expiration,
        'jti': str(uuid.uuid4())  # Unique token ID for revocation
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token, expiration


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decode and validate a JWT token.
    
    Returns:
        Token payload dict or None if invalid
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        print("[Auth] Token expired")
        return None
    except jwt.InvalidTokenError as e:
        print(f"[Auth] Invalid token: {e}")
        return None


def get_token_from_request() -> Optional[str]:
    """Extract JWT token from request headers."""
    auth_header = request.headers.get('Authorization', '')
    
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    
    return None


def get_current_user() -> Optional[Dict[str, Any]]:
    """
    Get current user from request token.
    
    Returns:
        User payload dict or None if not authenticated
    """
    token = get_token_from_request()
    if not token:
        return None
    
    return decode_token(token)


def require_auth(f):
    """Decorator to require authentication for a route."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        
        # Add user to request context
        request.current_user = user
        return f(*args, **kwargs)
    
    return decorated


def require_role(required_role: str):
    """Decorator to require a specific role."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({'error': 'Authentication required'}), 401
            
            # Role hierarchy check
            role_hierarchy = {
                'superadmin': 100,
                'org_admin': 80,
                'admin': 80,
                'manager': 60,
                'uploader': 40,
                'viewer': 20,
                'user': 20
            }
            
            user_level = role_hierarchy.get(user.get('role', 'user'), 0)
            required_level = role_hierarchy.get(required_role, 0)
            
            if user_level < required_level:
                return jsonify({'error': f'Role {required_role} required'}), 403
            
            request.current_user = user
            return f(*args, **kwargs)
        
        return decorated
    return decorator


# ============================================================================
# Auth Service Functions (to be used with database)
# ============================================================================

def register_user(
    session, 
    email: str, 
    password: str, 
    display_name: str = None,
    phone: str = None,
    cpf_cnpj: str = None,
    address_cep: str = None,
    address_street: str = None,
    address_number: str = None,
    address_complement: str = None,
    address_neighborhood: str = None,
    address_city: str = None,
    address_state: str = None
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Register a new user with full profile data.
    First user is automatically approved and becomes superadmin.
    
    Returns:
        Tuple of (user_dict, error_message)
    """
    from models import User, UserRole, Profile
    
    # Check if email already exists
    existing = session.query(User).filter_by(email=email.lower()).first()
    if existing:
        return None, 'Email já cadastrado'
    
    # Check if this is the first user (will be superadmin and auto-approved)
    user_count = session.query(User).count()
    is_first_user = user_count == 0
    
    # Create user
    user = User(
        email=email.lower(),
        password_hash=hash_password(password),
        display_name=display_name or email.split('@')[0],
        is_active=True,
        is_approved=is_first_user  # First user auto-approved
    )
    session.add(user)
    session.flush()  # Get ID
    
    # Create role (first user is superadmin, others are viewer)
    role = UserRole(
        user_id=user.id, 
        role='superadmin' if is_first_user else 'viewer'
    )
    session.add(role)
    
    # Create profile with all data
    profile = Profile(
        user_id=user.id,
        email=email.lower(),
        display_name=display_name,
        phone=phone,
        cpf_cnpj=cpf_cnpj,
        address_cep=address_cep,
        address_street=address_street,
        address_number=address_number,
        address_complement=address_complement,
        address_neighborhood=address_neighborhood,
        address_city=address_city,
        address_state=address_state,
        credits_balance=10,
        credits_monthly_quota=10
    )
    session.add(profile)
    
    session.commit()
    
    user_dict = user.to_dict()
    user_dict['role'] = role.role
    user_dict['is_first_user'] = is_first_user
    
    return user_dict, None


def create_user(session, email: str, password: str, display_name: str = None) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Create a new user (legacy function for backward compatibility).
    
    Returns:
        Tuple of (user_dict, error_message)
    """
    return register_user(session, email, password, display_name)


def authenticate_user(session, email: str, password: str) -> Tuple[Optional[Dict], Optional[str], Optional[str]]:
    """
    Authenticate a user and return token.
    Checks is_approved and is_active before allowing login.
    
    Returns:
        Tuple of (user_dict, token, error_message)
    """
    from models import User, UserRole, UserSession, Profile
    
    user = session.query(User).filter_by(email=email.lower()).first()
    
    if not user:
        return None, None, 'Email ou senha incorretos'
    
    if not verify_password(password, user.password_hash):
        return None, None, 'Email ou senha incorretos'
    
    if not user.is_active:
        return None, None, 'Conta desativada'
    
    if not user.is_approved:
        return None, None, 'Aguardando aprovação do administrador'
    
    # Get user role
    role_record = session.query(UserRole).filter_by(user_id=user.id).first()
    role = role_record.role if role_record else 'viewer'
    
    # Get profile
    profile = session.query(Profile).filter_by(user_id=user.id).first()
    
    # Generate token
    token, expires_at = generate_token(user.id, user.email, role)
    
    # Save session
    user_session = UserSession(
        user_id=user.id,
        token=token,
        expires_at=expires_at
    )
    session.add(user_session)
    session.commit()
    
    # Build user response
    user_dict = user.to_dict()
    user_dict['role'] = role
    if profile:
        user_dict['profile'] = profile.to_dict()
    
    return user_dict, token, None


def logout_user(session, token: str) -> bool:
    """Remove user session."""
    from models import UserSession
    
    deleted = session.query(UserSession).filter_by(token=token).delete()
    session.commit()
    
    return deleted > 0


def get_user_by_id(session, user_id: str) -> Optional[Dict]:
    """Get user by ID with role and profile."""
    from models import User, UserRole, Profile
    
    user = session.query(User).filter_by(id=user_id).first()
    if not user:
        return None
    
    role_record = session.query(UserRole).filter_by(user_id=user.id).first()
    profile = session.query(Profile).filter_by(user_id=user.id).first()
    
    result = user.to_dict()
    result['role'] = role_record.role if role_record else 'viewer'
    if profile:
        result['profile'] = profile.to_dict()
    
    return result


def validate_session(session, token: str) -> bool:
    """Check if a session token is still valid."""
    from models import UserSession
    
    user_session = session.query(UserSession).filter_by(token=token).first()
    
    if not user_session:
        return False
    
    if user_session.expires_at < datetime.utcnow():
        # Clean up expired session
        session.delete(user_session)
        session.commit()
        return False
    
    return True


def approve_user(session, user_id: str) -> Tuple[bool, Optional[str]]:
    """Approve a pending user."""
    from models import User
    
    user = session.query(User).filter_by(id=user_id).first()
    if not user:
        return False, 'Usuário não encontrado'
    
    if user.is_approved:
        return False, 'Usuário já está aprovado'
    
    user.is_approved = True
    session.commit()
    
    return True, None


def reject_user(session, user_id: str) -> Tuple[bool, Optional[str]]:
    """Reject/deactivate a pending user."""
    from models import User
    
    user = session.query(User).filter_by(id=user_id).first()
    if not user:
        return False, 'Usuário não encontrado'
    
    user.is_active = False
    session.commit()
    
    return True, None


def get_pending_users(session) -> list:
    """Get all users pending approval."""
    from models import User, UserRole, Profile
    
    pending = session.query(User).filter_by(is_approved=False, is_active=True).all()
    
    result = []
    for user in pending:
        role_record = session.query(UserRole).filter_by(user_id=user.id).first()
        profile = session.query(Profile).filter_by(user_id=user.id).first()
        
        user_dict = user.to_dict()
        user_dict['role'] = role_record.role if role_record else 'viewer'
        if profile:
            user_dict.update(profile.to_dict())
        
        result.append(user_dict)
    
    return result


def get_all_users(session) -> list:
    """Get all users with their roles and profiles."""
    from models import User, UserRole, Profile
    
    users = session.query(User).order_by(User.created_at.desc()).all()
    
    result = []
    for user in users:
        role_record = session.query(UserRole).filter_by(user_id=user.id).first()
        profile = session.query(Profile).filter_by(user_id=user.id).first()
        
        user_dict = {
            'id': user.id,
            'user_id': user.id,  # Compatibility with frontend
            'email': user.email,
            'display_name': user.display_name,
            'is_active': user.is_active,
            'is_approved': user.is_approved,
            'role': role_record.role if role_record else 'viewer',
            'created_at': user.created_at.isoformat() if user.created_at else None,
        }
        
        if profile:
            user_dict.update({
                'phone': profile.phone,
                'cpf_cnpj': profile.cpf_cnpj,
                'address_cep': profile.address_cep,
                'address_street': profile.address_street,
                'address_number': profile.address_number,
                'address_complement': profile.address_complement,
                'address_neighborhood': profile.address_neighborhood,
                'address_city': profile.address_city,
                'address_state': profile.address_state,
                'credits_balance': profile.credits_balance,
                'credits_monthly_quota': profile.credits_monthly_quota,
                'organization_id': profile.organization_id,
            })
        
        result.append(user_dict)
    
    return result
