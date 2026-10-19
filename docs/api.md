# API de Gesto : contrat entre les services

Ce document est la référence commune des deux membres du binôme. Toute modification passe par une pull request relue par l'autre.

## 1. Principes généraux

- **Format** : JSON (`Content-Type: application/json`), sauf pour les réponses `204` qui n'ont pas de contenu.
- **Format des erreurs** : `{"error": "message lisible"}`.
- **Réseau** : seul nginx (le frontend) est joignable de l'extérieur. Les services se parlent sur le réseau interne, par nom :
  - `accounts` (Node.js) : port 3000
  - `projects` (PHP / Symfony) : port 8001
  - `tasks` (PHP / Symfony) : port 8002
- **Authentification** : un jeton JWT stocké dans un cookie `gesto_token` (HttpOnly, SameSite=Strict). Le frontend ne garde aucun état.
- **Vérification par nginx** : pour chaque route protégée, nginx interroge `GET /api/auth/verify` du service accounts (module `auth_request`). Si la réponse est `200`, nginx transmet la requête au bon service avec deux en-têtes fournis par accounts :
  - `X-User-Id` : identifiant de l'utilisateur
  - `X-User-Role` : `standard` ou `admin`
- **Sécurité des en-têtes** : nginx écrase toujours `X-User-Id` et `X-User-Role` envoyés par un client. Les services `projects` et `tasks` font confiance à ces en-têtes et ne lisent jamais le jeton eux-mêmes. Seul `accounts`, qui a émis le jeton, lit le cookie directement pour ses propres routes protégées.
- **Routes internes** : les routes `/internal/...` ne sont jamais exposées par nginx. Elles ne servent qu'aux appels entre services.
- **Santé** : chaque service expose `GET /health` qui répond `200 {"status": "ok"}`. Cette route n'est pas exposée par nginx.

### Codes de réponse utilisés

| Code | Signification |
|---|---|
| 200 | Succès, avec contenu |
| 201 | Ressource créée |
| 204 | Succès, sans contenu |
| 400 | Données invalides ou manquantes |
| 401 | Non connecté (jeton absent, invalide ou révoqué) |
| 403 | Connecté mais action interdite |
| 404 | Ressource introuvable (ou appartenant à quelqu'un d'autre) |
| 409 | Conflit (email déjà utilisé) |
| 502 | Un service voisin ne répond pas |

## 2. Modèles de données

**users** (service accounts)

| Champ | Type | Remarque |
|---|---|---|
| id | entier | clé primaire |
| email | texte | unique, sert d'identifiant de connexion |
| name | texte | nom affiché |
| password_hash | texte | jamais renvoyé par l'API |
| role | texte | `standard` ou `admin` |
| created_at | date | |

**revoked_tokens** (service accounts) : jetons invalidés par un logout

| Champ | Type | Remarque |
|---|---|---|
| jti | texte | identifiant unique du jeton |
| expires_at | date | permet de purger les anciennes lignes |

**projects** (service projects)

| Champ | Type | Remarque |
|---|---|---|
| id | entier | clé primaire |
| user_id | entier | propriétaire |
| name | texte | obligatoire |
| description | texte | facultatif |
| created_at | date | |

**tasks** (service tasks)

| Champ | Type | Remarque |
|---|---|---|
| id | entier | clé primaire |
| project_id | entier | projet parent |
| user_id | entier | propriétaire (copié pour contrôler l'accès sans appel externe) |
| title | texte | obligatoire |
| done | booléen | faux par défaut |
| created_at | date | |

Chaque service n'accède qu'à ses propres tables, avec son propre utilisateur SQL. Les trois schémas s'appellent `gesto_accounts`, `gesto_projects` et `gesto_tasks`.

## 3. Service accounts (Node.js, port 3000)

### Routes publiques

| Route | Corps | Réponse |
|---|---|---|
| `POST /api/auth/register` | `{email, name, password}` | `201 {id, email, name, role}`. `400` si invalide, `409` si l'email existe. Le rôle est toujours `standard`. |
| `POST /api/auth/login` | `{email, password}` | `200 {id, email, name, role}` et pose le cookie `gesto_token`. `401` si identifiants faux. |

### Routes protégées (connecté)

| Route | Réponse |
|---|---|
| `POST /api/auth/logout` | `204`. Le jeton est ajouté à `revoked_tokens` et le cookie est supprimé. |
| `GET /api/auth/verify` | `200` avec les en-têtes `X-User-Id` et `X-User-Role`, ou `401`. Utilisée uniquement par nginx via une location interne, non accessible aux clients. |
| `GET /api/users/me` | `200 {id, email, name, role, created_at}` |
| `DELETE /api/users/me` | `204`. Supprime le compte et ses données (voir cascade ci-dessous). |

### Routes administrateur

| Route | Réponse |
|---|---|
| `GET /api/users` | `200 [ {id, email, name, role, created_at}, ... ]`. `403` si l'utilisateur est standard. |
| `DELETE /api/users/{id}` | `204`. `403` si l'appelant n'est pas admin ou si la cible est un admin. `404` si la cible n'existe pas. |

### Règles

- Mot de passe : 8 caractères minimum, stocké haché.
- Au démarrage, le service crée un compte admin à partir des variables `ADMIN_EMAIL` et `ADMIN_PASSWORD` s'il n'existe pas déjà.
- Durée de vie du jeton : variable `JWT_EXPIRES_IN`. Un jeton présent dans `revoked_tokens` est refusé.

### Suppression en cascade d'un compte

Quand un compte est supprimé (par lui-même ou par un admin), le service accounts :

1. appelle `DELETE http://tasks:8002/internal/users/{id}/tasks`
2. appelle `DELETE http://projects:8001/internal/users/{id}/projects`
3. supprime l'utilisateur de sa propre table.

Si l'une des deux premières étapes échoue, le compte n'est **pas** supprimé et la réponse est `502`.

## 4. Service projects (PHP / Symfony, port 8001)

### Routes protégées

| Route | Corps | Réponse |
|---|---|---|
| `GET /api/projects` | | `200 [ {id, name, description, created_at}, ... ]` (uniquement les projets de l'utilisateur) |
| `POST /api/projects` | `{name, description?}` | `201 {id, name, description, created_at}`. `400` si `name` manque. |
| `GET /api/projects/{id}` | | `200 {...}`. `404` si le projet n'existe pas ou n'appartient pas à l'utilisateur. |
| `PUT /api/projects/{id}` | `{name?, description?}` | `200 {...}`. `404` comme ci-dessus. |
| `DELETE /api/projects/{id}` | | `204`. Appelle d'abord `DELETE http://tasks:8002/internal/projects/{id}/tasks`. `502` si cet appel échoue. |

### Routes internes

| Route | Réponse |
|---|---|
| `GET /internal/projects/{id}` | `200 {id, user_id}` ou `404`. Utilisée par tasks pour vérifier le propriétaire d'un projet. |
| `DELETE /internal/users/{userId}/projects` | `204`. Supprime tous les projets de l'utilisateur. |

## 5. Service tasks (PHP / Symfony, port 8002)

### Routes protégées

| Route | Corps | Réponse |
|---|---|---|
| `GET /api/tasks?projectId={id}` | | `200 [ {id, projectId, title, done, created_at}, ... ]`. `400` si `projectId` manque. |
| `POST /api/tasks` | `{projectId, title}` | `201 {...}`. Vérifie le projet via `GET http://projects:8001/internal/projects/{projectId}`. `404` si le projet n'existe pas ou n'appartient pas à l'utilisateur. `400` si `title` manque. |
| `PUT /api/tasks/{id}` | `{title?, done?}` | `200 {...}`. `404` si introuvable ou à quelqu'un d'autre. |
| `DELETE /api/tasks/{id}` | | `204`. `404` si introuvable ou à quelqu'un d'autre. |

### Routes internes

| Route | Réponse |
|---|---|
| `DELETE /internal/projects/{projectId}/tasks` | `204`. Supprime toutes les tâches du projet. |
| `DELETE /internal/users/{userId}/tasks` | `204`. Supprime toutes les tâches de l'utilisateur. |

## 6. Ce que nginx expose

| Chemin | Destination | Accès |
|---|---|---|
| `/` et `/login` | pages statiques | public |
| `/app/` | page projets et tâches | connecté, sinon redirection vers `/login` |
| `/admin/` | page de gestion des comptes | connecté, sinon redirection vers `/login` (le contrôle du rôle admin est fait par l'API) |
| `/api/auth/register`, `/api/auth/login` | accounts | public |
| `/api/auth/logout`, `/api/users/...` | accounts | connecté |
| `/api/projects/...` | projects | connecté |
| `/api/tasks/...` | tasks | connecté |
| `/internal/...`, `/health` | aucune | bloqué (`404`) |
| tout autre chemin | | page d'erreur `404` |

## 7. Pages du frontend

| Page | Contenu | Accès |
|---|---|---|
| `/` | Accueil | public |
| `/login` | Connexion et création de compte | public |
| `/app/` | Projets et tâches, bouton de déconnexion, suppression du compte | connecté |
| `/admin/` | Liste des comptes et suppression d'un compte standard | connecté (admin pour que les actions aboutissent) |

## 8. Décisions prises

- Langages : Node.js pour accounts, PHP / Symfony pour projects et tasks. Les services ne communiquent qu'en HTTP/JSON, donc le langage d'un service n'a aucun effet sur les autres.
- Frontend sans état : nginx et les pages statiques ne gardent aucune session. La validité d'une session est décidée par le service accounts, à partir de la base (tables `users` et `revoked_tokens`).
- Jeton JWT dans un cookie HttpOnly, révocation par table `revoked_tokens`.
- Nommage : tous les services portent un nom anglais (`frontend`, `accounts`, `projects`, `tasks`, `db`), identique dans les dossiers, le compose, les adresses internes et les images Docker.
- Un `404` plutôt qu'un `403` quand une ressource appartient à quelqu'un d'autre, pour ne pas révéler son existence.
- La cascade de suppression est pilotée par le service accounts.
- `user_id` est copié dans `tasks` pour contrôler les accès sans appel au service projects (sauf à la création d'une tâche).
