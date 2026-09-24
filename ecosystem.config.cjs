module.exports = {
  apps: [
    {
      name: 'mark-bot',
      script: 'dist/index.js',
      node_args: '--max-old-space-size=256',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '384M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
