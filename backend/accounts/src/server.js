'use strict';

const mysql = require('mysql2/promise');
const { createApp } = require('./app');
const { createMysqlStore } = require('./stores/mysqlStore');
const { createCascade } = require('./cascade');
const { ensureAdmin } = require('./bootstrap');

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
  // Dates lues et écrites en UTC, quel que soit le fuseau de la machine.
  timezone: 'Z',
  waitForConnections: true,
  connectionLimit: 10,
});

const store = createMysqlStore(pool);
const cascade = createCascade({
  tasksUrl: process.env.TASKS_URL || 'http://tasks:8002',
  projectsUrl: process.env.PROJECTS_URL || 'http://projects:8001',
});
const app = createApp({ store, config, cascade });
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`Service accounts en écoute sur le port ${port}`);
});

// Création du compte admin en arrière-plan : /health reste disponible même si la base
// met un moment à répondre. On réessaie quelques fois avant d'abandonner.
async function bootstrapAdmin() {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      await ensureAdmin({
        store,
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
        bcryptRounds: config.bcryptRounds,
      });
      return;
    } catch (err) {
      console.error(`Création de l'admin impossible (essai ${attempt}/10) : ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  console.error("Compte admin non créé : abandon après 10 essais");
}
bootstrapAdmin();

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
