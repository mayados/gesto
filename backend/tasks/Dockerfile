# Service tasks (PHP / Symfony)

# --- Étape 1 : dépendances PHP (Composer) ---
FROM composer:2 AS vendor
WORKDIR /app

# Les fichiers de dépendances d'abord : cette couche n'est reconstruite que s'ils changent.
COPY composer.json composer.lock symfony.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

# Le code ensuite, puis l'autoloader optimisé.
COPY . .
RUN composer dump-autoload --no-dev --optimize --classmap-authoritative

# --- Étape 2 : image finale, sans Composer ni outils de développement ---
FROM php:8.3-cli-alpine AS final

RUN docker-php-ext-install pdo_mysql

ENV APP_ENV=prod \
    APP_DEBUG=0

WORKDIR /var/www/html
COPY --from=vendor /app /var/www/html

# var/ est le seul dossier où Symfony écrit (cache, journaux).
RUN mkdir -p var/cache var/log && chown -R www-data:www-data var

USER www-data

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8002/health"]

# Serveur intégré de PHP, suffisant pour ce projet. Forme « exec » : php reçoit SIGTERM.
CMD ["php", "-S", "0.0.0.0:8002", "-t", "public"]
