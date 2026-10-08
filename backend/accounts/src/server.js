'use strict';

const mysql = require('mysql2/promise');
const { createApp } = require('./app');
const { createMysqlStore } = require('./stores/mysqlStore');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Variable d'environnement manquante : ${name}`);
    process.exit(1);
  }
  return value;
}

const config = {
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  // À mettre à true uniquement quand le site est servi en HTTPS.
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  bcryptRounds: 10,
};

const pool = mysql.createPool({
  host: requireEnv('DB_HOST'),
  port: Number(process.env.DB_PORT || 3306),
  user: requireEnv('DB_USER'),
  password: requireEnv('DB_PASSWORD'),
  database: requireEnv('DB_NAME'),
  waitForConnections: true,
  connectionLimit: 10,
});

const app = createApp({ store: createMysqlStore(pool), config });
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`Service accounts en écoute sur le port ${port}`);
});

// Arrêt propre : docker stop envoie SIGTERM, on termine les requêtes en cours.
function shutdown(signal) {
  console.log(`${signal} reçu, arrêt en cours`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
