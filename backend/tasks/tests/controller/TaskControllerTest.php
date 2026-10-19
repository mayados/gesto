<?php

namespace App\Tests\Controller;

use App\Controller\TaskController;
use App\Repository\TaskRepository;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\TestCase;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Contracts\HttpClient\ResponseInterface;

class TaskControllerTest extends TestCase
{
    private function createController(HttpClientInterface $httpClient): TaskController
    {
        $controller = new TaskController($httpClient);
        // Injecte un conteneur vide pour éviter l'erreur AbstractController::$container
        $controller->setContainer(new Container());
        return $controller;
    }

    public function testIndexWithoutUserIdUnauthorized(): void
    {
        $httpClient = $this->createMock(HttpClientInterface::class);
        $controller = $this->createController($httpClient);

        $request = new Request(); // Pas d'en-tête X-User-Id
        $taskRepository = $this->createMock(TaskRepository::class);

        $response = $controller->index($request, $taskRepository);

        $this->assertEquals(Response::HTTP_UNAUTHORIZED, $response->getStatusCode());
    }

    public function testIndexMissingProjectIdBadRequest(): void
    {
        $httpClient = $this->createMock(HttpClientInterface::class);
        $controller = $this->createController($httpClient);

        $request = new Request();
        $request->headers->set('X-User-Id', '1');
        // Pas de query parameter project_id

        $taskRepository = $this->createMock(TaskRepository::class);

        $response = $controller->index($request, $taskRepository);

        $this->assertEquals(Response::HTTP_BAD_REQUEST, $response->getStatusCode());
    }

    public function testCreateTaskValidationFailedMissingFields(): void
    {
        $httpClient = $this->createMock(HttpClientInterface::class);
        $controller = $this->createController($httpClient);

        // Requête sans project_id ni title
        $request = new Request([], [], [], [], [], [], json_encode([]));
        $request->headers->set('X-User-Id', '1');

        $entityManager = $this->createMock(EntityManagerInterface::class);

        $response = $controller->create($request, $entityManager);

        $this->assertEquals(Response::HTTP_BAD_REQUEST, $response->getStatusCode());
    }

    public function testCreateTaskSuccessWhenProjectBelongsToUser(): void
    {
        // 1. Simuler la réponse du service projects (le projet 10 appartient bien à l'utilisateur 1)
        $httpResponse = $this->createMock(ResponseInterface::class);
        $httpResponse->expects($this->once())->method('getStatusCode')->willReturn(200);
        $httpResponse->expects($this->once())->method('toArray')->willReturn([
            'id' => 10,
            'user_id' => 1,
            'name' => 'Mon Projet'
        ]);

        $httpClient = $this->createMock(HttpClientInterface::class);
        $httpClient->expects($this->once())
            ->method('request')
            ->willReturn($httpResponse);

        $controller = $this->createController($httpClient);

        // 2. Préparer la requête de création de tâche
        $request = new Request([], [], [], [], [], [], json_encode([
            'project_id' => 10,
            'title' => 'Ma nouvelle tâche'
        ]));
        $request->headers->set('X-User-Id', '1');

        $entityManager = $this->createMock(EntityManagerInterface::class);
        $entityManager->expects($this->once())->method('persist');
        $entityManager->expects($this->once())->method('flush');

        // 3. Exécuter
        $response = $controller->create($request, $entityManager);

        $this->assertEquals(Response::HTTP_CREATED, $response->getStatusCode());
    }

    public function testCreateTaskForbiddenWhenProjectBelongsToAnotherUser(): void
    {
        // 1. Simuler la réponse du service projects (le projet 10 appartient à l'utilisateur 2, pas l'utilisateur 1)
        $httpResponse = $this->createMock(ResponseInterface::class);
        $httpResponse->expects($this->once())->method('getStatusCode')->willReturn(200);
        $httpResponse->expects($this->once())->method('toArray')->willReturn([
            'id' => 10,
            'user_id' => 2, // Autre utilisateur !
            'name' => 'Autre Projet'
        ]);

        $httpClient = $this->createMock(HttpClientInterface::class);
        $httpClient->expects($this->once())
            ->method('request')
            ->willReturn($httpResponse);

        $controller = $this->createController($httpClient);

        $request = new Request([], [], [], [], [], [], json_encode([
            'project_id' => 10,
            'title' => 'Tache interdite'
        ]));
        $request->headers->set('X-User-Id', '1'); // Utilisateur 1 essaie d'ajouter une tâche

        $entityManager = $this->createMock(EntityManagerInterface::class);

        $response = $controller->create($request, $entityManager);

        // Doit renvoyer un 404 (pour masquer l'existence du projet)
        $this->assertEquals(Response::HTTP_NOT_FOUND, $response->getStatusCode());
    }
}