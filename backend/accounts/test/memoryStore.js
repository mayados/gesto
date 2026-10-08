'use strict';

function createMemoryStore() {
  const users = [];
  const revoked = new Set();
  let nextId = 1;

  return {
    async createUser({ email, name, passwordHash, role }) {
      if (users.some((u) => u.email === email)) {
        const duplicate = new Error('Email déjà utilisé');
        duplicate.code = 'DUPLICATE';
        throw duplicate;
      }
      const user = { id: nextId++, email, name, passwordHash, role };
      users.push(user);
      return { ...user };
    },
    async findByEmail(email) {
      const user = users.find((u) => u.email === email);
      return user ? { ...user } : null;
    },
    async findById(id) {
      const user = users.find((u) => u.id === id);
      return user ? { ...user } : null;
    },
    async isRevoked(jti) {
      return revoked.has(jti);
    },

    revoke(jti) {
      revoked.add(jti);
    },
    remove(id) {
      const index = users.findIndex((u) => u.id === id);
      if (index !== -1) users.splice(index, 1);
    },
    setRole(id, role) {
      const user = users.find((u) => u.id === id);
      if (user) user.role = role;
    },
  };
}

module.exports = { createMemoryStore };
