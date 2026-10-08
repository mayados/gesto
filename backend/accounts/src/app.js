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

function createApp({ store, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

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

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.cookieSecure,
      path: '/',
    });
    return res.status(200).json(publicUser(user));
  });

  app.get('/api/auth/verify', async (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: 'Non connecté' });
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ error: 'Session invalide ou expirée' });
    }

    if (await store.isRevoked(payload.jti)) {
      return res.status(401).json({ error: 'Session terminée' });
    }

    const user = await store.findById(Number(payload.sub));
    if (!user) {
      return res.status(401).json({ error: 'Compte introuvable' });
    }

    res.set('X-User-Id', String(user.id));
    res.set('X-User-Role', user.role);
    return res.status(200).json({ id: user.id, role: user.role });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Route introuvable' });
  });

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
