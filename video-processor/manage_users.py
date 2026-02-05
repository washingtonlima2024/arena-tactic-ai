#!/usr/bin/env python3
"""
Script de linha de comando para gerenciar usuários do Arena Play.

Uso:
  python manage_users.py list                              # Listar todos os usuários
  python manage_users.py create email senha nome [--role ROLE] [--approved]
  python manage_users.py reset-password email nova_senha   # Redefinir senha
  python manage_users.py approve email                     # Aprovar usuário
  python manage_users.py reject email                      # Rejeitar/desativar usuário
  python manage_users.py set-role email role               # Alterar role

Roles disponíveis: viewer, uploader, manager, org_admin, superadmin
"""

import sys
import argparse
from datetime import datetime

# Setup path for imports
from database import get_db_session, init_db
from models import User, UserRole, Profile
from auth_local import hash_password


def list_users():
    """Lista todos os usuários cadastrados."""
    with get_db_session() as session:
        users = session.query(User).order_by(User.created_at.desc()).all()
        
        if not users:
            print("\n📭 Nenhum usuário cadastrado.\n")
            return
        
        print("\n" + "=" * 80)
        print(f"{'EMAIL':<35} {'ROLE':<12} {'APROVADO':<10} {'ATIVO':<8} {'NOME'}")
        print("=" * 80)
        
        for user in users:
            role_record = session.query(UserRole).filter_by(user_id=user.id).first()
            role = role_record.role if role_record else 'viewer'
            
            approved = '✅ Sim' if user.is_approved else '⏳ Não'
            active = '✅ Sim' if user.is_active else '❌ Não'
            
            print(f"{user.email:<35} {role:<12} {approved:<10} {active:<8} {user.display_name or '-'}")
        
        print("=" * 80)
        print(f"Total: {len(users)} usuário(s)\n")


def create_user(email: str, password: str, name: str, role: str = 'viewer', approved: bool = False):
    """Cria um novo usuário."""
    with get_db_session() as session:
        # Check if email already exists
        existing = session.query(User).filter_by(email=email.lower()).first()
        if existing:
            print(f"\n❌ Erro: Email '{email}' já cadastrado.\n")
            print("   Use 'reset-password' para alterar a senha.")
            print("   Use 'set-role' para alterar a role.\n")
            return False
        
        # Check if this is the first user
        user_count = session.query(User).count()
        is_first = user_count == 0
        
        if is_first:
            role = 'superadmin'
            approved = True
            print("\n🎉 Primeiro usuário! Será criado como superadmin automaticamente.")
        
        # Create user
        user = User(
            email=email.lower(),
            password_hash=hash_password(password),
            display_name=name,
            is_active=True,
            is_approved=approved
        )
        session.add(user)
        session.flush()
        
        # Create role
        user_role = UserRole(user_id=user.id, role=role)
        session.add(user_role)
        
        # Create profile
        profile = Profile(
            user_id=user.id,
            email=email.lower(),
            display_name=name,
            credits_balance=10,
            credits_monthly_quota=10
        )
        session.add(profile)
        
        session.commit()
        
        print(f"\n✅ Usuário criado com sucesso!")
        print(f"   Email: {email}")
        print(f"   Nome: {name}")
        print(f"   Role: {role}")
        print(f"   Aprovado: {'Sim' if approved else 'Não (aguardando aprovação)'}\n")
        
        return True


def reset_password(email: str, new_password: str):
    """Redefine a senha de um usuário."""
    with get_db_session() as session:
        user = session.query(User).filter_by(email=email.lower()).first()
        
        if not user:
            print(f"\n❌ Erro: Usuário '{email}' não encontrado.\n")
            return False
        
        user.password_hash = hash_password(new_password)
        session.commit()
        
        print(f"\n✅ Senha redefinida com sucesso para '{email}'!\n")
        return True


def approve_user(email: str):
    """Aprova um usuário pendente."""
    with get_db_session() as session:
        user = session.query(User).filter_by(email=email.lower()).first()
        
        if not user:
            print(f"\n❌ Erro: Usuário '{email}' não encontrado.\n")
            return False
        
        if user.is_approved:
            print(f"\n⚠️ Usuário '{email}' já está aprovado.\n")
            return True
        
        user.is_approved = True
        session.commit()
        
        print(f"\n✅ Usuário '{email}' aprovado com sucesso!\n")
        return True


def reject_user(email: str):
    """Rejeita/desativa um usuário."""
    with get_db_session() as session:
        user = session.query(User).filter_by(email=email.lower()).first()
        
        if not user:
            print(f"\n❌ Erro: Usuário '{email}' não encontrado.\n")
            return False
        
        user.is_active = False
        session.commit()
        
        print(f"\n✅ Usuário '{email}' desativado com sucesso!\n")
        return True


def set_role(email: str, new_role: str):
    """Altera a role de um usuário."""
    valid_roles = ['viewer', 'uploader', 'manager', 'org_admin', 'superadmin']
    
    if new_role not in valid_roles:
        print(f"\n❌ Erro: Role '{new_role}' inválida.")
        print(f"   Roles válidas: {', '.join(valid_roles)}\n")
        return False
    
    with get_db_session() as session:
        user = session.query(User).filter_by(email=email.lower()).first()
        
        if not user:
            print(f"\n❌ Erro: Usuário '{email}' não encontrado.\n")
            return False
        
        role_record = session.query(UserRole).filter_by(user_id=user.id).first()
        
        if role_record:
            old_role = role_record.role
            role_record.role = new_role
        else:
            role_record = UserRole(user_id=user.id, role=new_role)
            session.add(role_record)
            old_role = 'nenhuma'
        
        session.commit()
        
        print(f"\n✅ Role alterada com sucesso!")
        print(f"   Usuário: {email}")
        print(f"   Role anterior: {old_role}")
        print(f"   Nova role: {new_role}\n")
        return True


def main():
    parser = argparse.ArgumentParser(
        description='Gerenciador de usuários do Arena Play',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos:
  python manage_users.py list
  python manage_users.py create admin@exemplo.com senha123 "Admin User" --role superadmin --approved
  python manage_users.py reset-password admin@exemplo.com novaSenha123
  python manage_users.py approve usuario@exemplo.com
  python manage_users.py set-role usuario@exemplo.com manager
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Comandos disponíveis')
    
    # List command
    subparsers.add_parser('list', help='Listar todos os usuários')
    
    # Create command
    create_parser = subparsers.add_parser('create', help='Criar novo usuário')
    create_parser.add_argument('email', help='Email do usuário')
    create_parser.add_argument('password', help='Senha do usuário')
    create_parser.add_argument('name', help='Nome completo do usuário')
    create_parser.add_argument('--role', default='viewer', 
                               choices=['viewer', 'uploader', 'manager', 'org_admin', 'superadmin'],
                               help='Role do usuário (default: viewer)')
    create_parser.add_argument('--approved', action='store_true', 
                               help='Já aprovar o usuário automaticamente')
    
    # Reset password command
    reset_parser = subparsers.add_parser('reset-password', help='Redefinir senha')
    reset_parser.add_argument('email', help='Email do usuário')
    reset_parser.add_argument('new_password', help='Nova senha')
    
    # Approve command
    approve_parser = subparsers.add_parser('approve', help='Aprovar usuário')
    approve_parser.add_argument('email', help='Email do usuário')
    
    # Reject command
    reject_parser = subparsers.add_parser('reject', help='Rejeitar/desativar usuário')
    reject_parser.add_argument('email', help='Email do usuário')
    
    # Set role command
    role_parser = subparsers.add_parser('set-role', help='Alterar role do usuário')
    role_parser.add_argument('email', help='Email do usuário')
    role_parser.add_argument('role', choices=['viewer', 'uploader', 'manager', 'org_admin', 'superadmin'],
                             help='Nova role')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    # Initialize database
    init_db()
    
    if args.command == 'list':
        list_users()
    elif args.command == 'create':
        create_user(args.email, args.password, args.name, args.role, args.approved)
    elif args.command == 'reset-password':
        reset_password(args.email, args.new_password)
    elif args.command == 'approve':
        approve_user(args.email)
    elif args.command == 'reject':
        reject_user(args.email)
    elif args.command == 'set-role':
        set_role(args.email, args.role)


if __name__ == '__main__':
    main()
