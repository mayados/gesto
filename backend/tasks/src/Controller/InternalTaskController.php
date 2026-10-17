<?php

namespace App\Controller;

use App\Repository\TaskRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/internal/tasks')]
class InternalTaskController extends AbstractController
{
    // Route appelée lors de la suppression d'un projet pour nettoyer ses tâches
    #[Route('/project/{projectId<\d+>}', name: 'internal_tasks_delete_by_project', methods: ['DELETE'])]
    public function deleteByProject(int $projectId, TaskRepository $taskRepository, EntityManagerInterface $entityManager): JsonResponse
    {
        $tasks = $taskRepository->findBy(['projectId' => $projectId]);

        foreach ($tasks as $task) {
            $entityManager->remove($task);
        }

        $entityManager->flush();

        return $this->json(['message' => 'Tasks deleted successfully for project']);
    }

    // Route appelée par accounts lors de la suppression en cascade d'un compte
    #[Route('/user/{userId<\d+>}', name: 'internal_tasks_delete_by_user', methods: ['DELETE'])]
    public function deleteByUser(int $userId, TaskRepository $taskRepository, EntityManagerInterface $entityManager): JsonResponse
    {
        $tasks = $taskRepository->findBy(['userId' => $userId]);

        foreach ($tasks as $task) {
            $entityManager->remove($task);
        }

        $entityManager->flush();

        return $this->json(['message' => 'Tasks deleted successfully for user']);
    }
}