'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function validateRegistration(body) {
  const { email, name, password } = body || {};

  if (typeof email !== 'string' || typeof name !== 'string' || typeof password !== 'string') {
    return 'Les champs email, name et password sont obligatoires';
  }
  const cleanEmail = email.trim();
  if (cleanEmail.length > 255 || !EMAIL_RE.test(cleanEmail)) {
    return 'Email invalide';
  }
  const cleanName = name.trim();
  if (cleanName.length < 1 || cleanName.length > 100) {
    return 'Le nom doit contenir entre 1 et 100 caractères';
  }
  if (password.length < 8) {
    return 'Le mot de passe doit contenir au moins 8 caractères';
  }

  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'Le mot de passe est trop long (72 octets maximum)';
  }
  return null;
}

module.exports = { normalizeEmail, validateRegistration };
