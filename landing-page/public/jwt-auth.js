// JWT Frontend Utilities
// This file provides helper functions for JWT-based authentication in the frontend

class JWTAuth {
    constructor() {
        this.baseAuthURL = '/auth'; // Auth service endpoints are proxied
        this.baseAPIURL = '/api'; // Local API endpoints
    }

    // Check if user is authenticated by calling the check-auth endpoint
    async checkAuth() {
        try {
            const response = await fetch(`${this.baseAuthURL}/check-auth`, {
                credentials: 'include'
            });
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Auth check failed:', error);
            return { authenticated: false };
        }
    }

    // Logout function
    async logout() {
        try {
            // Try local logout first (clears cookies)
            await fetch(`${this.baseAPIURL}/logout`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.error('Local logout failed:', error);
        }
        
        try {
            // Also call auth service logout
            await fetch(`${this.baseAuthURL}/logout`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.error('Auth service logout failed:', error);
        }
        
        // Always redirect to home
        window.location.href = '/';
    }

    // Refresh token if needed
    async refreshToken() {
        try {
            const response = await fetch(`${this.baseAuthURL}/refresh`, {
                method: 'POST',
                credentials: 'include'
            });
            return response.ok;
        } catch (error) {
            console.error('Token refresh failed:', error);
            return false;
        }
    }

    // Make authenticated API call with automatic token refresh
    async apiCall(url, options = {}) {
        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            let response = await fetch(url, defaultOptions);
            
            // If unauthorized, try to refresh token
            if (response.status === 401) {
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    // Retry the original request
                    response = await fetch(url, defaultOptions);
                }
            }
            
            return response;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    // Initialize user interface based on auth status
    async initializeUI() {
        const authData = await this.checkAuth();
        
        if (authData.authenticated && authData.user) {
            this.updateUserUI(authData.user);
            return authData.user;
        } else {
            this.handleUnauthenticated();
            return null;
        }
    }

    // Update UI elements with user information
    updateUserUI(user) {
        // Update user name if element exists
        const userNameEl = document.getElementById('userName');
        if (userNameEl) {
            userNameEl.textContent = user.name;
        }

        // Update user avatar if element exists
        const userAvatarEl = document.getElementById('userAvatar');
        if (userAvatarEl && user.profilePicture) {
            userAvatarEl.src = user.profilePicture;
        }

        // Show admin link if user is admin
        const adminLinkEl = document.getElementById('adminLink');
        if (adminLinkEl && user.isAdmin) {
            adminLinkEl.style.display = 'block';
        }

        // Update any other user-specific UI elements
        const userEmailEl = document.getElementById('userEmail');
        if (userEmailEl) {
            userEmailEl.textContent = user.email;
        }
    }

    // Handle unauthenticated state
    handleUnauthenticated() {
        // Redirect to login if on a protected page
        const protectedPages = ['/dashboard.html', '/admin.html'];
        if (protectedPages.includes(window.location.pathname)) {
            window.location.href = '/';
        }
    }
}

// Create global instance
window.jwtAuth = new JWTAuth();

// Global logout function for backward compatibility
window.logout = () => window.jwtAuth.logout();
