<?php

namespace App\Controller;

use App\Repository\ProjectRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/internal/projects')]
class InternalProjectController extends AbstractController
{
    // Route appelée par le service tasks pour vérifier le propriétaire d'un projet
    #[Route('/{id<\d+>}', name: 'internal_project_show', methods: ['GET'])]
    public function show(int $id, ProjectRepository $projectRepository): JsonResponse
    {
        $project = $projectRepository->find($id);

        if (!$project) {
            return $this->json(['error' => 'Project not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->json([
            'id' => $project->getId(),
            'user_id' => $project->getUserId(),
            'name' => $project->getName(),
        ]);
    }

    // Route appelée par accounts lors de la suppression en cascade d'un compte
    #[Route('/user/{userId<\d+>}', name: 'internal_projects_delete_by_user', methods: ['DELETE'])]
    public function deleteByUser(int $userId, ProjectRepository $projectRepository, EntityManagerInterface $entityManager): JsonResponse
    {
        $projects = $projectRepository->findBy(['userId' => $userId]);

        foreach ($projects as $project) {
            // Note : si vous gérez la cascade des tâches ici ou si tasks s'en charge, 
            // supprimez les entités correspondantes.
            $entityManager->remove($project);
        }

        $entityManager->flush();

        return $this->json(['message' => 'Projects deleted successfully']);
    }
}