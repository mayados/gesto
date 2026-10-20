<?php

namespace App\Controller;

use App\Repository\ProjectRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Routes internes (docs/api.md, section 4) : appelées par les autres services,
 * jamais exposées par nginx.
 */
#[Route('/internal')]
class InternalProjectController extends AbstractController
{
    // Appelée par tasks pour connaître le propriétaire d'un projet.
    #[Route('/projects/{id<\d+>}', name: 'internal_project_show', methods: ['GET'])]
    public function show(int $id, ProjectRepository $projectRepository): JsonResponse
    {
        $project = $projectRepository->find($id);
        if (!$project) {
            return $this->json(['error' => 'Projet introuvable'], Response::HTTP_NOT_FOUND);
        }

        return $this->json(['id' => $project->getId(), 'user_id' => $project->getUserId()]);
    }

    // Appelée par accounts lors de la suppression en cascade d'un compte.
    #[Route('/users/{userId<\d+>}/projects', name: 'internal_projects_delete_by_user', methods: ['DELETE'])]
    public function deleteByUser(int $userId, ProjectRepository $projectRepository, EntityManagerInterface $entityManager): Response
    {
        foreach ($projectRepository->findBy(['userId' => $userId]) as $project) {
            $entityManager->remove($project);
        }
        $entityManager->flush();

        return new Response(null, Response::HTTP_NO_CONTENT);
    }
}
