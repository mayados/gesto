<?php

namespace App\Controller;

use App\Entity\Project;
use App\Repository\ProjectRepository;
use App\Service\TasksClient;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Routes protégées de projects (docs/api.md, section 4).
 * L'identité de l'utilisateur vient de l'en-tête X-User-Id posé par nginx :
 * ce service ne lit jamais le jeton.
 */
#[Route('/api/projects')]
class ProjectController extends AbstractController
{
    private const NAME_MAX = 100;

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

    /** Message d'erreur si le nom est invalide, null sinon. */
    private function nameError(mixed $name): ?string
    {
        if (!is_string($name) || trim($name) === '') {
            return 'Le nom est obligatoire';
        }
        if (mb_strlen(trim($name)) > self::NAME_MAX) {
            return 'Le nom ne doit pas dépasser '.self::NAME_MAX.' caractères';
        }

        return null;
    }

    #[Route('', name: 'project_index', methods: ['GET'])]
    public function index(Request $request, ProjectRepository $projectRepository): JsonResponse
    {
        $userId = $this->userId($request);
        if ($userId === null) {
            return $this->unauthorized();
        }

        // Uniquement les projets de l'utilisateur connecté.
        return $this->json($projectRepository->findBy(['userId' => $userId], ['id' => 'ASC']));
    }

    #[Route('', name: 'project_create', methods: ['POST'])]
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
        if ($error = $this->nameError($data['name'] ?? null)) {
            return $this->json(['error' => $error], Response::HTTP_BAD_REQUEST);
        }
        $description = $data['description'] ?? null;
        if ($description !== null && !is_string($description)) {
            return $this->json(['error' => 'La description doit être un texte'], Response::HTTP_BAD_REQUEST);
        }

        $project = new Project();
        $project->setUserId($userId);
        $project->setName(trim($data['name']));
        $project->setDescription($description);

        $entityManager->persist($project);
        $entityManager->flush();

        return $this->json($project, Response::HTTP_CREATED);
    }

    #[Route('/{id<\d+>}', name: 'project_show', methods: ['GET'])]
    public function show(int $id, Request $request, ProjectRepository $projectRepository): JsonResponse
    {
        $userId = $this->userId($request);
        if ($userId === null) {
            return $this->unauthorized();
        }

        // Un projet qui appartient à quelqu'un d'autre répond 404 (et non 403) pour masquer son existence.
        $project = $projectRepository->findOneBy(['id' => $id, 'userId' => $userId]);
        if (!$project) {
            return $this->json(['error' => 'Projet introuvable'], Response::HTTP_NOT_FOUND);
        }

        return $this->json($project);
    }

    #[Route('/{id<\d+>}', name: 'project_update', methods: ['PUT'])]
    public function update(int $id, Request $request, ProjectRepository $projectRepository, EntityManagerInterface $entityManager): JsonResponse
    {
        $userId = $this->userId($request);
        if ($userId === null) {
            return $this->unauthorized();
        }

        $project = $projectRepository->findOneBy(['id' => $id, 'userId' => $userId]);
        if (!$project) {
            return $this->json(['error' => 'Projet introuvable'], Response::HTTP_NOT_FOUND);
        }

        $data = $this->body($request);
        if ($data === null) {
            return $this->json(['error' => 'JSON invalide'], Response::HTTP_BAD_REQUEST);
        }

        // Les deux champs sont facultatifs : on ne modifie que ceux qui sont envoyés.
        if (array_key_exists('name', $data)) {
            if ($error = $this->nameError($data['name'])) {
                return $this->json(['error' => $error], Response::HTTP_BAD_REQUEST);
            }
            $project->setName(trim($data['name']));
        }
        if (array_key_exists('description', $data)) {
            if ($data['description'] !== null && !is_string($data['description'])) {
                return $this->json(['error' => 'La description doit être un texte'], Response::HTTP_BAD_REQUEST);
            }
            $project->setDescription($data['description']);
        }

        $entityManager->flush();

        return $this->json($project);
    }

    #[Route('/{id<\d+>}', name: 'project_delete', methods: ['DELETE'])]
    public function delete(int $id, Request $request, ProjectRepository $projectRepository, EntityManagerInterface $entityManager, TasksClient $tasksClient): Response
    {
        $userId = $this->userId($request);
        if ($userId === null) {
            return $this->unauthorized();
        }

        $project = $projectRepository->findOneBy(['id' => $id, 'userId' => $userId]);
        if (!$project) {
            return $this->json(['error' => 'Projet introuvable'], Response::HTTP_NOT_FOUND);
        }

        // Les tâches d'abord : si tasks ne répond pas, le projet est conservé (502).
        if (!$tasksClient->deleteProjectTasks($id)) {
            return $this->json(['error' => 'Le service tasks ne répond pas, projet non supprimé'], Response::HTTP_BAD_GATEWAY);
        }

        $entityManager->remove($project);
        $entityManager->flush();

        return new Response(null, Response::HTTP_NO_CONTENT);
    }
}
