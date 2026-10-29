'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const { normalizeEmail, validateRegistration } = require('./validation');

const COOKIE_NAME = 'gesto_token';

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

function profile(user) {
  return { ...publicUser(user), created_at: user.createdAt };
}

// Options du cookie : les mêmes à la création et à la suppression (sinon le navigateur
// ne reconnaît pas le cookie à effacer).
function cookieOptions(config) {
  return { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/' };
}

// `store` : accès aux données (MariaDB en production, mémoire dans les tests).
// `config` : { jwtSecret, jwtExpiresIn, cookieSecure, bcryptRounds }
// `cascade` : { deleteUserData(userId) }, appelle les services tasks et projects.
function createApp({ store, config, cascade }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  // Hash factice : permet de dépenser le même temps de calcul quand l'email n'existe pas,
  // pour ne pas révéler quels emails sont inscrits.
  const dummyHash = bcrypt.hashSync('mot-de-passe-factice', config.bcryptRounds);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/auth/register', async (req, res) => {
    const problem = validateRegistration(req.body);
    if (problem) {
      return res.status(400).json({ error: problem });
    }
    const { name, password } = req.body;
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

    try {
      // Le rôle est toujours « standard » : l'API ne permet jamais de s'inscrire admin.
      const user = await store.createUser({
        email: normalizeEmail(req.body.email),
        name: name.trim(),
        passwordHash,
        role: 'standard',
      });
      return res.status(201).json(publicUser(user));
    } catch (err) {
      if (err.code === 'DUPLICATE') {
        return res.status(409).json({ error: 'Cet email est déjà utilisé' });
      }
      throw err;
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email et mot de passe obligatoires' });
    }

    const user = await store.findByEmail(normalizeEmail(email));
    const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : dummyHash);
    if (!user || !passwordOk) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const token = jwt.sign({ role: user.role }, config.jwtSecret, {
      algorithm: 'HS256',
      subject: String(user.id),
      expiresIn: config.jwtExpiresIn,
      jwtid: randomUUID(),
    });

    res.cookie(COOKIE_NAME, token, cookieOptions(config));
    return res.status(200).json(publicUser(user));
  });

  // Lit le cookie et renvoie { user, payload }, ou null si la session n'est pas valide.
  // Utilisée par /verify (appelée par nginx) et par les routes protégées de ce service :
  // accounts est le seul service à lire le jeton, c'est lui qui l'a émis.
  async function authenticate(req) {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return null;

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      return null;
    }
    if (await store.isRevoked(payload.jti)) return null;

    // On relit l'utilisateur : un compte supprimé n'a plus de session valide,
    // et le rôle vient de la base, pas du jeton.
    const user = await store.findById(Number(payload.sub));
    if (!user) return null;
    return { user, payload };
  }

  async function requireAuth(req, res, next) {
    const session = await authenticate(req);
    if (!session) {
      return res.status(401).json({ error: 'Non connecté' });
    }
    req.user = session.user;
    req.tokenPayload = session.payload;
    return next();
  }

  function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Réservé aux administrateurs' });
    }
    return next();
  }

  // Appelée uniquement par nginx (auth_request), jamais directement par un client.
  app.get('/api/auth/verify', requireAuth, (req, res) => {
    res.set('X-User-Id', String(req.user.id));
    res.set('X-User-Role', req.user.role);
    return res.status(200).json({ id: req.user.id, role: req.user.role });
  });

  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    const { jti, exp } = req.tokenPayload;
    await store.revokeToken(jti, new Date(exp * 1000));
    // Ménage opportuniste : on retire les jetons révoqués déjà expirés.
    await store.purgeExpiredTokens();
    res.clearCookie(COOKIE_NAME, cookieOptions(config));
    return res.status(204).end();
  });

  app.get('/api/users/me', requireAuth, (req, res) => {
    return res.status(200).json(profile(req.user));
  });

  // Supprime les données du compte chez les autres services, puis le compte lui-même.
  // Si la cascade échoue (502), le compte est conservé.
  async function deleteAccount(userId, res) {
    try {
      await cascade.deleteUserData(userId);
    } catch (err) {
      if (err.code === 'CASCADE_FAILED') {
        console.error(err);
        res.status(502).json({ error: 'Un service voisin ne répond pas, compte non supprimé' });
        return false;
      }
      throw err;
    }
    await store.deleteUser(userId);
    return true;
  }

  app.delete('/api/users/me', requireAuth, async (req, res) => {
    if (await deleteAccount(req.user.id, res)) {
      res.clearCookie(COOKIE_NAME, cookieOptions(config));
      return res.status(204).end();
    }
    return undefined;
  });

  app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
    const users = await store.listUsers();
    return res.status(200).json(users.map(profile));
  });

  app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    if (!/^[1-9]\d*$/.test(req.params.id)) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const target = await store.findById(Number(req.params.id));
    if (!target) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }
    if (target.role === 'admin') {
      return res.status(403).json({ error: 'Un compte admin ne peut pas être supprimé ici' });
    }
    if (await deleteAccount(target.id, res)) {
      return res.status(204).end();
    }
    return undefined;
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Route introuvable' });
  });

  // Gestionnaire d'erreurs (Express 5 y envoie aussi les erreurs des fonctions async).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON invalide' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Requête trop volumineuse' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne' });
  });

  return app;
}

module.exports = { createApp, COOKIE_NAME };
