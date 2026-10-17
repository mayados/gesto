<?php

namespace App\Controller;

use App\Entity\Project;
use App\Repository\ProjectRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/projects')]
class ProjectController extends AbstractController
{
    #[Route('', name: 'project_index', methods: ['GET'])]
    public function index(Request $request, ProjectRepository $projectRepository): JsonResponse
    {
        // 1. Récupérer l'ID utilisateur injecté par Nginx
        $userId = $request->headers->get('X-User-Id');

        if (!$userId) {
            return $this->json(['error' => 'Unauthorized - Missing X-User-Id header'], Response::HTTP_UNAUTHORIZED);
        }

        // 2. Filtrer les projets pour ne retourner que ceux de l'utilisateur connecté
        $projects = $projectRepository->findBy(['userId' => (int) $userId]);

        return $this->json($projects);
    }

    #[Route('/{id<\d+>}', name: 'project_show', methods: ['GET'])]
    public function show(int $id, Request $request, ProjectRepository $projectRepository): JsonResponse
    {
        $userId = $request->headers->get('X-User-Id');

        // Récupérer le projet par son ID et l'ID de l'utilisateur
        $project = $projectRepository->findOneBy([
            'id' => $id,
            'userId' => (int) $userId
        ]);

        // Règle de l'énoncé : si la ressource n'appartient pas à l'utilisateur, 
        // on retourne un 404 (et non un 403) pour masquer son existence
        if (!$project) {
            return $this->json(['error' => 'Project not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->json($project);
    }

    #[Route('', name: 'project_create', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $entityManager): JsonResponse
    {
        $userId = $request->headers->get('X-User-Id');
        if (!$userId) {
            return $this->json(['error' => 'Unauthorized'], Response::HTTP_UNAUTHORIZED);
        }

        $data = json_decode($request->getContent(), true);

        if (empty($data['name'])) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $project = new Project();
        $project->setUserId((int) $userId);
        $project->setName($data['name']);
        $project->setDescription($data['description'] ?? null);

        $entityManager->persist($project);
        $entityManager->flush();

        return $this->json($project, Response::HTTP_CREATED);
    }
}