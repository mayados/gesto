<?php

namespace App\Controller;

use App\Entity\Task;
use App\Repository\TaskRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\HttpClient\HttpClientInterface;

#[Route('/api/tasks')]
class TaskController extends AbstractController
{
    private HttpClientInterface $httpClient;

    public function __construct(HttpClientInterface $httpClient)
    {
        $this->httpClient = $httpClient;
    }

    /**
     * Vérifie via le service projects si le projet appartient bien à l'utilisateur.
     */
    private function verifyProjectOwner(int $projectId, int $userId): ?JsonResponse
    {
        $projectsUrl = $_ENV['PROJECTS_URL'] ?? 'http://projects:8001';

        try {
            $response = $this->httpClient->request('GET', "{$projectsUrl}/internal/projects/{$projectId}");
            
            if ($response->getStatusCode() !== 200) {
                return $this->json(['error' => 'Project not found'], Response::HTTP_NOT_FOUND);
            }

            $projectData = $response->toArray();

            // Règle de l'énoncé : si le projet n'appartient pas à l'utilisateur, on renvoie 404 pour masquer son existence
            if (!isset($projectData['user_id']) || (int) $projectData['user_id'] !== $userId) {
                return $this->json(['error' => 'Project not found'], Response::HTTP_NOT_FOUND);
            }

        } catch (\Exception $e) {
            return $this->json(['error' => 'Service projects unavailable'], Response::HTTP_SERVICE_UNAVAILABLE);
        }

        return null; // Tout est valide
    }

    #[Route('', name: 'task_index', methods: ['GET'])]
    public function index(Request $request, TaskRepository $taskRepository): JsonResponse
    {
        $userId = $request->headers->get('X-User-Id');
        if (!$userId) {
            return $this->json(['error' => 'Unauthorized - Missing X-User-Id header'], Response::HTTP_UNAUTHORIZED);
        }

        $projectId = $request->query->get('project_id');
        if (!$projectId) {
            return $this->json(['error' => 'Missing project_id query parameter'], Response::HTTP_BAD_REQUEST);
        }

        // Vérifier que le projet appartient bien à l'utilisateur
        if ($errorResponse = $this->verifyProjectOwner((int) $projectId, (int) $userId)) {
            return $errorResponse;
        }

        $tasks = $taskRepository->findBy([
            'projectId' => (int) $projectId,
            'userId' => (int) $userId
        ]);

        return $this->json($tasks);
    }

    #[Route('', name: 'task_create', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $entityManager): JsonResponse
    {
        $userId = $request->headers->get('X-User-Id');
        if (!$userId) {
            return $this->json(['error' => 'Unauthorized'], Response::HTTP_UNAUTHORIZED);
        }

        $data = json_decode($request->getContent(), true);

        if (empty($data['project_id']) || empty($data['title'])) {
            return $this->json(['error' => 'Project ID and title are required'], Response::HTTP_BAD_REQUEST);
        }

        $projectId = (int) $data['project_id'];

        // Vérifier que le projet appartient bien à l'utilisateur
        if ($errorResponse = $this->verifyProjectOwner($projectId, (int) $userId)) {
            return $errorResponse;
        }

        $task = new Task();
        $task->setProjectId($projectId);
        $task->setUserId((int) $userId);
        $task->setTitle($data['title']);
        $task->setDone($data['done'] ?? false);

        $entityManager->persist($task);
        $entityManager->flush();

        return $this->json($task, Response::HTTP_CREATED);
    }

    #[Route('/{id<\d+>}', name: 'task_delete', methods: ['DELETE'])]
    public function delete(int $id, Request $request, TaskRepository $taskRepository, EntityManagerInterface $entityManager): JsonResponse
    {
        $userId = $request->headers->get('X-User-Id');
        if (!$userId) {
            return $this->json(['error' => 'Unauthorized'], Response::HTTP_UNAUTHORIZED);
        }

        $task = $taskRepository->findOneBy([
            'id' => $id,
            'userId' => (int) $userId
        ]);

        if (!$task) {
            return $this->json(['error' => 'Task not found'], Response::HTTP_NOT_FOUND);
        }

        $entityManager->remove($task);
        $entityManager->flush();

        return $this->json(['message' => 'Task deleted successfully']);
    }

    #[Route('/{id<\d+>}', name: 'task_update', methods: ['PUT', 'PATCH'])]
    public function update(int $id, Request $request, TaskRepository $taskRepository, EntityManagerInterface $entityManager): JsonResponse
    {
        $userId = $request->headers->get('X-User-Id');
        if (!$userId) {
            return $this->json(['error' => 'Unauthorized'], Response::HTTP_UNAUTHORIZED);
        }

        // Récupérer la tâche en s'assurant qu'elle appartient bien à l'utilisateur connecté
        $task = $taskRepository->findOneBy([
            'id' => $id,
            'userId' => (int) $userId
        ]);

        if (!$task) {
            return $this->json(['error' => 'Task not found'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true);

        // Mettre à jour le titre s'il est fourni
        if (isset($data['title'])) {
            if (empty(trim($data['title']))) {
                return $this->json(['error' => 'Title cannot be empty'], Response::HTTP_BAD_REQUEST);
            }
            $task->setTitle($data['title']);
        }

        // Mettre à jour l'état "done" s'il est fourni
        if (isset($data['done'])) {
            $task->setDone((bool) $data['done']);
        }

        $entityManager->flush();

        return $this->json($task);
    }
}