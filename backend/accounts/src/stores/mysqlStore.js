'use strict';

// Accès à MariaDB. Les requêtes sont paramétrées (?) : jamais de concaténation de texte
// utilisateur dans le SQL, ce qui évite les injections.

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
  };
}

function createMysqlStore(pool) {
  return {
    async createUser({ email, name, passwordHash, role }) {
      try {
        const [result] = await pool.execute(
          'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
          [email, name, passwordHash, role]
        );
        return { id: result.insertId, email, name, passwordHash, role };
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          const duplicate = new Error('Email déjà utilisé');
          duplicate.code = 'DUPLICATE';
          throw duplicate;
        }
        throw err;
      }
    },

    async findByEmail(email) {
      const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
      return toUser(rows[0]);
    },

    async findById(id) {
      const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
      return toUser(rows[0]);
    },

    async isRevoked(jti) {
      const [rows] = await pool.execute('SELECT 1 FROM revoked_tokens WHERE jti = ?', [jti]);
      return rows.length > 0;
    },

    async listUsers() {
      const [rows] = await pool.execute('SELECT * FROM users ORDER BY id');
      return rows.map(toUser);
    },

    // Renvoie true si une ligne a été supprimée.
    async deleteUser(id) {
      const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
      return result.affectedRows > 0;
    },

    // Idempotent : révoquer deux fois le même jeton ne provoque pas d'erreur.
    async revokeToken(jti, expiresAt) {
      await pool.execute(
        'INSERT INTO revoked_tokens (jti, expires_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE jti = jti',
        [jti, expiresAt]
      );
    },

    // Supprime les jetons révoqués qui auraient de toute façon expiré.
    async purgeExpiredTokens() {
      const [result] = await pool.execute('DELETE FROM revoked_tokens WHERE expires_at < ?', [
        new Date(),
      ]);
      return result.affectedRows;
    },
  };
}

module.exports = { createMysqlStore };
