import { seedRequests, seedRunners, seedUsers } from './localData.js';

const TOKEN_KEY = 'ztrack_session_token';
const LOCAL_STATE_KEY = 'ztrack_local_state_v2';
const SESSION_TTL_DAYS = 7;

const isBrowser = typeof window !== 'undefined';
const forcedLocalMode = isBrowser && window.__ZTRACK_API_MODE__ === 'local';
const fileMode = isBrowser && ['file:', 'capacitor:', 'app:'].includes(window.location.protocol);
const USE_LOCAL_API = forcedLocalMode || fileMode;

let memoryState = null;

function nowIso() {
  return new Date().toISOString();
}

function isoInDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function randomHex(length = 8) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, length);
  }

  let output = '';
  while (output.length < length) {
    output += Math.floor(Math.random() * 16).toString(16);
  }
  return output.slice(0, length);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    department: user.department,
  };
}

function privateUser(user) {
  return {
    ...publicUser(user),
    passwordStatus: 'Stored securely',
  };
}

function getSeedState() {
  return {
    users: seedUsers.map(user => ({ ...user })),
    runners: [...seedRunners],
    requests: seedRequests.map(request => ({ ...request })),
    sessions: {},
  };
}

function normalizeState(rawState) {
  const fallback = getSeedState();
  if (!rawState || typeof rawState !== 'object') return fallback;

  return {
    users: Array.isArray(rawState.users) ? rawState.users.map(user => ({ ...user })) : fallback.users,
    runners: Array.isArray(rawState.runners) ? [...rawState.runners] : fallback.runners,
    requests: Array.isArray(rawState.requests) ? rawState.requests.map(request => ({ ...request })) : fallback.requests,
    sessions: rawState.sessions && typeof rawState.sessions === 'object' ? { ...rawState.sessions } : {},
  };
}

function readStoredState() {
  if (!isBrowser) {
    if (!memoryState) memoryState = getSeedState();
    return normalizeState(memoryState);
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_STATE_KEY);
    if (!raw) {
      const seed = getSeedState();
      window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(seed));
      return normalizeState(seed);
    }
    return normalizeState(JSON.parse(raw));
  } catch {
    const seed = getSeedState();
    window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(seed));
    return normalizeState(seed);
  }
}

function saveStoredState(state) {
  const normalized = normalizeState(state);
  if (!isBrowser) {
    memoryState = normalized;
    return normalized;
  }

  window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(normalized));
  return normalized;
}

function pruneExpiredSessions(state) {
  let changed = false;
  const sessions = { ...state.sessions };

  for (const [token, session] of Object.entries(sessions)) {
    if (!session || !session.expiresAt || new Date(session.expiresAt) < new Date()) {
      delete sessions[token];
      changed = true;
    }
  }

  if (changed) {
    state.sessions = sessions;
  }
  return state;
}

function getState() {
  const state = readStoredState();
  pruneExpiredSessions(state);
  return saveStoredState(state);
}

function setState(state) {
  return saveStoredState(state);
}

function listPublicUsersFromState(state) {
  return state.users
    .slice()
    .sort((a, b) => {
      if (a.role === 'Super Admin') return -1;
      if (b.role === 'Super Admin') return 1;
      if (a.role === 'Admin') return -1;
      if (b.role === 'Admin') return 1;
      return String(a.department || '').localeCompare(String(b.department || ''));
    })
    .map(publicUser);
}

function listPrivateUsersFromState(state) {
  return state.users
    .slice()
    .sort((a, b) => {
      if (a.role === 'Super Admin') return -1;
      if (b.role === 'Super Admin') return 1;
      if (a.role === 'Admin') return -1;
      if (b.role === 'Admin') return 1;
      return String(a.department || '').localeCompare(String(b.department || ''));
    })
    .map(privateUser);
}

function getUserById(state, userId) {
  return state.users.find(user => user.id === userId) || null;
}

function getUserFromToken(state, token) {
  if (!token) return null;

  const session = state.sessions[token];
  if (!session) return null;

  if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
    delete state.sessions[token];
    return null;
  }

  return getUserById(state, session.userId);
}

function requireAuthLocal(state, token) {
  const user = getUserFromToken(state, token);
  if (!user) {
    throw new Error('Authentication required.');
  }
  return user;
}

function requireAdminLocal(state, token) {
  const user = requireAuthLocal(state, token);
  if (user.role !== 'Admin' && user.role !== 'Super Admin') {
    throw new Error('Admin access required.');
  }
  return user;
}

function requireSuperAdminLocal(state, token) {
  const user = requireAuthLocal(state, token);
  if (user.role !== 'Super Admin') {
    throw new Error('Super Admin access required.');
  }
  return user;
}

function makeCsv(rows) {
  const headers = [
    'Ticket ID',
    'Date',
    'Employee',
    'Department',
    'Type',
    'Priority',
    'Status',
    'Assigned To',
    'Pickup Address',
    'Drop Address',
    'Contact Person',
    'Mobile Number',
    'Meeting Timing',
    'Lineup Timing',
    'Description',
    'Admin Comments',
    'Completion Date',
  ];

  const escapeCsv = value => {
    const textValue = value == null ? '' : String(value);
    if (/[",\n]/.test(textValue)) {
      return `"${textValue.replace(/"/g, '""')}"`;
    }
    return textValue;
  };

  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) {
    lines.push([
      row.id,
      row.date,
      row.employeeName,
      row.department,
      row.requestType,
      row.priority,
      row.status,
      row.assignedPerson,
      row.pickupAddress,
      row.dropAddress,
      row.contactPerson,
      row.mobileNumber,
      row.meetingTiming,
      row.lineupTiming,
      row.description,
      row.adminComments,
      row.completionDate,
    ].map(escapeCsv).join(','));
  }

  return `${lines.join('\n')}\n`;
}

function listRequestsForUser(state, user) {
  const rows = user.role === 'Super Admin' || user.role === 'Admin'
    ? state.requests
    : state.requests.filter(request => request.employeeId === user.id);

  return rows
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function createToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `tok_${Date.now()}_${randomHex(16)}`;
}

function createSession(state, userId) {
  const token = createToken();
  state.sessions[token] = {
    userId,
    createdAt: nowIso(),
    expiresAt: isoInDays(SESSION_TTL_DAYS),
  };
  return token;
}

function findUniqueTicketId(state) {
  let ticketId = '';
  const usedIds = new Set(state.requests.map(request => request.id));
  do {
    ticketId = `TKT-${Math.floor(1000 + Math.random() * 9000)}`;
  } while (usedIds.has(ticketId));
  return ticketId;
}

function validateMeetingTiming(value) {
  if (!value) {
    throw new Error('Meeting timing is required.');
  }

  const meetingTiming = new Date(value);
  if (Number.isNaN(meetingTiming.getTime())) {
    throw new Error('Meeting timing is required.');
  }

  if (meetingTiming < new Date()) {
    throw new Error('Meeting timing cannot be in the past.');
  }
}

function listRequestsFromState(state, user) {
  return listRequestsForUser(state, user);
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {};

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload.error || 'Request failed.';
    throw new Error(message);
  }

  return payload;
}

function localBootstrap(token) {
  const state = getState();
  const user = getUserFromToken(state, token);

  const payload = {
    currentUser: user ? publicUser(user) : null,
    publicUsers: listPublicUsersFromState(state),
    users: user?.role === 'Super Admin' ? listPrivateUsersFromState(state) : listPublicUsersFromState(state),
    runners: [...state.runners],
    requests: user ? listRequestsFromState(state, user) : [],
  };

  setState(state);
  return payload;
}

function localLogin(userId, password) {
  const state = getState();
  const user = getUserById(state, String(userId || ''));

  if (!user || String(user.password || '') !== String(password || '')) {
    throw new Error('Incorrect username or password.');
  }

  const token = createSession(state, user.id);
  setState(state);

  return {
    token,
    user: publicUser(user),
  };
}

function localLogout(token) {
  const state = getState();
  if (token) {
    delete state.sessions[token];
  }
  setState(state);
  return { ok: true };
}

function localCreateRequest(token, requestPayload) {
  const state = getState();
  const user = requireAuthLocal(state, token);
  if (user.role !== 'Employee') {
    throw new Error('Only employees can create requests.');
  }

  const request = {
    id: findUniqueTicketId(state),
    date: nowIso(),
    employeeName: user.name,
    employeeId: user.id,
    department: user.department,
    requestType: String(requestPayload?.requestType || '').trim(),
    priority: String(requestPayload?.priority || '').trim(),
    pickupAddress: String(requestPayload?.pickupAddress || '').trim(),
    dropAddress: String(requestPayload?.dropAddress || '').trim(),
    contactPerson: String(requestPayload?.contactPerson || '').trim(),
    mobileNumber: String(requestPayload?.mobileNumber || '').replace(/\D/g, '').slice(0, 10),
    meetingTiming: String(requestPayload?.meetingTiming || ''),
    description: String(requestPayload?.description || '').trim(),
    assignedPerson: '',
    lineupTiming: '',
    status: 'Pending',
    adminComments: '',
    completionDate: null,
  };

  const requiredFields = ['requestType', 'priority', 'pickupAddress', 'dropAddress', 'contactPerson', 'mobileNumber', 'meetingTiming', 'description'];
  if (requiredFields.some(field => !request[field])) {
    throw new Error('All request fields are required except the upload document.');
  }

  if (request.mobileNumber.length !== 10) {
    throw new Error('Mobile number must be exactly 10 digits.');
  }

  validateMeetingTiming(request.meetingTiming);

  state.requests.push(request);
  setState(state);
  return { request };
}

function localUpdateRequest(token, requestId, updatePayload) {
  const state = getState();
  requireAdminLocal(state, token);

  const existing = state.requests.find(request => request.id === requestId);
  if (!existing) {
    throw new Error('Request not found.');
  }

  const nextStatus = updatePayload?.status || existing.status;
  const nextCompletionDate = nextStatus === 'Completed'
    ? existing.completionDate || nowIso()
    : existing.completionDate;

  existing.status = nextStatus;
  existing.assignedPerson = String(updatePayload?.assignedPerson ?? existing.assignedPerson ?? '');
  existing.lineupTiming = String(updatePayload?.lineupTiming ?? existing.lineupTiming ?? '');
  existing.adminComments = String(updatePayload?.adminComments ?? existing.adminComments ?? '');
  existing.completionDate = nextCompletionDate;

  setState(state);
  return { request: { ...existing } };
}

function localAddRunner(token, name) {
  const state = getState();
  requireSuperAdminLocal(state, token);

  const runnerName = String(name || '').trim();
  if (!runnerName) {
    throw new Error('Runner name is required.');
  }

  if (state.runners.includes(runnerName)) {
    throw new Error('Runner already exists.');
  }

  state.runners.push(runnerName);
  setState(state);
  return { ok: true };
}

function localRemoveRunner(token, name) {
  const state = getState();
  requireSuperAdminLocal(state, token);
  state.runners = state.runners.filter(runner => runner !== name);
  setState(state);
  return { ok: true };
}

function localAddDepartment(token, departmentPayload) {
  const state = getState();
  requireSuperAdminLocal(state, token);

  const id = String(departmentPayload?.id || '').trim().toLowerCase().replace(/\s+/g, '');
  const name = String(departmentPayload?.name || '').trim();
  const department = String(departmentPayload?.department || '').trim();
  const password = String(departmentPayload?.password || `ZTRACK-${randomHex(8).toUpperCase()}`).trim();

  if (!id || !name || !department) {
    throw new Error('Login ID, name, and department are required.');
  }

  if (state.users.some(user => user.id === id)) {
    throw new Error('Login ID already exists.');
  }

  const user = {
    id,
    name,
    role: 'Employee',
    department,
    password,
  };

  state.users.push(user);
  setState(state);
  return {
    user: privateUser(user),
    temporaryPassword: password,
  };
}

function localRemoveDepartment(token, userId) {
  const state = getState();
  requireSuperAdminLocal(state, token);

  const id = String(userId || '');
  if (id === 'admin') {
    throw new Error('Admin account cannot be removed.');
  }

  state.users = state.users.filter(user => user.id !== id);
  for (const [sessionToken, session] of Object.entries(state.sessions)) {
    if (session.userId === id) {
      delete state.sessions[sessionToken];
    }
  }

  setState(state);
  return { ok: true };
}

function localResetDepartmentPassword(token, userId, requestedPassword) {
  const state = getState();
  requireSuperAdminLocal(state, token);

  const user = state.users.find(entry => entry.id === userId);
  if (!user) {
    throw new Error('User not found.');
  }

  const generatedPassword = `ZTRACK-${randomHex(8).toUpperCase()}`;
  const password = String(requestedPassword || '').trim() || generatedPassword;
  user.password = password;
  setState(state);
  return {
    password,
    generated: !String(requestedPassword || '').trim(),
  };
}

function localExportRequests(token) {
  const state = getState();
  const user = requireAuthLocal(state, token);
  const rows = listRequestsForUser(state, user);
  return makeCsv(rows);
}

export function getSessionToken() {
  if (!isBrowser) return '';
  return window.localStorage.getItem(TOKEN_KEY) || '';
}

export function setSessionToken(token) {
  if (!isBrowser) return;
  if (!token) {
    window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearSessionToken() {
  if (!isBrowser) return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export const api = USE_LOCAL_API
  ? {
      bootstrap(token) {
        return Promise.resolve(localBootstrap(token));
      },
      login(userId, password) {
        return Promise.resolve(localLogin(userId, password));
      },
      logout(token) {
        return Promise.resolve(localLogout(token));
      },
      createRequest(token, requestPayload) {
        return Promise.resolve(localCreateRequest(token, requestPayload));
      },
      updateRequest(token, requestId, updatePayload) {
        return Promise.resolve(localUpdateRequest(token, requestId, updatePayload));
      },
      addRunner(token, name) {
        return Promise.resolve(localAddRunner(token, name));
      },
      removeRunner(token, name) {
        return Promise.resolve(localRemoveRunner(token, name));
      },
      addDepartment(token, departmentPayload) {
        return Promise.resolve(localAddDepartment(token, departmentPayload));
      },
      removeDepartment(token, userId) {
        return Promise.resolve(localRemoveDepartment(token, userId));
      },
      resetDepartmentPassword(token, userId, password) {
        return Promise.resolve(localResetDepartmentPassword(token, userId, password));
      },
      exportRequests(token) {
        return Promise.resolve(localExportRequests(token));
      },
    }
  : {
      bootstrap(token) {
        return request('/api/bootstrap', { token });
      },
      login(userId, password) {
        return request('/api/auth/login', {
          method: 'POST',
          body: { userId, password },
        });
      },
      logout(token) {
        return request('/api/auth/logout', {
          method: 'POST',
          token,
        });
      },
      createRequest(token, requestPayload) {
        return request('/api/requests', {
          method: 'POST',
          token,
          body: requestPayload,
        });
      },
      updateRequest(token, requestId, updatePayload) {
        return request(`/api/requests/${encodeURIComponent(requestId)}`, {
          method: 'PATCH',
          token,
          body: updatePayload,
        });
      },
      addRunner(token, name) {
        return request('/api/runners', {
          method: 'POST',
          token,
          body: { name },
        });
      },
      removeRunner(token, name) {
        return request(`/api/runners/${encodeURIComponent(name)}`, {
          method: 'DELETE',
          token,
        });
      },
      addDepartment(token, departmentPayload) {
        return request('/api/users', {
          method: 'POST',
          token,
          body: departmentPayload,
        });
      },
      removeDepartment(token, userId) {
        return request(`/api/users/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          token,
        });
      },
      resetDepartmentPassword(token, userId, password) {
        return request(`/api/users/${encodeURIComponent(userId)}/reset-password`, {
          method: 'POST',
          token,
          body: { password },
        });
      },
      exportRequests(token) {
        return request('/api/requests/export', { token });
      },
    };
