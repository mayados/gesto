<?php

use Symfony\Component\Dotenv\Dotenv;

require dirname(__DIR__).'/vendor/autoload.php';

// Charge .env s'il existe : les tests ne doivent pas échouer sur un clone propre.
$envFile = dirname(__DIR__).'/.env';
if (method_exists(Dotenv::class, 'bootEnv') && is_file($envFile)) {
    (new Dotenv())->bootEnv($envFile);
}

if (!empty($_SERVER['APP_DEBUG'])) {
    umask(0000);
}
