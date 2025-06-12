import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import { ADMIN_ID, ADMIN_PASSWORD } from '../constants';

interface AuthContextType {
  isAdminLoggedIn: boolean;
  login: (id: string, pass: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useLocalStorage<boolean>('kaistWelfareAdminLoggedIn', false);

  const login = (id: string, pass: string): boolean => {
    if (id === ADMIN_ID && pass === ADMIN_PASSWORD) {
      setIsAdminLoggedIn(true);
      return true;
    }
    setIsAdminLoggedIn(false);
    return false;
  };

  const logout = () => {
    setIsAdminLoggedIn(false);
  };

  return (
    <AuthContext.Provider value={{ isAdminLoggedIn, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
