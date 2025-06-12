import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  colorClass?: string; // e.g., 'bg-green-100 text-green-800'
}

const Badge: React.FC<BadgeProps> = ({ children, colorClass = 'bg-gray-100 text-gray-800' }) => {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
    >
      {children}
    </span>
  );
};

export default Badge;
