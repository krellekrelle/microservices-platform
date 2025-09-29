/**
 * JWT utilities for client-side token handling
 */

/**
 * Decode a JWT token without verification (client-side only)
 * @param {string} token - The JWT token to decode
 * @returns {object|null} - The decoded payload or null if invalid
 */
export function decodeJWT(token) {
  try {
    // JWT tokens have 3 parts separated by dots: header.payload.signature
    const parts = token.split('.')
    if (parts.length !== 3) {
      console.warn('Invalid JWT format')
      return null
    }

    // Decode the payload (middle part)
    const payload = parts[1]
    
    // Add padding if needed (base64url doesn't use padding, but atob expects it)
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4)
    
    // Decode base64url to base64, then decode
    const base64 = paddedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const decodedPayload = atob(base64)
    
    return JSON.parse(decodedPayload)
  } catch (error) {
    console.warn('Failed to decode JWT:', error)
    return null
  }
}

/**
 * Get a cookie value by name
 * @param {string} name - The cookie name
 * @returns {string|null} - The cookie value or null if not found
 */
export function getCookie(name) {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) {
    return parts.pop().split(';').shift()
  }
  return null
}

/**
 * Get the current user from JWT cookie
 * @returns {object|null} - The user object or null if not found/invalid
 */
export function getCurrentUserFromJWT() {
  // In development mode, return mock user
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return {
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      status: 'approved',
      isAdmin: true,
      profilePicture: 'https://via.placeholder.com/96'
    }
  }

  try {
    // Look for JWT cookie (could be named 'token', 'jwt', 'auth', etc.)
    const jwtToken = getCookie('token') || getCookie('jwt') || getCookie('auth')
    
    if (!jwtToken) {
      console.warn('No JWT token found in cookies')
      return null
    }

    const decoded = decodeJWT(jwtToken)
    
    if (!decoded) {
      console.warn('Failed to decode JWT token')
      return null
    }

    // Check if token is expired
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      console.warn('JWT token is expired')
      return null
    }

    // Return user info from JWT payload
    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      status: decoded.status,
      isAdmin: decoded.isAdmin,
      profilePicture: decoded.profilePicture
    }
  } catch (error) {
    console.error('Error getting user from JWT:', error)
    return null
  }
}