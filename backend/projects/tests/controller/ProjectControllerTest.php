<?php

namespace App\Tests\Controller;

use App\Controller\InternalProjectController;
use App\Controller\ProjectController;
use App\Entity\Project;
use App\Repository\ProjectRepository;
use App\Service\TasksClient;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

class ProjectControllerTest extends TestCase
{
    private function controller(): ProjectController
    {
        $controller = new ProjectController();
        // Conteneur vide : AbstractController::json() n'a pas besoin du sérialiseur ici.
        $controller->setContainer(new Container());

        return $controller;
    }

    private function request(?string $userId, ?array $body = null): Request
    {
        $request = new Request([], [], [], [], [], [], $body === null ? null : json_encode($body));
        if ($userId !== null) {
            $request->headers->set('X-User-Id', $userId);
        }

        return $request;
    }

    private function project(int $userId = 1, string $name = 'Mon projet'): Project
    {
        return (new Project())->setUserId($userId)->setName($name)->setDescription('desc');
    }

    // ---- Format de la réponse (contrat d'API) ----

    public function testProjectIsSerializedAccordingToTheContract(): void
    {
        $json = json_decode(json_encode($this->project()), true);

        $this->assertSame(['id', 'name', 'description', 'created_at'], array_keys($json));
        $this->assertSame('Mon projet', $json['name']);
        $this->assertNotEmpty($json['created_at']);
        $this->assertArrayNotHasKey('user_id', $json, 'Le propriétaire ne doit pas être exposé');
    }

    // ---- Authentification (en-tête posé par nginx) ----

    #[DataProvider('invalidHeaders')]
    public function testMissingOrInvalidUserIdIsUnauthorized(?string $header): void
    {
        $repo = $this->createStub(ProjectRepository::class);
        $response = $this->controller()->index($this->request($header), $repo);

        $this->assertSame(Response::HTTP_UNAUTHORIZED, $response->getStatusCode());
    }

    public static function invalidHeaders(): array
    {
        return [[null], [''], ['abc'], ['0'], ['-3'], ['1.5']];
    }

    public function testShowWithoutUserIdIsUnauthorized(): void
    {
        $repo = $this->createMock(ProjectRepository::class);
        $repo->expects($this->never())->method('findOneBy');

        $this->assertSame(401, $this->controller()->show(1, $this->request(null), $repo)->getStatusCode());
    }

    // ---- Liste ----

    public function testIndexOnlyAsksForTheProjectsOfTheCurrentUser(): void
    {
        $repo = $this->createMock(ProjectRepository::class);
        $repo->expects($this->once())->method('findBy')
            ->with(['userId' => 999], ['id' => 'ASC'])
            ->willReturn([]);

        $response = $this->controller()->index($this->request('999'), $repo);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertJsonStringEqualsJsonString('[]', $response->getContent());
    }

    public function testIndexReturnsProjectsWithContractFields(): void
    {
        $repo = $this->createStub(ProjectRepository::class);
        $repo->method('findBy')->willReturn([$this->project(5, 'A')]);

        $body = json_decode($this->controller()->index($this->request('5'), $repo)->getContent(), true);

        $this->assertCount(1, $body);
        $this->assertSame('A', $body[0]['name']);
        $this->assertArrayHasKey('created_at', $body[0]);
    }

    // ---- Création ----

    public function testCreatePersistsAProjectOwnedByTheCaller(): void
    {
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->once())->method('persist')->with($this->callback(
            fn (Project $p) => $p->getUserId() === 7 && $p->getName() === 'Nouveau'
        ));
        $em->expects($this->once())->method('flush');

        $response = $this->controller()->create($this->request('7', ['name' => '  Nouveau  ']), $em);

        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame('Nouveau', json_decode($response->getContent(), true)['name']);
    }

    #[DataProvider('invalidCreateBodies')]
    public function testCreateRejectsInvalidData(?array $body): void
    {
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->never())->method('persist');

        $response = $this->controller()->create($this->request('1', $body), $em);

        $this->assertSame(400, $response->getStatusCode());
    }

    public static function invalidCreateBodies(): array
    {
        return [
            'sans nom' => [['description' => 'x']],
            'nom vide' => [['name' => '   ']],
            'nom en tableau' => [['name' => ['a']]],
            'nom trop long' => [['name' => str_repeat('a', 101)]],
            'description invalide' => [['name' => 'ok', 'description' => 12]],
        ];
    }

    public function testCreateRejectsInvalidJson(): void
    {
        $request = new Request([], [], [], [], [], [], '{pas du json');
        $request->headers->set('X-User-Id', '1');

        $this->assertSame(400, $this->controller()->create($request, $this->createStub(EntityManagerInterface::class))->getStatusCode());
    }

    // ---- Lecture / modification ----

    public function testShowOfSomeoneElsesProjectIsNotFound(): void
    {
        $repo = $this->createMock(ProjectRepository::class);
        $repo->expects($this->once())->method('findOneBy')->with(['id' => 3, 'userId' => 8])->willReturn(null);

        $this->assertSame(404, $this->controller()->show(3, $this->request('8'), $repo)->getStatusCode());
    }

    public function testUpdateChangesOnlyTheSentFields(): void
    {
        $project = $this->project();
        $repo = $this->createStub(ProjectRepository::class);
        $repo->method('findOneBy')->willReturn($project);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->once())->method('flush');

        $response = $this->controller()->update(1, $this->request('1', ['name' => 'Renommé']), $repo, $em);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('Renommé', $project->getName());
        $this->assertSame('desc', $project->getDescription(), 'La description n’a pas été envoyée : inchangée');
    }

    public function testUpdateRejectsEmptyName(): void
    {
        $repo = $this->createStub(ProjectRepository::class);
        $repo->method('findOneBy')->willReturn($this->project());
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->never())->method('flush');

        $this->assertSame(400, $this->controller()->update(1, $this->request('1', ['name' => '']), $repo, $em)->getStatusCode());
    }

    public function testUpdateOfSomeoneElsesProjectIsNotFound(): void
    {
        $repo = $this->createStub(ProjectRepository::class);
        $repo->method('findOneBy')->willReturn(null);

        $response = $this->controller()->update(1, $this->request('2', ['name' => 'x']), $repo, $this->createStub(EntityManagerInterface::class));

        $this->assertSame(404, $response->getStatusCode());
    }

    // ---- Suppression ----

    public function testDeleteRemovesTasksThenTheProject(): void
    {
        $project = $this->project();
        $repo = $this->createStub(ProjectRepository::class);
        $repo->method('findOneBy')->willReturn($project);
        $tasks = $this->createMock(TasksClient::class);
        $tasks->expects($this->once())->method('deleteProjectTasks')->with(4)->willReturn(true);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->once())->method('remove')->with($project);
        $em->expects($this->once())->method('flush');

        $response = $this->controller()->delete(4, $this->request('1'), $repo, $em, $tasks);

        $this->assertSame(204, $response->getStatusCode());
    }

    public function testDeleteKeepsTheProjectWhenTasksIsUnavailable(): void
    {
        $repo = $this->createStub(ProjectRepository::class);
        $repo->method('findOneBy')->willReturn($this->project());
        $tasks = $this->createStub(TasksClient::class);
        $tasks->method('deleteProjectTasks')->willReturn(false);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->never())->method('remove');

        $response = $this->controller()->delete(4, $this->request('1'), $repo, $em, $tasks);

        $this->assertSame(502, $response->getStatusCode());
    }

    public function testDeleteOfSomeoneElsesProjectIsNotFoundAndTasksIsNotCalled(): void
    {
        $repo = $this->createStub(ProjectRepository::class);
        $repo->method('findOneBy')->willReturn(null);
        $tasks = $this->createMock(TasksClient::class);
        $tasks->expects($this->never())->method('deleteProjectTasks');

        $response = $this->controller()->delete(4, $this->request('9'), $repo, $this->createStub(EntityManagerInterface::class), $tasks);

        $this->assertSame(404, $response->getStatusCode());
    }

    // ---- Routes internes ----

    private function internal(): InternalProjectController
    {
        $controller = new InternalProjectController();
        $controller->setContainer(new Container());

        return $controller;
    }

    public function testInternalShowReturnsTheOwner(): void
    {
        $repo = $this->createStub(ProjectRepository::class);
        $repo->method('find')->willReturn($this->project(42));

        $body = json_decode($this->internal()->show(1, $repo)->getContent(), true);

        $this->assertSame(['id', 'user_id'], array_keys($body));
        $this->assertSame(42, $body['user_id']);
    }

    public function testInternalShowUnknownProjectIsNotFound(): void
    {
        $repo = $this->createStub(ProjectRepository::class);
        $repo->method('find')->willReturn(null);

        $this->assertSame(404, $this->internal()->show(1, $repo)->getStatusCode());
    }

    public function testInternalDeleteByUserRemovesAllTheirProjects(): void
    {
        $a = $this->project(3, 'A');
        $b = $this->project(3, 'B');
        $repo = $this->createMock(ProjectRepository::class);
        $repo->expects($this->once())->method('findBy')->with(['userId' => 3])->willReturn([$a, $b]);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->exactly(2))->method('remove');
        $em->expects($this->once())->method('flush');

        $response = $this->internal()->deleteByUser(3, $repo, $em);

        $this->assertSame(204, $response->getStatusCode());
    }
}
