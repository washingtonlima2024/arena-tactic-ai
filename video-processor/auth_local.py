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

def create_user(session, email: str, password: str, display_name: str = None) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Create a new user.
    
    Returns:
        Tuple of (user_dict, error_message)
    """
    from models import User, UserRole, Profile
    
    # Check if email already exists
    existing = session.query(User).filter_by(email=email.lower()).first()
    if existing:
        return None, 'Email already registered'
    
    # Create user
    user = User(
        email=email.lower(),
        password_hash=hash_password(password),
        display_name=display_name or email.split('@')[0]
    )
    session.add(user)
    session.flush()  # Get ID
    
    # Create default role
    role = UserRole(user_id=user.id, role='user')
    session.add(role)
    
    # Create profile
    profile = Profile(
        user_id=user.id,
        email=email.lower(),
        display_name=display_name or email.split('@')[0]
    )
    session.add(profile)
    
    session.commit()
    
    return user.to_dict(), None


def authenticate_user(session, email: str, password: str) -> Tuple[Optional[Dict], Optional[str], Optional[str]]:
    """
    Authenticate a user and return token.
    
    Returns:
        Tuple of (user_dict, token, error_message)
    """
    from models import User, UserRole, UserSession
    
    user = session.query(User).filter_by(email=email.lower()).first()
    
    if not user:
        return None, None, 'Invalid email or password'
    
    if not user.is_active:
        return None, None, 'Account is disabled'
    
    if not verify_password(password, user.password_hash):
        return None, None, 'Invalid email or password'
    
    # Get user role
    role_record = session.query(UserRole).filter_by(user_id=user.id).first()
    role = role_record.role if role_record else 'user'
    
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
    
    return user.to_dict(), token, None


def logout_user(session, token: str) -> bool:
    """Remove user session."""
    from models import UserSession
    
    deleted = session.query(UserSession).filter_by(token=token).delete()
    session.commit()
    
    return deleted > 0


def get_user_by_id(session, user_id: str) -> Optional[Dict]:
    """Get user by ID."""
    from models import User, UserRole
    
    user = session.query(User).filter_by(id=user_id).first()
    if not user:
        return None
    
    role_record = session.query(UserRole).filter_by(user_id=user.id).first()
    
    result = user.to_dict()
    result['role'] = role_record.role if role_record else 'user'
    
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
