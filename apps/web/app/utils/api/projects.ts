import type {
  CreatedProjectResponse,
  CreateProjectRequest,
  ProjectResponse,
  UpdateProjectRequest,
} from '@varyform/shared'

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/+$/u, '')}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const body: unknown = await response.json()
  if (!response.ok) {
    const message = typeof body === 'object'
      && body !== null
      && 'error' in body
      && typeof body.error === 'object'
      && body.error !== null
      && 'message' in body.error
      && typeof body.error.message === 'string'
      ? body.error.message
      : `Project request failed (${response.status}).`
    throw new Error(message)
  }
  return body as T
}

export function createProject(
  baseUrl: string,
  payload: CreateProjectRequest,
): Promise<CreatedProjectResponse> {
  return request(baseUrl, '/projects', { method: 'POST', body: JSON.stringify(payload) })
}

export function getProject(baseUrl: string, id: string): Promise<ProjectResponse> {
  return request(baseUrl, `/projects/${encodeURIComponent(id)}`)
}

export function updateProject(
  baseUrl: string,
  id: string,
  payload: UpdateProjectRequest,
): Promise<ProjectResponse> {
  return request(baseUrl, `/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function editTokenStorageKey(id: string): string {
  return `varyform:edit-token:${id}`
}
