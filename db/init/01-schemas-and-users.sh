#!/bin/bash
# Exécuté UNE SEULE FOIS par l'image MariaDB, à la première création du volume de données.
# Crée un schéma et un utilisateur SQL par service : chaque service n'accède qu'à ses propres tables.

: "${MARIADB_ROOT_PASSWORD:?MARIADB_ROOT_PASSWORD manquant}"
: "${ACCOUNTS_DB_PASSWORD:?ACCOUNTS_DB_PASSWORD manquant}"
: "${PROJECTS_DB_PASSWORD:?PROJECTS_DB_PASSWORD manquant}"
: "${TASKS_DB_PASSWORD:?TASKS_DB_PASSWORD manquant}"

mariadb --user=root --password="${MARIADB_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS gesto_accounts CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS gesto_projects CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS gesto_tasks    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'accounts'@'%' IDENTIFIED BY '${ACCOUNTS_DB_PASSWORD}';
CREATE USER IF NOT EXISTS 'projects'@'%' IDENTIFIED BY '${PROJECTS_DB_PASSWORD}';
CREATE USER IF NOT EXISTS 'tasks'@'%'    IDENTIFIED BY '${TASKS_DB_PASSWORD}';

-- Droits minimaux : lire et écrire des données, mais pas modifier la structure.
GRANT SELECT, INSERT, UPDATE, DELETE ON gesto_accounts.* TO 'accounts'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON gesto_projects.* TO 'projects'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON gesto_tasks.*    TO 'tasks'@'%';

FLUSH PRIVILEGES;
SQL
