import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { EditIcon, ListOrderedIcon, LogOutIcon as LoginIcon, PackageIcon } from '../components/icons'; // Using PackageIcon for new application, EditIcon for check/modify, LoginIcon for admin

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-kaist-lightOrange to-orange-100 flex flex-col items-center justify-center p-6">
      <header className="text-center mb-12">
        <img 
          src="https://ugc.production.linktr.ee/dyxjrV8fS8ydBkWBNuv8_ee9UdUTq8Dph70Jd?io=true&size=avatar-v3_0" 
          alt="KAIST Logo" 
          className="w-24 h-auto mx-auto mb-4"
        />
        <h1 className="text-5xl font-extrabold text-kaist-orange mb-2">
          학생복지위원회 물품 대여
        </h1>
        <p className="text-xl text-kaist-gray">
          KAIST 학생들을 위한 간편 물품 대여 서비스입니다.
        </p>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl w-full">
      <HomeCard
          title="신청 내역 확인 및 수정"
          description="기존 대여 신청 내역을 조회하고, 필요한 경우 정보를 수정하거나 신청을 취소할 수 있습니다."
          icon={<EditIcon className="w-12 h-12 text-kaist-orange" />}
          buttonText="조회/수정하기"
          onClick={() => handleNavigate(ROUTES.USER_CHECK_STATUS)}
        />
        
        <HomeCard
          title="대여 신청"
          description="새로운 물품 대여를 신청합니다. 다양한 물품을 확인하고 간편하게 신청하세요."
          icon={<PackageIcon className="w-12 h-12 text-kaist-orange" />}
          buttonText="신청하기"
          onClick={() => handleNavigate(ROUTES.USER_RENTAL_APPLICATION)}
        />
        
        <HomeCard
          title="관리자 로그인"
          description="물품 및 대여 현황 관리를 위한 관리자 페이지로 이동합니다."
          icon={<LoginIcon className="w-12 h-12 text-kaist-orange" />}
          buttonText="로그인"
          onClick={() => handleNavigate(ROUTES.ADMIN_LOGIN)}
        />
      </main>

      <footer className="mt-16 text-center text-kaist-gray text-sm">
        <p>&copy; {new Date().getFullYear()} KAIST 학생복지위원회. All rights reserved.</p>
        <p className="mt-1">Designed for a better campus life.</p>
      </footer>
    </div>
  );
};

interface HomeCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  buttonText: string;
  onClick: () => void;
}

const HomeCard: React.FC<HomeCardProps> = ({ title, description, icon, buttonText, onClick }) => {
  return (
    <Card className="flex flex-col items-center text-center transform transition-all duration-300 hover:scale-105 hover:shadow-lg">
      <div className="p-6">
        <div className="mb-6 text-kaist-orange bg-kaist-lightOrange rounded-full p-4 inline-block">
          {icon}
        </div>
        <h3 className="text-2xl font-semibold text-kaist-orange mb-3">{title}</h3>
        <p className="text-kaist-gray mb-6 text-sm leading-relaxed min-h-[60px]">{description}</p>
      </div>
      <div className="w-full p-6 pt-0 mt-auto">
        <Button onClick={onClick} variant="primary" className="w-full">
          {buttonText}
        </Button>
      </div>
    </Card>
  );
};

export default HomePage;