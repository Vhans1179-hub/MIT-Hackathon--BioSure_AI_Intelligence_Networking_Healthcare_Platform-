/**
 * API Configuration
 *
 * Centralized configuration for backend API endpoints.
 * Update the base URL based on your environment.
 */

// Base URL for the backend API
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

// Extract base URL without /api/v1 for health check
const BASE_SERVER_URL = API_BASE_URL.replace('/api/v1', '');

// Health check endpoint
export const HEALTH_CHECK_URL = `${BASE_SERVER_URL}/healthz`;

/**
 * API endpoints organized by feature
 */
export const API_ENDPOINTS = {
  // Health
  health: '/healthz',

  // Patients
  patients: {
    list: '/patients',
    stats: '/patients/stats',
  },

  // HCOs
  hcos: {
    list: '/hcos',
    stats: '/hcos/stats',
  },

  // Contracts
  contracts: {
    templates: '/contracts/templates',
    simulate: '/contracts/simulate',
  },
} as const;

/**
 * Helper function to construct full API URLs
 */
export function getApiUrl(endpoint: string): string {
  // Health check is at root level, not under /api/v1
  if (endpoint === '/healthz') {
    return `${BASE_SERVER_URL}${endpoint}`;
  }
  return `${API_BASE_URL}${endpoint}`;
}

/**
 * Default fetch options for API requests
 */
export const DEFAULT_FETCH_OPTIONS: RequestInit = {
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
};
