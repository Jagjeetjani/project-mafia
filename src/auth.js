/**
 * Project Mafia — Authentication & Role-Based Access Control (RBAC)
 * Supports Admin (full financial & business access) and Workers (strictly zero financials, focused on execution)
 */
import { getAll, add, count, bulkAdd } from './db.js';

export const seedTeamMembers = [
  {
    id: 1,
    username: 'admin',
    name: 'Admin / Owner',
    role: 'admin',
    specialty: 'Management & Business Operations',
    pin: '1234',
    active: true,
    avatarColor: '#8b5cf6',
    createdAt: new Date().toISOString()
  },
  {
    id: 2,
    username: 'rahul',
    name: 'Rahul Sharma',
    role: 'worker',
    specialty: 'Hardware & IoT Assembly',
    pin: '1234',
    active: true,
    avatarColor: '#3b82f6',
    createdAt: new Date().toISOString()
  },
  {
    id: 3,
    username: 'priya',
    name: 'Priya Patel',
    role: 'worker',
    specialty: 'Reports & Academic Assignments',
    pin: '1234',
    active: true,
    avatarColor: '#ec4899',
    createdAt: new Date().toISOString()
  },
  {
    id: 4,
    username: 'aman',
    name: 'Aman Verma',
    role: 'worker',
    specialty: 'Coding & Embedded Firmware',
    pin: '1234',
    active: true,
    avatarColor: '#10b981',
    createdAt: new Date().toISOString()
  }
];

const AUTH_STORAGE_KEY = 'pm_auth_user';

/**
 * Get currently logged-in user from storage
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to parse auth user:', e);
    return null;
  }
}

/**
 * Set current user in storage and notify listeners
 */
export function setCurrentUser(user) {
  if (user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
}

/**
 * Logout current user
 */
export function logout() {
  setCurrentUser(null);
  window.location.hash = '';
}

/**
 * Check if active user is Admin
 */
export function isAdmin() {
  const user = getCurrentUser();
  return user && user.role === 'admin';
}

/**
 * Check if active user is Worker
 */
export function isWorker() {
  const user = getCurrentUser();
  return user && user.role === 'worker';
}

/**
 * Check and seed default team members into database if empty
 */
export async function checkAndSeedTeam() {
  try {
    const currentCount = await count('teamMembers');
    if (currentCount === 0) {
      console.log('Seeding default team accounts...');
      await bulkAdd('teamMembers', JSON.parse(JSON.stringify(seedTeamMembers)));
    }
  } catch (err) {
    console.warn('Could not seed team members:', err);
  }
}

/**
 * Authenticate with username and PIN
 */
export async function authenticate(username, pin) {
  const members = await getAll('teamMembers');
  const cleanUser = (username || '').trim().toLowerCase();
  const cleanPin = (pin || '').trim();

  const user = members.find(m => 
    m.username.toLowerCase() === cleanUser && 
    String(m.pin).trim() === cleanPin &&
    m.active !== false
  );

  if (!user) {
    throw new Error('Invalid username or PIN');
  }

  // Do not expose raw PIN in session storage
  const sessionUser = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    specialty: user.specialty,
    avatarColor: user.avatarColor || '#6366f1'
  };

  setCurrentUser(sessionUser);
  return sessionUser;
}

