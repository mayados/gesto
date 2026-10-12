'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { ensureAdmin } = require('../src/bootstrap');
const { createMemoryStore } = require('./memoryStore');

const silent = { log: () => {}, warn: () => {} };
const base = { bcryptRounds: 4, log: silent };

let store;
beforeEach(() => {
  store = createMemoryStore();
});

test('crée l’admin, qui peut ensuite se connecter', async () => {
  const result = await ensureAdmin({ ...base, store, email: 'Admin@Example.com', password: 'adminpass123' });
  expect(result).toBe('created');
  const user = await store.findByEmail('admin@example.com');
  expect(user.role).toBe('admin');

  const app = createApp({ store, config: { jwtSecret: 's', jwtExpiresIn: '1h', cookieSecure: false, bcryptRounds: 4 } });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'adminpass123' });
  expect(res.status).toBe(200);
  expect(res.body.role).toBe('admin');
});

test('est idempotent : un second appel ne crée rien', async () => {
  await ensureAdmin({ ...base, store, email: 'admin@example.com', password: 'adminpass123' });
  const again = await ensureAdmin({ ...base, store, email: 'admin@example.com', password: 'autrepass456' });
  expect(again).toBe('exists');
  expect(await store.listUsers()).toHaveLength(1);
});

test('ne promeut pas un compte existant', async () => {
  await store.createUser({ email: 'admin@example.com', name: 'X', passwordHash: 'h', role: 'standard' });
  const result = await ensureAdmin({ ...base, store, email: 'admin@example.com', password: 'adminpass123' });
  expect(result).toBe('exists');
  expect((await store.findByEmail('admin@example.com')).role).toBe('standard');
});

test('ignore si les variables sont absentes', async () => {
  expect(await ensureAdmin({ ...base, store, email: undefined, password: undefined })).toBe('skipped');
  expect(await store.listUsers()).toHaveLength(0);
});

test('refuse un mot de passe trop court', async () => {
  const result = await ensureAdmin({ ...base, store, email: 'admin@example.com', password: 'court' });
  expect(result).toBe('invalid');
  expect(await store.listUsers()).toHaveLength(0);
});
