export const authConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5015'
};

// Debug log to verify the configuration (only in development)
if (import.meta.env.MODE === 'development') {
  console.log('Auth Configuration:');
  console.log('  API Base URL:', authConfig.apiBaseUrl);
}
