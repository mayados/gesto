'use strict';

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAndLoad();
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
});

function showAlert(message, type = 'error') {
    const box = document.getElementById('alert-box');
    if (!box) return;
    box.textContent = message;
    box.className = `alert ${type}`;
    box.style.display = 'block';
}

async function checkAdminAndLoad() {
    try {
        // 1. Vérifier le profil courant et s'assurer qu'il est admin
        const meRes = await fetch('/api/users/me', { cache: 'no-store' });
        if (!meRes.ok) {
            window.location.href = '/login';
            return;
        }
        const me = await meRes.json();
        if (me.role !== 'admin') {
            showAlert('Accès refusé : réservé aux administrateurs.');
            setTimeout(() => { window.location.href = '/app/'; }, 2000);
            return;
        }

        // 2. Charger la liste de tous les comptes
        loadUsers();
    } catch (err) {
        console.error(err);
        window.location.href = '/login';
    }
}

async function loadUsers() {
    try {
        const res = await fetch('/api/users', { cache: 'no-store' });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Impossible de charger la liste des comptes');
        }
        const users = await res.json();

        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = '';

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1rem; color: #94a3b8;">Aucun utilisateur trouvé.</td></tr>';
            return;
        }

        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #f1f5f9';

            tr.innerHTML = `
            <td style="padding: 0.75rem;">${user.id}</td>
            <td style="padding: 0.75rem; font-weight: 500;">${escapeHtml(user.name)}</td>
            <td style="padding: 0.75rem; color: #64748b;">${escapeHtml(user.email)}</td>
            <td style="padding: 0.75rem;"><span style="padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; background: ${user.role === 'admin' ? '#dbeafe' : '#f1f5f9'}; color: ${user.role === 'admin' ? '#1e40af' : '#475569'};">${user.role}</span></td>
            <td style="padding: 0.75rem; color: #64748b; font-size: 0.85rem;">${new Date(user.created_at).toLocaleDateString()}</td>
            <td style="padding: 0.75rem; text-align: right;">
              ${user.role !== 'admin' ? `<button onclick="deleteUser(${user.id})" class="btn-delete" style="background: none; border: none; color: #ef4444; cursor: pointer; font-weight: 500;">Supprimer</button>` : '<span style="color: #cbd5e1; font-size: 0.85rem;">Protégé</span>'}
            </td>
          `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        showAlert(err.message);
    }
}

async function deleteUser(userId) {
    if (!confirm('Voulez-vous vraiment supprimer ce compte standard ainsi que toutes ses données (projets et tâches) ?')) return;

    try {
        const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Erreur lors de la suppression du compte');
        }
        loadUsers();
    } catch (err) {
        showAlert(err.message);
    }
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
    } catch (err) {
        console.error(err);
    }
}

function escapeHtml(str) {
    return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}