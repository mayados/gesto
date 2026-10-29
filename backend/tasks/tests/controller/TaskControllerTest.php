<?php

namespace App\Tests\Controller;

use App\Controller\InternalTaskController;
use App\Controller\TaskController;
use App\Entity\Task;
use App\Repository\TaskRepository;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpClient\Exception\TransportException;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Contracts\HttpClient\HttpClientInterface;

class TaskControllerTest extends TestCase
{
    private function controller(?HttpClientInterface $client = null): TaskController
    {
        $controller = new TaskController($client ?? $this->projectsOwnedBy(1));
        $controller->setContainer(new Container());

        return $controller;
    }

    /** Faux service projects : le projet existe et appartient à $ownerId. */
    private function projectsOwnedBy(int $ownerId): HttpClientInterface
    {
        return new MockHttpClient(new MockResponse(json_encode(['id' => 1, 'user_id' => $ownerId])));
    }

    private function request(?string $userId, ?array $body = null, array $query = []): Request
    {
        $request = new Request($query, [], [], [], [], [], $body === null ? null : json_encode($body));
        if ($userId !== null) {
            $request->headers->set('X-User-Id', $userId);
        }

        return $request;
    }

    private function task(int $userId = 1): Task
    {
        return (new Task())->setProjectId(1)->setUserId($userId)->setTitle('Ma tâche');
    }

    // ---- Format de la réponse (contrat d'API) ----

    public function testTaskIsSerializedAccordingToTheContract(): void
    {
        $json = json_decode(json_encode($this->task()), true);

        $this->assertSame(['id', 'projectId', 'title', 'done', 'created_at'], array_keys($json));
        $this->assertFalse($json['done']);
        $this->assertArrayNotHasKey('user_id', $json);
    }

    // ---- Authentification ----

    #[DataProvider('invalidHeaders')]
    public function testMissingOrInvalidUserIdIsUnauthorized(?string $header): void
    {
        $response = $this->controller()->index($this->request($header, null, ['projectId' => '1']), $this->createStub(TaskRepository::class));

        $this->assertSame(401, $response->getStatusCode());
    }

    public static function invalidHeaders(): array
    {
        return [[null], [''], ['abc'], ['0'], ['-3']];
    }

    // ---- Liste ----

    #[DataProvider('invalidProjectIds')]
    public function testIndexRequiresAValidProjectId(array $query): void
    {
        $response = $this->controller()->index($this->request('1', null, $query), $this->createStub(TaskRepository::class));

        $this->assertSame(400, $response->getStatusCode());
    }

    public static function invalidProjectIds(): array
    {
        return [[[]], [['projectId' => '']], [['projectId' => 'abc']], [['projectId' => '0']], [['project_id' => '1']]];
    }

    public function testIndexReturnsTheTasksOfTheProject(): void
    {
        $repo = $this->createMock(TaskRepository::class);
        $repo->expects($this->once())->method('findBy')
            ->with(['projectId' => 1, 'userId' => 1], ['id' => 'ASC'])
            ->willReturn([$this->task()]);

        $response = $this->controller()->index($this->request('1', null, ['projectId' => '1']), $repo);

        $this->assertSame(200, $response->getStatusCode());
        $body = json_decode($response->getContent(), true);
        $this->assertSame('Ma tâche', $body[0]['title']);
        $this->assertSame(1, $body[0]['projectId']);
    }

    public function testIndexOnAProjectOfSomeoneElseIsNotFound(): void
    {
        $repo = $this->createMock(TaskRepository::class);
        $repo->expects($this->never())->method('findBy');

        $response = $this->controller($this->projectsOwnedBy(2))->index($this->request('1', null, ['projectId' => '1']), $repo);

        $this->assertSame(404, $response->getStatusCode());
    }

    public function testUnknownProjectIsNotFound(): void
    {
        $client = new MockHttpClient(new MockResponse('{}', ['http_code' => 404]));

        $response = $this->controller($client)->index($this->request('1', null, ['projectId' => '9']), $this->createStub(TaskRepository::class));

        $this->assertSame(404, $response->getStatusCode());
    }

    public function testProjectsServiceDownGivesBadGateway(): void
    {
        $client = new MockHttpClient(fn () => throw new TransportException('connexion refusée'));

        $response = $this->controller($client)->index($this->request('1', null, ['projectId' => '1']), $this->createStub(TaskRepository::class));

        $this->assertSame(502, $response->getStatusCode());
    }

    public function testProjectsServiceErrorGivesBadGateway(): void
    {
        $client = new MockHttpClient(new MockResponse('oups', ['http_code' => 500]));

        $response = $this->controller($client)->index($this->request('1', null, ['projectId' => '1']), $this->createStub(TaskRepository::class));

        $this->assertSame(502, $response->getStatusCode());
    }

    // ---- Création ----

    public function testCreatePersistsATaskOwnedByTheCaller(): void
    {
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->once())->method('persist')->with($this->callback(
            fn (Task $t) => $t->getProjectId() === 1 && $t->getUserId() === 1 && $t->getTitle() === 'À faire' && $t->isDone() === false
        ));
        $em->expects($this->once())->method('flush');

        $response = $this->controller()->create($this->request('1', ['projectId' => 1, 'title' => ' À faire ']), $em);

        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame('À faire', json_decode($response->getContent(), true)['title']);
    }

    #[DataProvider('invalidCreateBodies')]
    public function testCreateRejectsInvalidData(array $body): void
    {
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->never())->method('persist');

        $response = $this->controller()->create($this->request('1', $body), $em);

        $this->assertSame(400, $response->getStatusCode());
    }

    public static function invalidCreateBodies(): array
    {
        return [
            'sans projectId' => [['title' => 'x']],
            'projectId invalide' => [['projectId' => 'abc', 'title' => 'x']],
            'ancien nom project_id' => [['project_id' => 1, 'title' => 'x']],
            'sans titre' => [['projectId' => 1]],
            'titre vide' => [['projectId' => 1, 'title' => '  ']],
            'titre trop long' => [['projectId' => 1, 'title' => str_repeat('a', 256)]],
            'done invalide' => [['projectId' => 1, 'title' => 'x', 'done' => 'oui']],
        ];
    }

    public function testCreateInAProjectOfSomeoneElseIsNotFound(): void
    {
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->never())->method('persist');

        $response = $this->controller($this->projectsOwnedBy(2))->create($this->request('1', ['projectId' => 1, 'title' => 'x']), $em);

        $this->assertSame(404, $response->getStatusCode());
    }

    // ---- Modification / suppression ----

    public function testUpdateChangesOnlyTheSentFields(): void
    {
        $task = $this->task();
        $repo = $this->createStub(TaskRepository::class);
        $repo->method('findOneBy')->willReturn($task);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->once())->method('flush');

        $response = $this->controller()->update(1, $this->request('1', ['done' => true]), $repo, $em);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertTrue($task->isDone());
        $this->assertSame('Ma tâche', $task->getTitle());
    }

    public function testUpdateRejectsEmptyTitleAndNonBooleanDone(): void
    {
        $repo = $this->createStub(TaskRepository::class);
        $repo->method('findOneBy')->willReturn($this->task());
        $em = $this->createStub(EntityManagerInterface::class);

        $this->assertSame(400, $this->controller()->update(1, $this->request('1', ['title' => '']), $repo, $em)->getStatusCode());
        $this->assertSame(400, $this->controller()->update(1, $this->request('1', ['done' => 'yes']), $repo, $em)->getStatusCode());
    }

    public function testUpdateOfSomeoneElsesTaskIsNotFound(): void
    {
        $repo = $this->createMock(TaskRepository::class);
        $repo->expects($this->once())->method('findOneBy')->with(['id' => 5, 'userId' => 2])->willReturn(null);

        $response = $this->controller()->update(5, $this->request('2', ['done' => true]), $repo, $this->createStub(EntityManagerInterface::class));

        $this->assertSame(404, $response->getStatusCode());
    }

    public function testDeleteRemovesTheTask(): void
    {
        $task = $this->task();
        $repo = $this->createStub(TaskRepository::class);
        $repo->method('findOneBy')->willReturn($task);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->once())->method('remove')->with($task);
        $em->expects($this->once())->method('flush');

        $this->assertSame(204, $this->controller()->delete(1, $this->request('1'), $repo, $em)->getStatusCode());
    }

    public function testDeleteOfSomeoneElsesTaskIsNotFound(): void
    {
        $repo = $this->createStub(TaskRepository::class);
        $repo->method('findOneBy')->willReturn(null);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->never())->method('remove');

        $this->assertSame(404, $this->controller()->delete(1, $this->request('2'), $repo, $em)->getStatusCode());
    }

    // ---- Routes internes ----

    public function testInternalCleanupByProjectAndByUser(): void
    {
        $controller = new InternalTaskController();
        $controller->setContainer(new Container());

        $repo = $this->createMock(TaskRepository::class);
        $repo->expects($this->exactly(2))->method('findBy')
            ->willReturnMap([
                [['projectId' => 4], null, null, null, [$this->task(), $this->task()]],
                [['userId' => 3], null, null, null, [$this->task()]],
            ]);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->exactly(3))->method('remove');
        $em->expects($this->exactly(2))->method('flush');

        $this->assertSame(204, $controller->deleteByProject(4, $repo, $em)->getStatusCode());
        $this->assertSame(204, $controller->deleteByUser(3, $repo, $em)->getStatusCode());
    }
}
