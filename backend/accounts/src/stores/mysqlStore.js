'use strict';

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
  };
}

module.exports = { createMysqlStore };
