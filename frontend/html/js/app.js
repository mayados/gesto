'use strict';

let currentProjectId = null;

document.addEventListener('DOMContentLoaded', () => {
  checkAuthAndLoad();

  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('delete-account-btn').addEventListener('click', handleDeleteAccount);
  document.getElementById('create-project-form').addEventListener('submit', handleCreateProject);
  document.getElementById('create-task-form').addEventListener('submit', handleCreateTask);
});

function showAlert(message, type = 'error') {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.textContent = message;
  box.className = `alert ${type}`;
  box.style.display = 'block';
}

function hideAlert() {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.style.display = 'none';
}

// 1. Vérification de la session et chargement initial des projets
async function checkAuthAndLoad() {
  try {
    const res = await fetch('/api/users/me');
    if (!res.ok) {
      window.location.href = '/login';
      return;
    }
    const user = await res.json();
    document.getElementById('user-profile-name').textContent = `Connecté : ${user.name} (${user.email})`;

    loadProjects();
  } catch (err) {
    console.error(err);
    window.location.href = '/login';
  }
}

// ==========================================
// Gestion des Projets
// ==========================================
async function loadProjects() {
  try {
    const res = await fetch('/api/projects');
    if (!res.ok) throw new Error('Impossible de charger les projets');
    const projects = await res.json();

    const list = document.getElementById('projects-list');
    list.innerHTML = '';

    if (projects.length === 0) {
      list.innerHTML = '<li class="empty-item">Aucun projet pour le moment.</li>';
      return;
    }

    projects.forEach(project => {
      const li = document.createElement('li');
      li.className = `item-row ${project.id === currentProjectId ? 'selected' : ''}`;
      
      const span = document.createElement('span');
      span.textContent = project.name;
      span.className = 'item-name';
      span.onclick = () => selectProject(project.id, project.name);

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Supprimer';
      delBtn.className = 'btn-delete';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteProject(project.id);
      };

      li.appendChild(span);
      li.appendChild(delBtn);
      list.appendChild(li);
    });
  } catch (err) {
    showAlert(err.message);
  }
}

async function handleCreateProject(e) {
  e.preventDefault();
  hideAlert();

  const nameInput = document.getElementById('project-name');
  const name = nameInput.value.trim();
  if (!name) return;

  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Erreur lors de la création du projet');
    }

    nameInput.value = '';
    loadProjects();
  } catch (err) {
    showAlert(err.message);
  }
}

async function deleteProject(projectId) {
  if (!confirm('Voulez-vous vraiment supprimer ce projet et toutes ses tâches ?')) return;
  hideAlert();

  try {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Erreur lors de la suppression du projet');
    }

    if (currentProjectId === projectId) {
      currentProjectId = null;
      lockTasksSection(true);
    }

    loadProjects();
  } catch (err) {
    showAlert(err.message);
  }
}

function selectProject(projectId, projectName) {
  currentProjectId = projectId;
  document.getElementById('tasks-title').textContent = `Tâches de : ${projectName}`;
  lockTasksSection(false);
  loadProjects(); // Recharge pour mettre à jour la classe sélectionnée
  loadTasks(projectId);
}

function lockTasksSection(lock) {
  const section = document.getElementById('tasks-section');
  if (lock) {
    section.style.opacity = '0.5';
    section.style.pointerEvents = 'none';
    document.getElementById('tasks-title').textContent = 'Sélectionnez un projet';
    document.getElementById('tasks-list').innerHTML = '';
  } else {
    section.style.opacity = '1';
    section.style.pointerEvents = 'auto';
  }
}

// ==========================================
// Gestion des Tâches
// ==========================================
async function loadTasks(projectId) {
  try {
    const res = await fetch(`/api/tasks?projectId=${projectId}`);
    if (!res.ok) throw new Error('Impossible de charger les tâches');
    const tasks = await res.json();

    const list = document.getElementById('tasks-list');
    list.innerHTML = '';

    if (tasks.length === 0) {
      list.innerHTML = '<li class="empty-item">Aucune tâche dans ce projet.</li>';
      return;
    }

    tasks.forEach(task => {
      const li = document.createElement('li');
      li.className = `item-row ${task.done ? 'completed' : ''}`;

      const label = document.createElement('label');
      label.className = 'task-label';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.done;
      checkbox.onchange = () => toggleTaskDone(task.id, checkbox.checked);

      const span = document.createElement('span');
      span.textContent = task.title;

      label.appendChild(checkbox);
      label.appendChild(span);

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Supprimer';
      delBtn.className = 'btn-delete';
      delBtn.onclick = () => deleteTask(task.id);

      li.appendChild(label);
      li.appendChild(delBtn);
      list.appendChild(li);
    });
  } catch (err) {
    showAlert(err.message);
  }
}

async function handleCreateTask(e) {
  e.preventDefault();
  if (!currentProjectId) return;
  hideAlert();

  const titleInput = document.getElementById('task-title');
  const title = titleInput.value.trim();
  if (!title) return;

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: currentProjectId, title })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Erreur lors de la création de la tâche');
    }

    titleInput.value = '';
    loadTasks(currentProjectId);
  } catch (err) {
    showAlert(err.message);
  }
}

async function toggleTaskDone(taskId, done) {
  try {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done })
    });

    if (!res.ok) throw new Error('Erreur lors de la modification de la tâche');
    loadTasks(currentProjectId);
  } catch (err) {
    showAlert(err.message);
  }
}

async function deleteTask(taskId) {
  try {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error('Erreur lors de la suppression de la tâche');
    loadTasks(currentProjectId);
  } catch (err) {
    showAlert(err.message);
  }
}

// ==========================================
// Gestion du Compte (Déconnexion / Suppression)
// ==========================================
async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  } catch (err) {
    console.error(err);
  }
}

async function handleDeleteAccount() {
  if (!confirm('Attention ! Voulez-vous vraiment supprimer votre compte ? Cette action effacera tous vos projets et tâches.')) return;

  try {
    const res = await fetch('/api/users/me', { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Erreur lors de la suppression du compte');
    }
    window.location.href = '/login';
  } catch (err) {
    showAlert(err.message);
  }
}