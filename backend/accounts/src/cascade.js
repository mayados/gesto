'use strict';


function cascadeError(message, cause) {
  const err = new Error(message, { cause });
  err.code = 'CASCADE_FAILED';
  return err;
}


function createCascade({ tasksUrl, projectsUrl, timeoutMs = 5000, fetchFn = fetch }) {
  async function call(url) {
    let res;
    try {
      res = await fetchFn(url, { method: 'DELETE', signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw cascadeError(`Appel impossible : ${url}`, err);
    }
    if (!res.ok) {
      throw cascadeError(`Réponse ${res.status} de ${url}`);
    }
  }

  return {
    async deleteUserData(userId) {
      await call(`${tasksUrl}/internal/users/${userId}/tasks`);
      await call(`${projectsUrl}/internal/users/${userId}/projects`);
    },
  };
}

module.exports = { createCascade };
