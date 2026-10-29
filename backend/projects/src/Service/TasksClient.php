<?php

namespace App\Service;

/**
 * Appelle les routes internes du service tasks.
 * Utilise les flux natifs de PHP : aucune dépendance supplémentaire.
 */
class TasksClient
{
    private string $baseUrl;

    public function __construct(?string $baseUrl = null)
    {
        $this->baseUrl = rtrim($baseUrl ?? ($_SERVER['TASKS_URL'] ?? getenv('TASKS_URL') ?: 'http://tasks:8002'), '/');
    }

    /**
     * Supprime toutes les tâches d'un projet.
     * Renvoie false si tasks est injoignable ou répond autre chose qu'un succès.
     */
    public function deleteProjectTasks(int $projectId): bool
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'DELETE',
                'timeout' => 5,
                'ignore_errors' => true, // on veut lire le code de réponse même en cas d'erreur HTTP
            ],
        ]);

        $headers = [];
        $result = @file_get_contents("{$this->baseUrl}/internal/projects/{$projectId}/tasks", false, $context);
        // $http_response_header est rempli par file_get_contents dans la portée locale.
        $headers = $http_response_header ?? [];

        if ($result === false && $headers === []) {
            return false; // connexion impossible
        }

        return isset($headers[0]) && preg_match('#^HTTP/\S+\s+2\d\d#', $headers[0]) === 1;
    }
}
