/**
 * Arena Play - Configuração PM2
 * 
 * Frontend: porta 8080 (serve dist/)
 * Backend: porta 5000 (Python Flask)
 * 
 * Uso:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart all
 *   pm2 logs
 */

module.exports = {
  apps: [
    {
      name: 'arena-frontend',
      script: 'npx',
      args: 'serve -s dist -l 8080',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 8080
      }
    },
    {
      name: 'arena-backend',
      script: 'server.py',
      cwd: './video-processor',
      interpreter: 'python3',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        FLASK_ENV: 'production',
        ARENA_BASE_DIR: './video-processor',
        ARENA_STORAGE_DIR: './video-processor/storage',
        PORT: 5000
      }
    }
  ]
};
