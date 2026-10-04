export interface WooCartResponse {
  success: true
  cartUrl: string
  cartItemKey: string
}

interface WordPressError {
  code?: string
  message?: string
}

function getErrorMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') {
    return body.message
  }
  const error = typeof body === 'object' && body !== null && 'error' in body
    ? body.error as WordPressError
    : null
  return error?.message ?? `WooCommerce request failed (${status}).`
}

function validateCartResponse(value: unknown): WooCartResponse {
  if (
    typeof value !== 'object'
    || value === null
    || !('success' in value)
    || value.success !== true
    || !('cartUrl' in value)
    || typeof value.cartUrl !== 'string'
    || !('cartItemKey' in value)
    || typeof value.cartItemKey !== 'string'
  ) {
    throw new Error('WooCommerce returned an invalid cart response.')
  }
  const cartUrl = new URL(value.cartUrl)
  if (cartUrl.protocol !== 'http:' && cartUrl.protocol !== 'https:') {
    throw new Error('WooCommerce returned an invalid cart URL.')
  }
  return { success: true, cartUrl: cartUrl.toString(), cartItemKey: value.cartItemKey }
}

export async function addProjectToWooCommerce(
  wordpressBaseUrl: string,
  projectId: string,
): Promise<WooCartResponse> {
  const baseUrl = wordpressBaseUrl.replace(/\/+$/u, '')
  if (!baseUrl) throw new Error('Set the WordPress shop URL in NUXT_PUBLIC_WORDPRESS_URL.')
  const nonceResponse = await fetch(`${baseUrl}/wp-json/varyform/v1/nonce/`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  })
  const nonceBody: unknown = await nonceResponse.json()
  if (!nonceResponse.ok) throw new Error(getErrorMessage(nonceBody, nonceResponse.status))
  if (
    typeof nonceBody !== 'object'
    || nonceBody === null
    || !('nonce' in nonceBody)
    || typeof nonceBody.nonce !== 'string'
  ) {
    throw new Error('WordPress did not return a valid request nonce.')
  }

  const response = await fetch(`${baseUrl}/wp-json/varyform/v1/cart/`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Varyform-Request': '1',
      'X-Varyform-Nonce': nonceBody.nonce,
    },
    credentials: 'include',
    body: JSON.stringify({ projectId }),
  })
  const body: unknown = await response.json()
  if (!response.ok) throw new Error(getErrorMessage(body, response.status))
  return validateCartResponse(body)
}
