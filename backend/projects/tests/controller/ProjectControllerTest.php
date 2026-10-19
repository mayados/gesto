<?php

namespace App\Tests\Controller;

use App\Controller\ProjectController;
use App\Entity\Project;
use App\Repository\ProjectRepository;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\TestCase;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

class ProjectControllerTest extends TestCase
{
    private function createController(): ProjectController
    {
        $controller = new ProjectController();
        // Injection d'un conteneur vide pour éviter l'erreur de non-initialisation de la propriété $container
        $controller->setContainer(new Container());
        return $controller;
    }

    public function testIndexWithoutUserIdUnauthorized(): void
    {
        $controller = $this->createController();
        $request = new Request(); // Pas d'en-tête X-User-Id

        $projectRepository = $this->createMock(ProjectRepository::class);

        $response = $controller->index($request, $projectRepository);

        $this->assertEquals(Response::HTTP_UNAUTHORIZED, $response->getStatusCode());
    }

    public function testIndexReturnsEmptyArrayForNewUser(): void
    {
        $controller = $this->createController();
        $request = new Request();
        $request->headers->set('X-User-Id', '999');

        $projectRepository = $this->createMock(ProjectRepository::class);
        $projectRepository->expects($this->once())
            ->method('findBy')
            ->with(['userId' => 999])
            ->willReturn([]);

        $response = $controller->index($request, $projectRepository);

        $this->assertEquals(Response::HTTP_OK, $response->getStatusCode());
        $this->assertJsonStringEqualsJsonString('[]', $response->getContent());
    }

    public function testCreateProjectValidationFailed(): void
    {
        $controller = $this->createController();
        
        // Requête sans nom de projet
        $request = new Request([], [], [], [], [], [], json_encode(['description' => 'Pas de nom']));
        $request->headers->set('X-User-Id', '1');

        $entityManager = $this->createMock(EntityManagerInterface::class);
        $entityManager->expects($this->never())->method('persist');

        $response = $controller->create($request, $entityManager);

        $this->assertEquals(Response::HTTP_BAD_REQUEST, $response->getStatusCode());
    }
}