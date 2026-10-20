<?php

namespace App\Controller;

use App\Repository\TaskRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Routes internes (docs/api.md, section 5) : appelées par les autres services,
 * jamais exposées par nginx.
 */
#[Route('/internal')]
class InternalTaskController extends AbstractController
{
    // Appelée par projects quand un projet est supprimé.
    #[Route('/projects/{projectId<\d+>}/tasks', name: 'internal_tasks_delete_by_project', methods: ['DELETE'])]
    public function deleteByProject(int $projectId, TaskRepository $taskRepository, EntityManagerInterface $entityManager): Response
    {
        foreach ($taskRepository->findBy(['projectId' => $projectId]) as $task) {
            $entityManager->remove($task);
        }
        $entityManager->flush();

        return new Response(null, Response::HTTP_NO_CONTENT);
    }

    // Appelée par accounts lors de la suppression en cascade d'un compte.
    #[Route('/users/{userId<\d+>}/tasks', name: 'internal_tasks_delete_by_user', methods: ['DELETE'])]
    public function deleteByUser(int $userId, TaskRepository $taskRepository, EntityManagerInterface $entityManager): Response
    {
        foreach ($taskRepository->findBy(['userId' => $userId]) as $task) {
            $entityManager->remove($task);
        }
        $entityManager->flush();

        return new Response(null, Response::HTTP_NO_CONTENT);
    }
}
