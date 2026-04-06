export const isUserAdmin = (): boolean => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      const roles: string[] = user.roles || [];
      return roles.includes('Admin');
    }
  } catch {
    // ignore
  }
  return false;
};
