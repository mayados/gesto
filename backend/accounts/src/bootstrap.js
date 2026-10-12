'use strict';

const bcrypt = require('bcryptjs');
const { normalizeEmail, validateRegistration } = require('./validation');

// Crée le compte admin au démarrage s'il n'existe pas encore.
// Ne modifie jamais un compte existant (pas de promotion, pas de changement de mot de passe).
async function ensureAdmin({ store, email, password, bcryptRounds, log = console }) {
  if (!email || !password) {
    log.warn('ADMIN_EMAIL / ADMIN_PASSWORD absents : aucun compte admin créé');
    return 'skipped';
  }

  const problem = validateRegistration({ email, name: 'Admin', password });
  if (problem) {
    log.warn(`Compte admin non créé : ${problem}`);
    return 'invalid';
  }

  const normalized = normalizeEmail(email);
  const existing = await store.findByEmail(normalized);
  if (existing) {
    if (existing.role !== 'admin') {
      log.warn(`${normalized} existe déjà avec le rôle ${existing.role} : non modifié`);
    }
    return 'exists';
  }

  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  await store.createUser({ email: normalized, name: 'Admin', passwordHash, role: 'admin' });
  log.log(`Compte admin créé : ${normalized}`);
  return 'created';
}

module.exports = { ensureAdmin };
