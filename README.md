# Gesto

Application web de gestion de tâches organisées par projets, en micro-services.

## Architecture
- frontend : nginx + pages web statiques (sert aussi de gateway)
- backend/comptes : Node.js
- backend/projects : PHP / Symfony
- backend/tasks : PHP / Symfony
- db : MariaDB

## Prérequis
- **Docker Desktop** (ou Docker Engine) avec **Docker Compose v2** : c'est la seule chose nécessaire pour lancer l'application.
- **Git**, pour récupérer le projet.
- Il n'y a **rien d'autre à installer** : pas de `composer install` ni de `npm install` pour faire tourner l'application, car les dépendances (Node.js et PHP/Composer) sont installées pendant la construction des images Docker. PHP, Composer et Node.js ne servent que pour lancer les tests unitaires depuis son poste (voir plus bas).

## Récupérer et configurer le projet
1. Récupérer le code :

```bash
git clone <URL du dépôt>
cd gesto
```

2. Créer le fichier de configuration `.env` à partir du modèle (le vrai `.env` n'est jamais dans le dépôt, car il contient des secrets) :

```bash
cp .env.example .env
```

Sous Windows (invite de commandes) : `copy .env.example .env`.

3. Ouvrir `.env` et **remplacer chaque `change-me`** par une valeur de son choix :
   - mots de passe de la base (`DB_ROOT_PASSWORD`, `ACCOUNTS_DB_PASSWORD`, `PROJECTS_DB_PASSWORD`, `TASKS_DB_PASSWORD`) : lettres et chiffres uniquement (les caractères spéciaux comme `$` ou les guillemets cassent les variables de Docker Compose) ;
   - `JWT_SECRET` : une longue chaîne aléatoire (32 caractères ou plus, lettres et chiffres) ;
   - `ADMIN_EMAIL` et `ADMIN_PASSWORD` : le compte administrateur créé au démarrage (mot de passe de 8 caractères ou plus) ;
   - `PROJECTS_APP_SECRET` et `TASKS_APP_SECRET` : des chaînes aléatoires, lettres et chiffres.

   Si une variable obligatoire manque, Docker Compose refuse de démarrer et indique laquelle.

## Démarrer l'application la première fois : 
docker compose up -d --build

## Fonctionnalités 
    1. Créer un utilisateur 
    2. Supprimer son compte 
    3. Admin : Supprimer un compte utilisateur 
    4. Admin : Lister les comptes 
    5. Créer un projet 
    6. Supprimer un projet 
    7. Créer une tâche 
    8. Modifier l'état d'une tâche
    9. Supprimer une tâche

## Technologies utilisés 
    1. PHP 
    2. Node JS 
    3. Javascript 
    4. HTML5 
    5. CSS/LESS/Easyless  

## Utiliser l'application
- Attendre environ une minute au premier lancement : la base de données s'initialise, puis les services démarrent. Vérifier avec `docker compose ps` : tous les conteneurs doivent être `healthy`.
- Ouvrir **http://localhost:8080** : c'est le seul port publié, celui du frontend. Les backends et la base ne sont pas joignables depuis l'extérieur.
- Créer un compte depuis la page de connexion, ou se connecter avec le compte administrateur défini par `ADMIN_EMAIL` et `ADMIN_PASSWORD` du `.env`.

## Arrêter, relancer, repartir de zéro
```bash
docker compose down        # arrête et supprime les conteneurs, garde les données
docker compose up -d       # relance (ajouter --build si le code a changé)
docker compose logs -f accounts   # suivre les journaux d'un service
docker compose down -v     # arrête ET supprime les données (volume de la base)
```

## Environnements TEST, UAT et PROD
Le même `docker-compose.yml` sert aux trois environnements. Chaque environnement a son fichier de variables (modèles `.env.test.example`, `.env.uat.example`, `.env.prod.example`) et son propre nom de projet, ce qui isole leurs conteneurs, réseaux et volumes :

```bash
cp .env.test.example .env.test    # puis remplacer les change-me
docker compose -p gesto-test --env-file .env.test up -d --build    # http://localhost:8080

cp .env.uat.example .env.uat
docker compose -p gesto-uat --env-file .env.uat up -d --build      # http://localhost:8081

cp .env.prod.example .env.prod
docker compose -p gesto-prod --env-file .env.prod up -d --build    # http://localhost:8082
```

Les fichiers `.env.test`, `.env.uat`, `.env.prod` et `.env` ne sont pas committés. Les limites de CPU et de mémoire de chaque service se règlent dans ces fichiers (`*_CPUS`, `*_MEM`).

## Lancer les tests unitaires
Les tests s'exécutent depuis le poste (ils n'ont pas besoin de Docker) et sont aussi lancés automatiquement par la CI.

```bash
# accounts (Node.js 22 requis)
cd backend/accounts
npm ci
npm test
cd ../..

# projects (PHP 8.3 et Composer requis) ; faire de même avec backend/tasks
cd backend/projects
composer install --no-scripts
DATABASE_URL="mysql://ci:ci@127.0.0.1:3306/ci?serverVersion=mariadb-12.3.0&charset=utf8mb4" php vendor/bin/phpunit
cd ../..
```

## CI/CD
Un pipeline GitHub Actions (`.github/workflows/`) s'exécute à chaque commit et à chaque tag poussé. Pour chaque service (`accounts`, `projects`, `tasks`, `frontend`) il lance les tests unitaires, construit l'image Docker, la teste (démarrage, `/health`, utilisateur non root), puis la publie sur GitHub Container Registry : `ghcr.io/<compte>/gesto-<service>`, avec le tag `sha-<commit>` ou le nom du tag Git. Une erreur à une étape arrête le pipeline et empêche la publication.

## Documentation
Le contrat de l'API (routes, corps, codes de retour) est décrit dans [`docs/api.md`](docs/api.md).

