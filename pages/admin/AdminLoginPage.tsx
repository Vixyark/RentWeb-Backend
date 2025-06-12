import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTES } from '../../constants';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';

const AdminLoginPage: React.FC = () => {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isAdminLoggedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAdminLoggedIn) {
      navigate(ROUTES.ADMIN_DASHBOARD);
    }
  }, [isAdminLoggedIn, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (login(id, password)) {
      navigate(ROUTES.ADMIN_DASHBOARD);
    } else {
      setError('아이디 또는 비밀번호가 일치하지 않습니다.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-kaist-orange">
            관리자 로그인
          </h2>
        </div>
        <Card>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <Input
              label="아이디"
              id="admin-id"
              name="admin-id"
              type="text"
              autoComplete="username"
              required
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="admin"
            />
            <Input
              label="비밀번호"
              id="admin-password"
              name="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password123"
            />
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            <Button type="submit" variant="primary" className="w-full">
              로그인
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default AdminLoginPage;