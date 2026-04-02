const TOKEN_KEY = 'p2p_session_token';

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

export function getSessionToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setSessionToken(token) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }

  localStorage.setItem(TOKEN_KEY, token);
}

export function clearSessionToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export const api = {
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
  resetDepartmentPassword(token, userId) {
    return request(`/api/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST',
      token,
    });
  },
  exportRequests(token) {
    return request('/api/requests/export', { token });
  },
};
