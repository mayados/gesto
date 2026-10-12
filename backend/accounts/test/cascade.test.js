'use strict';

const { createCascade } = require('../src/cascade');

const urls = { tasksUrl: 'http://tasks:8002', projectsUrl: 'http://projects:8001' };

test('appelle tasks puis projects, avec la méthode DELETE', async () => {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push([options.method, url]);
    return { ok: true, status: 204 };
  };
  await createCascade({ ...urls, fetchFn }).deleteUserData(7);
  expect(calls).toEqual([
    ['DELETE', 'http://tasks:8002/internal/users/7/tasks'],
    ['DELETE', 'http://projects:8001/internal/users/7/projects'],
  ]);
});

test('s’arrête si tasks répond une erreur : projects n’est pas appelé', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    return { ok: false, status: 500 };
  };
  await expect(createCascade({ ...urls, fetchFn }).deleteUserData(7)).rejects.toMatchObject({
    code: 'CASCADE_FAILED',
  });
  expect(calls).toHaveLength(1);
});

test('erreur CASCADE_FAILED si le réseau échoue', async () => {
  const fetchFn = async () => {
    throw new TypeError('fetch failed');
  };
  await expect(createCascade({ ...urls, fetchFn }).deleteUserData(7)).rejects.toMatchObject({
    code: 'CASCADE_FAILED',
  });
});

test('erreur CASCADE_FAILED si projects échoue après tasks', async () => {
  let n = 0;
  const fetchFn = async () => ({ ok: ++n === 1, status: n === 1 ? 204 : 503 });
  await expect(createCascade({ ...urls, fetchFn }).deleteUserData(7)).rejects.toMatchObject({
    code: 'CASCADE_FAILED',
  });
});
