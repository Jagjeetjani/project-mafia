/**
 * Project Mafia — Login Page & Staff Switcher
 * Fast 1-Tap PIN login for workshop tablets & mobile phones
 */
import { getAll } from '../db.js';
import { authenticate, getCurrentUser } from '../auth.js';
import { showToast } from '../utils.js';

export function renderLoginPage() {
  return `
    <div class="login-wrapper">
      <div class="login-container">
        <!-- Logo Header -->
        <div class="login-header">
          <div class="login-logo-icon">
            <span class="material-icons-round">rocket_launch</span>
          </div>
          <h1 class="login-title">Project Mafia</h1>
          <p class="login-subtitle">Workshop Operations & Business Portal</p>
        </div>

        <!-- Quick 1-Tap Staff Selector Cards -->
        <div class="login-section-title">
          <span>Select Your Profile to Sign In</span>
        </div>

        <div class="staff-cards-grid" id="staff-cards-grid">
          <div style="text-align:center; padding:20px; color:var(--text-tertiary);">Loading profiles...</div>
        </div>

        <!-- PIN Pad Modal / Input Dialog -->
        <div id="pin-entry-card" class="pin-entry-card hidden">
          <div class="pin-user-info">
            <div class="pin-user-avatar" id="pin-avatar"></div>
            <div>
              <div class="pin-user-name" id="pin-user-name"></div>
              <div class="pin-user-role" id="pin-user-role"></div>
            </div>
          </div>

          <form id="pin-form" onsubmit="return false;">
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label" style="text-align:center;">Enter 4-Digit Security PIN</label>
              <input type="password" id="pin-input" maxlength="6" inputmode="numeric" class="form-input pin-input-field" placeholder="••••" autocomplete="current-password" autofocus />
            </div>

            <div class="pin-keypad">
              <button type="button" class="pin-key" data-num="1">1</button>
              <button type="button" class="pin-key" data-num="2">2</button>
              <button type="button" class="pin-key" data-num="3">3</button>
              <button type="button" class="pin-key" data-num="4">4</button>
              <button type="button" class="pin-key" data-num="5">5</button>
              <button type="button" class="pin-key" data-num="6">6</button>
              <button type="button" class="pin-key" data-num="7">7</button>
              <button type="button" class="pin-key" data-num="8">8</button>
              <button type="button" class="pin-key" data-num="9">9</button>
              <button type="button" class="pin-key pin-clear" id="btn-pin-clear">C</button>
              <button type="button" class="pin-key" data-num="0">0</button>
              <button type="button" class="pin-key pin-backspace" id="btn-pin-backspace">
                <span class="material-icons-round" style="font-size:18px;">backspace</span>
              </button>
            </div>

            <div style="display:flex; gap:10px; margin-top:16px;">
              <button type="button" class="btn-secondary" id="btn-cancel-pin" style="flex:1;">Cancel</button>
              <button type="submit" class="btn-primary" id="btn-submit-pin" style="flex:2;">
                <span>Sign In</span>
                <span class="material-icons-round">arrow_forward</span>
              </button>
            </div>
          </form>
        </div>

        <!-- Default Credentials Helper -->
        <div class="login-footer-info">
          <span class="material-icons-round" style="font-size:14px; vertical-align:middle; color:var(--accent-primary-light);">lock</span>
          <span>Default PIN for all profiles is <strong>1234</strong></span>
        </div>
      </div>
    </div>
  `;
}

let selectedProfile = null;

export async function initLoginPage() {
  const grid = document.getElementById('staff-cards-grid');
  if (!grid) return;

  try {
    const members = await getAll('teamMembers');
    if (!members || members.length === 0) {
      grid.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-tertiary);">No profiles found. Initializing...</div>`;
      return;
    }

    grid.innerHTML = members.map(m => {
      const isAdmin = m.role === 'admin';
      const color = m.avatarColor || (isAdmin ? '#8b5cf6' : '#3b82f6');
      return `
        <div class="staff-card" data-username="${m.username}" data-name="${m.name}" data-role="${m.role}" data-specialty="${m.specialty || ''}" data-color="${color}">
          <div class="staff-card-avatar" style="background:${color};">
            ${m.name.charAt(0).toUpperCase()}
          </div>
          <div class="staff-card-content">
            <div class="staff-card-name">${m.name}</div>
            <div class="staff-card-specialty">${m.specialty || (isAdmin ? 'Admin' : 'Worker')}</div>
            <span class="staff-badge ${isAdmin ? 'admin' : 'worker'}">
              ${isAdmin ? '👑 Admin' : '🔧 Staff'}
            </span>
          </div>
        </div>
      `;
    }).join('');

    // Profile Click handler
    grid.querySelectorAll('.staff-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedProfile = {
          username: card.dataset.username,
          name: card.dataset.name,
          role: card.dataset.role,
          specialty: card.dataset.specialty,
          color: card.dataset.color
        };
        openPinEntry();
      });
    });

  } catch (err) {
    console.error('Error loading team profiles:', err);
    grid.innerHTML = `<div style="color:var(--text-danger); text-align:center;">Failed to load profiles: ${err.message}</div>`;
  }

  setupPinPad();
}

function openPinEntry() {
  if (!selectedProfile) return;

  const pinCard = document.getElementById('pin-entry-card');
  const avatar = document.getElementById('pin-avatar');
  const nameEl = document.getElementById('pin-user-name');
  const roleEl = document.getElementById('pin-user-role');
  const pinInput = document.getElementById('pin-input');

  if (avatar) {
    avatar.textContent = selectedProfile.name.charAt(0).toUpperCase();
    avatar.style.background = selectedProfile.color;
  }
  if (nameEl) nameEl.textContent = selectedProfile.name;
  if (roleEl) roleEl.textContent = `${selectedProfile.role === 'admin' ? '👑 Admin' : '🔧 Worker'} • ${selectedProfile.specialty}`;

  if (pinInput) {
    pinInput.value = '';
    setTimeout(() => pinInput.focus(), 150);
  }

  if (pinCard) {
    pinCard.classList.remove('hidden');
    pinCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function setupPinPad() {
  const pinInput = document.getElementById('pin-input');
  const pinCard = document.getElementById('pin-entry-card');

  // Keypad clicks
  document.querySelectorAll('.pin-keypad .pin-key[data-num]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (pinInput && pinInput.value.length < 6) {
        pinInput.value += btn.dataset.num;
        if (pinInput.value.length === 4) {
          submitLogin();
        }
      }
    });
  });

  // Clear & Backspace
  document.getElementById('btn-pin-clear')?.addEventListener('click', () => {
    if (pinInput) pinInput.value = '';
  });

  document.getElementById('btn-pin-backspace')?.addEventListener('click', () => {
    if (pinInput) pinInput.value = pinInput.value.slice(0, -1);
  });

  document.getElementById('btn-cancel-pin')?.addEventListener('click', () => {
    if (pinCard) pinCard.classList.add('hidden');
    selectedProfile = null;
  });

  // Form submit
  document.getElementById('pin-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitLogin();
  });
}

async function submitLogin() {
  const pinInput = document.getElementById('pin-input');
  if (!selectedProfile || !pinInput) return;

  const pin = pinInput.value.trim();
  if (!pin) {
    showToast('Please enter your 4-digit PIN', 'warning');
    return;
  }

  try {
    const user = await authenticate(selectedProfile.username, pin);
    showToast(`Welcome back, ${user.name}!`, 'success');
  } catch (err) {
    showToast(err.message || 'Incorrect PIN', 'error');
    pinInput.value = '';
    pinInput.focus();
  }
}
