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

/**
 * Routes protégées de tasks (docs/api.md, section 5).
 * L'identité de l'utilisateur vient de l'en-tête X-User-Id posé par nginx :
 * ce service ne lit jamais le jeton.
 */
#[Route('/api/tasks')]
class TaskController extends AbstractController
{
    private const TITLE_MAX = 255;

    public function __construct(private readonly HttpClientInterface $httpClient)
    {
    }

    /** Identifiant de l'utilisateur, ou null si l'en-tête est absent ou invalide. */
    private function userId(Request $request): ?int
    {
        $value = $request->headers->get('X-User-Id');

        return ($value !== null && ctype_digit($value) && (int) $value > 0) ? (int) $value : null;
    }

    private function unauthorized(): JsonResponse
    {
        return $this->json(['error' => 'Non connecté'], Response::HTTP_UNAUTHORIZED);
    }

    /** Corps JSON sous forme de tableau, ou null s'il est invalide. */
    private function body(Request $request): ?array
    {
        $data = json_decode($request->getContent(), true);

        return is_array($data) ? $data : null;
    }

    /** Identifiant de projet valide (entier positif, en nombre ou en texte), sinon null. */
    private function projectId(mixed $value): ?int
    {
        if (is_int($value) && $value > 0) {
            return $value;
        }
        if (is_string($value) && ctype_digit($value) && (int) $value > 0) {
            return (int) $value;
        }

        return null;
    }

    /** Message d'erreur si le titre est invalide, null sinon. */
    private function titleError(mixed $title): ?string
    {
        if (!is_string($title) || trim($title) === '') {
            return 'Le titre est obligatoire';
        }
        if (mb_strlen(trim($title)) > self::TITLE_MAX) {
            return 'Le titre ne doit pas dépasser '.self::TITLE_MAX.' caractères';
        }

        return null;
    }

    /**
     * Demande au service projects si le projet existe et appartient à l'utilisateur.
     * Renvoie null si tout est correct, sinon la réponse d'erreur à retourner :
     *  - 404 si le projet n'existe pas ou appartient à quelqu'un d'autre (on ne révèle pas son existence) ;
     *  - 502 si le service projects ne répond pas.
     */
    private function checkProjectOwner(int $projectId, int $userId): ?JsonResponse
    {
        $projectsUrl = rtrim($_SERVER['PROJECTS_URL'] ?? getenv('PROJECTS_URL') ?: 'http://projects:8001', '/');

        try {
            $response = $this->httpClient->request('GET', "{$projectsUrl}/internal/projects/{$projectId}", ['timeout' => 5]);
            $status = $response->getStatusCode();

            if ($status === Response::HTTP_NOT_FOUND) {
                return $this->json(['error' => 'Projet introuvable'], Response::HTTP_NOT_FOUND);
            }
            if ($status !== Response::HTTP_OK) {
                return $this->json(['error' => 'Le service projects a répondu une erreur'], Response::HTTP_BAD_GATEWAY);
            }

            $project = $response->toArray();
        } catch (\Throwable) {
            return $this->json(['error' => 'Le service projects ne répond pas'], Response::HTTP_BAD_GATEWAY);
        }

        if ((int) ($project['user_id'] ?? 0) !== $userId) {
            return $this->json(['error' => 'Projet introuvable'], Response::HTTP_NOT_FOUND);
        }

        return null;
    }

    #[Route('', name: 'task_index', methods: ['GET'])]
    public function index(Request $request, TaskRepository $taskRepository): JsonResponse
    {
        $userId = $this->userId($request);
        if ($userId === null) {
            return $this->unauthorized();
        }

        $projectId = $this->projectId($request->query->get('projectId'));
        if ($projectId === null) {
            return $this->json(['error' => 'Le paramètre projectId est obligatoire'], Response::HTTP_BAD_REQUEST);
        }

        if ($error = $this->checkProjectOwner($projectId, $userId)) {
            return $error;
        }

        return $this->json($taskRepository->findBy(['projectId' => $projectId, 'userId' => $userId], ['id' => 'ASC']));
    }

    #[Route('', name: 'task_create', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $entityManager): JsonResponse
    {
        $userId = $this->userId($request);
        if ($userId === null) {
            return $this->unauthorized();
        }

        $data = $this->body($request);
        if ($data === null) {
            return $this->json(['error' => 'JSON invalide'], Response::HTTP_BAD_REQUEST);
        }
        $projectId = $this->projectId($data['projectId'] ?? null);
        if ($projectId === null) {
            return $this->json(['error' => 'projectId est obligatoire'], Response::HTTP_BAD_REQUEST);
        }
        if ($error = $this->titleError($data['title'] ?? null)) {
            return $this->json(['error' => $error], Response::HTTP_BAD_REQUEST);
        }
        if (isset($data['done']) && !is_bool($data['done'])) {
            return $this->json(['error' => 'done doit être un booléen'], Response::HTTP_BAD_REQUEST);
        }

        if ($error = $this->checkProjectOwner($projectId, $userId)) {
            return $error;
        }

        $task = new Task();
        $task->setProjectId($projectId);
        $task->setUserId($userId);
        $task->setTitle(trim($data['title']));
        $task->setDone($data['done'] ?? false);

        $entityManager->persist($task);
        $entityManager->flush();

        return $this->json($task, Response::HTTP_CREATED);
    }

    #[Route('/{id<\d+>}', name: 'task_update', methods: ['PUT', 'PATCH'])]
    public function update(int $id, Request $request, TaskRepository $taskRepository, EntityManagerInterface $entityManager): JsonResponse
    {
        $userId = $this->userId($request);
        if ($userId === null) {
            return $this->unauthorized();
        }

        // Une tâche qui appartient à quelqu'un d'autre répond 404 (et non 403).
        $task = $taskRepository->findOneBy(['id' => $id, 'userId' => $userId]);
        if (!$task) {
            return $this->json(['error' => 'Tâche introuvable'], Response::HTTP_NOT_FOUND);
        }

        $data = $this->body($request);
        if ($data === null) {
            return $this->json(['error' => 'JSON invalide'], Response::HTTP_BAD_REQUEST);
        }

        // Les deux champs sont facultatifs : on ne modifie que ceux qui sont envoyés.
        if (array_key_exists('title', $data)) {
            if ($error = $this->titleError($data['title'])) {
                return $this->json(['error' => $error], Response::HTTP_BAD_REQUEST);
            }
            $task->setTitle(trim($data['title']));
        }
        if (array_key_exists('done', $data)) {
            if (!is_bool($data['done'])) {
                return $this->json(['error' => 'done doit être un booléen'], Response::HTTP_BAD_REQUEST);
            }
            $task->setDone($data['done']);
        }

        $entityManager->flush();

        return $this->json($task);
    }

    #[Route('/{id<\d+>}', name: 'task_delete', methods: ['DELETE'])]
    public function delete(int $id, Request $request, TaskRepository $taskRepository, EntityManagerInterface $entityManager): Response
    {
        $userId = $this->userId($request);
        if ($userId === null) {
            return $this->unauthorized();
        }

        $task = $taskRepository->findOneBy(['id' => $id, 'userId' => $userId]);
        if (!$task) {
            return $this->json(['error' => 'Tâche introuvable'], Response::HTTP_NOT_FOUND);
        }

        $entityManager->remove($task);
        $entityManager->flush();

        return new Response(null, Response::HTTP_NO_CONTENT);
    }
}
