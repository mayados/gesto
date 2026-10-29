FROM composer:2 AS vendor
WORKDIR /app

COPY composer.json composer.lock symfony.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY . .
RUN composer dump-autoload --no-dev --optimize --classmap-authoritative

FROM php:8.3-cli-alpine AS final

RUN docker-php-ext-install pdo_mysql

ENV APP_ENV=prod \
    APP_DEBUG=0

WORKDIR /var/www/html
COPY --from=vendor /app /var/www/html

RUN mkdir -p var/cache var/log && chown -R www-data:www-data var

USER www-data

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8002/health"]

CMD ["php", "-S", "0.0.0.0:8002", "-t", "public"]
