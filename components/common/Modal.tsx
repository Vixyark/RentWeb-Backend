import React, { useState, useEffect } from 'react';
import { XIcon } from '../icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const [applyAnimation, setApplyAnimation] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Use a timeout to ensure the element is in the DOM with initial styles (opacity-0, scale-95)
      // before transitioning to final styles (opacity-100, scale-100).
      // This allows the transition to be visible.
      const timer = setTimeout(() => {
        setApplyAnimation(true);
      }, 10); // A small delay, e.g., one frame tick
      return () => clearTimeout(timer);
    } else {
      setApplyAnimation(false); // Reset animation state when modal is closed
    }
  }, [isOpen]);

  if (!isOpen) {
    return null; // If not open, render nothing. This means no exit animation by default.
  }

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div 
      className={`fixed inset-0 bg-black flex items-center justify-center p-4 z-50 
                  transition-opacity duration-300 ease-in-out
                  ${applyAnimation ? 'bg-opacity-50 backdrop-blur-sm' : 'bg-opacity-0'}`}
    >
      <div 
        className={`bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} 
                  transform transition-all duration-300 ease-in-out
                  ${applyAnimation ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="p-4 md:p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
