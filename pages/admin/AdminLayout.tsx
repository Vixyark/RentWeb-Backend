import React from 'react';
import { NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTES } from '../../constants';
import { LogOutIcon, PackageIcon, ListOrderedIcon } from '../../components/icons';

const AdminLayout: React.FC = () => {
  const { isAdminLoggedIn, logout } = useAuth();
  const navigate = useNavigate();

  if (!isAdminLoggedIn) {
    return <Navigate to={ROUTES.ADMIN_LOGIN} replace />;
  }

  const handleLogout = () => {
    logout();
    navigate(ROUTES.HOME);
  };

  const navLinkClasses = ({ isActive }: { isActive: boolean }): string =>
    `flex items-center px-4 py-3 rounded-lg transition-colors duration-150 ease-in-out group
     ${isActive 
        ? 'bg-kaist-orange text-white shadow-md' 
        : 'text-gray-600 hover:bg-kaist-lightOrange hover:text-kaist-orange'
     }`;

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-lg p-6 space-y-6 flex flex-col">
        <div className="text-center mb-6">
           <img src="https://www.kaist.ac.kr/images/sub/symbol_01.png" alt="KAIST Logo" className="w-16 h-auto mx-auto mb-2"/>
          <h1 className="text-xl font-semibold text-kaist-orange">관리자 시스템</h1>
          <p className="text-sm text-kaist-gray">학생복지위원회</p>
        </div>
        <nav className="flex-grow">
          <ul className="space-y-2">
            <li>
              <NavLink to={ROUTES.ADMIN_DASHBOARD} className={navLinkClasses}>
                <ListOrderedIcon className="w-5 h-5 mr-3" />
                대여 현황
              </NavLink>
            </li>
            <li>
              <NavLink to={ROUTES.ADMIN_ITEMS} className={navLinkClasses}>
                <PackageIcon className="w-5 h-5 mr-3" />
                물품 관리
              </NavLink>
            </li>
          </ul>
        </nav>
        <div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center px-4 py-3 rounded-lg text-gray-600 hover:bg-red-100 hover:text-red-700 transition-colors duration-150 ease-in-out group"
          >
            <LogOutIcon className="w-5 h-5 mr-3" />
            로그아웃
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;