# Gesto

Application web de gestion de tâches organisées par projets, en micro-services.

## Architecture
- frontend : nginx + pages web statiques (sert aussi de gateway)
- backend/comptes : Node.js
- backend/projects : PHP / Symfony
- backend/tasks : PHP / Symfony
- db : MariaDB

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
