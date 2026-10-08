'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp, COOKIE_NAME } = require('../src/app');
const { createMemoryStore } = require('./memoryStore');

const config = {
  jwtSecret: 'secret-de-test',
  jwtExpiresIn: '1h',
  cookieSecure: false,
  bcryptRounds: 4, 
};

const validUser = { email: 'alice@example.com', name: 'Alice', password: 'motdepasse123' };

let store;
let app;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ store, config });
});


async function registerAndLogin(user = validUser) {
  await request(app).post('/api/auth/register').send(user);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password });
  return { res, cookie: res.headers['set-cookie'][0].split(';')[0] };
}

describe('GET /health', () => {
  test('répond 200 avec status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('POST /api/auth/register', () => {
  test('crée un compte standard et ne renvoie pas le mot de passe', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 1, email: 'alice@example.com', name: 'Alice', role: 'standard' });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  test('ignore un rôle admin demandé par le client', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('standard');
  });

  test('normalise l’email (casse et espaces)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: '  ALICE@Example.COM ' });
    expect(res.body.email).toBe('alice@example.com');
  });

  test('refuse un email déjà utilisé, même avec une casse différente (409)', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'ALICE@example.com' });
    expect(res.status).toBe(409);
  });

  test.each([
    ['email invalide', { ...validUser, email: 'pas-un-email' }],
    ['nom vide', { ...validUser, name: '   ' }],
    ['mot de passe trop court', { ...validUser, password: 'court' }],
    ['mot de passe trop long (> 72 octets)', { ...validUser, password: 'a'.repeat(73) }],
    ['champ manquant', { email: 'bob@example.com', name: 'Bob' }],
    ['types incorrects', { email: 42, name: ['x'], password: {} }],
  ])('refuse %s (400)', async (_label, body) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  test('refuse un JSON mal formé (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{ pas du json');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'JSON invalide' });
  });

  test('refuse une requête sans corps (400)', async () => {
    const res = await request(app).post('/api/auth/register');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('connecte et pose un cookie HttpOnly SameSite=Strict', async () => {
    const { res } = await registerAndLogin();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, email: 'alice@example.com', name: 'Alice', role: 'standard' });

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain(`${COOKIE_NAME}=`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).not.toMatch(/Secure/i);
  });

  test('ajoute l’attribut Secure quand la configuration le demande', async () => {
    app = createApp({ store, config: { ...config, cookieSecure: true } });
    const { res } = await registerAndLogin();
    expect(res.headers['set-cookie'][0]).toMatch(/Secure/i);
  });

  test('refuse un mauvais mot de passe (401)', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'mauvais-mot-de-passe' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('renvoie la même erreur pour un email inconnu (pas de fuite d’information)', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'mauvais-mot-de-passe' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inconnu@example.com', password: 'motdepasse123' });
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  test('accepte un email saisi avec une autre casse', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ALICE@example.com', password: validUser.password });
    expect(res.status).toBe(200);
  });

  test('refuse des champs manquants (400)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: validUser.email });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/verify', () => {
  test('refuse sans cookie (401)', async () => {
    const res = await request(app).get('/api/auth/verify');
    expect(res.status).toBe(401);
  });

  test('accepte une session valide et renvoie les en-têtes d’identité', async () => {
    const { cookie } = await registerAndLogin();
    const res = await request(app).get('/api/auth/verify').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['x-user-id']).toBe('1');
    expect(res.headers['x-user-role']).toBe('standard');
  });

  test('refuse un jeton falsifié (401)', async () => {
    const { cookie } = await registerAndLogin();
    const res = await request(app)
      .get('/api/auth/verify')
      .set('Cookie', `${cookie.slice(0, -3)}xyz`);
    expect(res.status).toBe(401);
  });

  test('refuse un jeton signé avec un autre secret (401)', async () => {
    const forged = jwt.sign({ role: 'admin' }, 'autre-secret', { subject: '1', jwtid: 'x' });
    const res = await request(app).get('/api/auth/verify').set('Cookie', `${COOKIE_NAME}=${forged}`);
    expect(res.status).toBe(401);
  });

  test('refuse un jeton expiré (401)', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const expired = jwt.sign({ role: 'standard' }, config.jwtSecret, {
      subject: '1',
      jwtid: 'expire',
      expiresIn: -10,
    });
    const res = await request(app).get('/api/auth/verify').set('Cookie', `${COOKIE_NAME}=${expired}`);
    expect(res.status).toBe(401);
  });

  test('refuse un jeton révoqué (401)', async () => {
    const { cookie } = await registerAndLogin();
    const token = cookie.split('=')[1];
    store.revoke(jwt.decode(token).jti);
    const res = await request(app).get('/api/auth/verify').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  test('refuse la session d’un compte supprimé (401)', async () => {
    const { cookie } = await registerAndLogin();
    store.remove(1);
    const res = await request(app).get('/api/auth/verify').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  test('prend le rôle dans la base, pas dans le jeton', async () => {
    const { cookie } = await registerAndLogin();
    store.setRole(1, 'admin');
    const res = await request(app).get('/api/auth/verify').set('Cookie', cookie);
    expect(res.headers['x-user-role']).toBe('admin');
  });
});

describe('routes inconnues', () => {
  test('répondent 404 en JSON', async () => {
    const res = await request(app).get('/api/nimporte-quoi');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route introuvable' });
  });
});
