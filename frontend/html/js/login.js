'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // Sélection des éléments du DOM
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  
  // Création dynamique d'une boîte d'alerte si elle n'existe pas dans le HTML
  let alertBox = document.getElementById('alert-box');
  if (!alertBox) {
    alertBox = document.createElement('div');
    alertBox.id = 'alert-box';
    alertBox.className = 'alert';
    const container = document.querySelector('.container');
    if (container) {
      container.insertBefore(alertBox, container.firstChild);
    }
  }

  // Création dynamique des boutons d'onglets si tu souhaites basculer visuellement entre les deux formulaires
  const container = document.querySelector('.container');
  if (container && !document.querySelector('.tabs')) {
    const tabsDiv = document.createElement('div');
    tabsDiv.className = 'tabs';
    
    const loginTab = document.createElement('button');
    loginTab.type = 'button';
    loginTab.className = 'tab active';
    loginTab.textContent = 'Connexion';
    loginTab.onclick = () => switchTab('login');

    const registerTab = document.createElement('button');
    registerTab.type = 'button';
    registerTab.className = 'tab';
    registerTab.textContent = 'Inscription';
    registerTab.onclick = () => switchTab('register');

    tabsDiv.appendChild(loginTab);
    tabsDiv.appendChild(registerTab);
    container.insertBefore(tabsDiv, alertBox);
  }

  // Par défaut, afficher uniquement le formulaire de connexion
  if (loginForm && registerForm) {
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
  }

  // Écouteurs d'événements pour la soumission des formulaires
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }
});

function switchTab(tab) {
  const tabs = document.querySelectorAll('.tab');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  
  hideAlert();

  if (tabs.length >= 2) {
    tabs[0].classList.toggle('active', tab === 'login');
    tabs[1].classList.toggle('active', tab === 'register');
  }

  if (loginForm && registerForm) {
    if (tab === 'login') {
      loginForm.classList.add('active');
      registerForm.classList.remove('active');
    } else {
      registerForm.classList.add('active');
      loginForm.classList.remove('active');
    }
  }
}

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

async function handleLogin(event) {
  event.preventDefault();
  hideAlert();

  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  
  if (!emailInput || !passwordInput) return;

  const email = emailInput.value;
  const password = passwordInput.value;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur lors de la connexion');
    }

    // Connexion réussie : le cookie HttpOnly est géré par le navigateur.
    // Redirection vers l'espace protégé des projets.
    window.location.href = '/app/';
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function handleRegister(event) {
  event.preventDefault();
  hideAlert();

  const nameInput = document.getElementById('register-name');
  const emailInput = document.getElementById('register-email');
  const passwordInput = document.getElementById('register-password');

  if (!nameInput || !emailInput || !passwordInput) return;

  const name = nameInput.value;
  const email = emailInput.value;
  const password = passwordInput.value;

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erreur lors de l'inscription");
    }

    showAlert('Compte créé avec succès ! Vous pouvez vous connecter.', 'success');
    document.getElementById('register-form').reset();
    setTimeout(() => switchTab('login'), 2000);
  } catch (err) {
    showAlert(err.message, 'error');
  }
}