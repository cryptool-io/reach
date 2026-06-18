// PM2 process definition for Reach on ronserver2.
//   pm2 start deploy/ecosystem.config.cjs && pm2 save
//
// fork + 1 instance is REQUIRED: the campaign scheduler runs in-process on a 60s timer, so
// multiple instances would double-send. Secrets/config come from .env via Node's --env-file
// (Node 20.6+), keeping them out of this committed file.
module.exports = {
  apps: [
    {
      name: 'reach',
      script: 'build/index.js',
      cwd: '/data/www/main/reach',
      node_args: '--env-file=/data/www/main/reach/.env',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' }
    }
  ]
};
