'use strict';

const request = require('supertest');
const { createApp, COOKIE_NAME } = require('../src/app');
const { createMemoryStore } = require('./memoryStore');

const config = {
  jwtSecret: 'secret-de-test',
  jwtExpiresIn: '1h',
  cookieSecure: false,
  bcryptRounds: 4,
};

const alice = { email: 'alice@example.com', name: 'Alice', password: 'motdepasse123' };
const bob = { email: 'bob@example.com', name: 'Bob', password: 'motdepasse456' };
const admin = { email: 'admin@example.com', name: 'Admin', password: 'adminpass123' };

let store;
let app;
let cascade;

beforeEach(() => {
  store = createMemoryStore();
  cascade = {
    calls: [],
    fail: false,
    async deleteUserData(userId) {
      this.calls.push(userId);
      if (this.fail) {
        const err = new Error('tasks injoignable');
        err.code = 'CASCADE_FAILED';
        throw err;
      }
    },
  };
  app = createApp({ store, config, cascade });
});


async function login(user, role = 'standard') {
  const reg = await request(app).post('/api/auth/register').send(user);
  if (role !== 'standard') store.setRole(reg.body.id, role);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password });
  return { id: reg.body.id, cookie: res.headers['set-cookie'][0].split(';')[0] };
}

describe('POST /api/auth/logout', () => {
  test('401 sans cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  test('204, efface le cookie et invalide le jeton', async () => {
    const { cookie } = await login(alice);
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    const cleared = res.headers['set-cookie'][0];
    expect(cleared).toContain(`${COOKIE_NAME}=;`);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);

    const verify = await request(app).get('/api/auth/verify').set('Cookie', cookie);
    expect(verify.status).toBe(401);
  });

  test('un second logout avec le même jeton donne 401', async () => {
    const { cookie } = await login(alice);
    await request(app).post('/api/auth/logout').set('Cookie', cookie);
    const again = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(again.status).toBe(401);
  });
});

describe('GET /api/users/me', () => {
  test('401 sans cookie', async () => {
    expect((await request(app).get('/api/users/me')).status).toBe(401);
  });

  test('renvoie le profil sans hash', async () => {
    const { cookie, id } = await login(alice);
    const res = await request(app).get('/api/users/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, email: alice.email, name: 'Alice', role: 'standard' });
    expect(res.body.created_at).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });
});

describe('DELETE /api/users/me', () => {
  test('401 sans cookie', async () => {
    expect((await request(app).delete('/api/users/me')).status).toBe(401);
  });

  test('204, lance la cascade, supprime le compte et efface le cookie', async () => {
    const { cookie, id } = await login(alice);
    const res = await request(app).delete('/api/users/me').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(cascade.calls).toEqual([id]);
    expect(await store.findById(id)).toBeNull();
    expect(res.headers['set-cookie'][0]).toContain(`${COOKIE_NAME}=;`);
  });

  test('un admin peut aussi supprimer son propre compte', async () => {
    const { cookie, id } = await login(admin, 'admin');
    const res = await request(app).delete('/api/users/me').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(await store.findById(id)).toBeNull();
  });

  test('502 et compte conservé si la cascade échoue', async () => {
    const { cookie, id } = await login(alice);
    cascade.fail = true;
    const res = await request(app).delete('/api/users/me').set('Cookie', cookie);
    expect(res.status).toBe(502);
    expect(await store.findById(id)).not.toBeNull();
  });

  test('le jeton d’un compte supprimé n’est plus valide', async () => {
    const { cookie } = await login(alice);
    await request(app).delete('/api/users/me').set('Cookie', cookie);
    const res = await request(app).get('/api/users/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/users (admin)', () => {
  test('401 sans cookie', async () => {
    expect((await request(app).get('/api/users')).status).toBe(401);
  });

  test('403 pour un compte standard', async () => {
    const { cookie } = await login(alice);
    const res = await request(app).get('/api/users').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  test('200 avec la liste, sans hash, pour un admin', async () => {
    await login(alice);
    const { cookie } = await login(admin, 'admin');
    const res = await request(app).get('/api/users').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((u) => u.email)).toEqual([alice.email, admin.email]);
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });
});

describe('DELETE /api/users/:id (admin)', () => {
  test('401 sans cookie', async () => {
    expect((await request(app).delete('/api/users/1')).status).toBe(401);
  });

  test('403 pour un compte standard, et la cible n’est pas touchée', async () => {
    const a = await login(alice);
    const b = await login(bob);
    const res = await request(app).delete(`/api/users/${b.id}`).set('Cookie', a.cookie);
    expect(res.status).toBe(403);
    expect(await store.findById(b.id)).not.toBeNull();
    expect(cascade.calls).toEqual([]);
  });

  test('204 : un admin supprime un compte standard (avec cascade)', async () => {
    const a = await login(alice);
    const adm = await login(admin, 'admin');
    const res = await request(app).delete(`/api/users/${a.id}`).set('Cookie', adm.cookie);
    expect(res.status).toBe(204);
    expect(cascade.calls).toEqual([a.id]);
    expect(await store.findById(a.id)).toBeNull();
  });

  test('403 si la cible est un admin (y compris soi-même)', async () => {
    const adm = await login(admin, 'admin');
    const res = await request(app).delete(`/api/users/${adm.id}`).set('Cookie', adm.cookie);
    expect(res.status).toBe(403);
    expect(await store.findById(adm.id)).not.toBeNull();
  });

  test('404 si la cible n’existe pas', async () => {
    const adm = await login(admin, 'admin');
    const res = await request(app).delete('/api/users/999').set('Cookie', adm.cookie);
    expect(res.status).toBe(404);
  });

  test.each(['abc', '0', '-1', '1.5', '01'])('400 pour l’identifiant %s', async (badId) => {
    const adm = await login(admin, 'admin');
    const res = await request(app).delete(`/api/users/${badId}`).set('Cookie', adm.cookie);
    expect(res.status).toBe(400);
  });

  test('502 et compte conservé si la cascade échoue', async () => {
    const a = await login(alice);
    const adm = await login(admin, 'admin');
    cascade.fail = true;
    const res = await request(app).delete(`/api/users/${a.id}`).set('Cookie', adm.cookie);
    expect(res.status).toBe(502);
    expect(await store.findById(a.id)).not.toBeNull();
  });
});
