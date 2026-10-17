FROM composer:2 AS vendor

WORKDIR /app

COPY composer.json composer.lock symfony.lock ./

RUN composer install \
    --no-scripts \
    --no-autoloader \
    --prefer-dist

COPY . .
RUN composer dump-autoload --optimize

FROM php:8.3-fpm-alpine AS final

RUN docker-php-ext-install pdo_mysql

WORKDIR /var/www/html

COPY --from=vendor /app /var/www/html

RUN mkdir -p var/cache var/log \
    && chown -R www-data:www-data var/

USER www-data

EXPOSE 8001

CMD ["php", "-S", "0.0.0.0:8001", "-t", "public"]