# Gesto

Application web de gestion de tâches organisées par projets, en micro-services.

## Architecture
- frontend : nginx + pages web statiques (sert aussi de gateway)
- backend/comptes : Node.js
- backend/projects : PHP / Symfony
- backend/tasks : PHP / Symfony
- db : MariaDB