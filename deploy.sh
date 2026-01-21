#!/bin/bash

# Arena Play - Script de Deploy com PM2
# 
# Uso:
#   chmod +x deploy.sh
#   ./deploy.sh

set -e

echo "🚀 Arena Play - Deploy com PM2"
echo "================================"

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Verificar dependências
echo -e "${YELLOW}📦 Verificando dependências...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo "PM2 não encontrado. Instalando..."
    npm install -g pm2
fi

if ! command -v serve &> /dev/null; then
    echo "Serve não encontrado. Instalando..."
    npm install -g serve
fi

# 2. Build do frontend
echo -e "${YELLOW}🔨 Building frontend para produção...${NC}"
npm run build -- --mode production

# 3. Parar processos existentes (se houver)
echo -e "${YELLOW}🔄 Parando processos PM2 existentes...${NC}"
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# 4. Iniciar com PM2
echo -e "${YELLOW}🚀 Iniciando processos PM2...${NC}"
pm2 start ecosystem.config.cjs

# 5. Salvar configuração PM2
echo -e "${YELLOW}💾 Salvando configuração PM2...${NC}"
pm2 save

# 6. Status final
echo ""
echo -e "${GREEN}✅ Deploy completo!${NC}"
echo "================================"
echo -e "Frontend: ${GREEN}http://10.0.0.20:8080${NC}"
echo -e "Backend:  ${GREEN}http://10.0.0.20:5000${NC}"
echo ""
echo "Comandos úteis:"
echo "  pm2 status    - Ver status dos processos"
echo "  pm2 logs      - Ver logs em tempo real"
echo "  pm2 restart all - Reiniciar todos os processos"
echo ""
