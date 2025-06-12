import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Item, SelectedItemEntry, ApplicantInfo, CartItem, RentalStatus } from '../../types';
import { getItems, addRentalApplication } from '../../services/dataService';
import { FIXED_DEPOSIT_AMOUNT, ROUTES } from '../../constants';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import Modal from '../../components/common/Modal';
import { PlusIcon, TrashIcon, CalendarIcon } from '../../components/icons'; // ChevronLeftIcon

const UserRentalApplicationPage: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [applicantInfo, setApplicantInfo] = useState<ApplicantInfo>({
    applicantName: '', phoneNumber: '', studentId: '', accountHolderName: '', accountNumber: ''
  });
  const [rentalDate, setRentalDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [returnDate, setReturnDate] = useState<string>('');
  
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalContent, setModalContent] = useState<{ title: string; message: React.ReactNode }>({ title: '', message: '' });
  
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const navigate = useNavigate();

  useEffect(() => {
    // Fetch items and update state. If stock changes due to other users, this will reflect it.
    const fetchAndSetItems = () => setItems(getItems());
    fetchAndSetItems();

    // Optional: Add an event listener for storage changes to refresh items if another tab modifies them.
    // window.addEventListener('storage', fetchAndSetItems);
    // return () => window.removeEventListener('storage', fetchAndSetItems);
  }, []);

  const handleApplicantInfoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApplicantInfo({ ...applicantInfo, [e.target.name]: e.target.value });
    if (formErrors[e.target.name]) {
        setFormErrors(prev => ({...prev, [e.target.name]: ''}));
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'rental' | 'return') => {
    const value = e.target.value;
    if (type === 'rental') {
      setRentalDate(value);
      if (returnDate && value > returnDate) setReturnDate(''); 
    } else {
      setReturnDate(value);
    }
     if (formErrors[type === 'rental' ? 'rentalDate' : 'returnDate']) {
        setFormErrors(prev => ({...prev, [type === 'rental' ? 'rentalDate' : 'returnDate']: ''}));
    }
  };

  const handleAddItemToCart = () => {
    if (!selectedItemId) {
      setModalContent({ title: '오류', message: '물품을 선택해주세요.' });
      setIsModalOpen(true);
      return;
    }
    // Fetch latest item data before adding to cart to ensure stock is current
    const currentItems = getItems();
    const item = currentItems.find(i => i.id === selectedItemId);
    
    if (!item) {
        setModalContent({ title: '오류', message: '선택한 물품 정보를 찾을 수 없습니다. 목록을 새로고침합니다.' });
        setItems(currentItems); // Refresh local items state
        setIsModalOpen(true);
        return;
    }


    if (selectedQuantity <= 0) {
      setModalContent({ title: '오류', message: '수량은 1개 이상이어야 합니다.' });
      setIsModalOpen(true);
      return;
    }
    if (selectedQuantity > item.currentStock) {
      setModalContent({ title: '재고 부족', message: `${item.name}의 현재 재고(${item.currentStock}${item.unit})를 초과할 수 없습니다.` });
      setIsModalOpen(true);
      setItems(currentItems); // Refresh local items state to show latest stock
      return;
    }

    const existingCartItemIndex = cart.findIndex(ci => ci.id === selectedItemId);
    if (existingCartItemIndex > -1) {
      const updatedCart = [...cart];
      const newTotalQuantity = updatedCart[existingCartItemIndex].selectedQuantity + selectedQuantity;
      if (newTotalQuantity > item.currentStock) {
        setModalContent({ title: '재고 부족', message: `총 선택 수량(${newTotalQuantity})이 ${item.name}의 현재 재고(${item.currentStock}${item.unit})를 초과합니다.` });
        setIsModalOpen(true);
        setItems(currentItems); // Refresh local items state
        return;
      }
      updatedCart[existingCartItemIndex].selectedQuantity = newTotalQuantity;
      setCart(updatedCart);
    } else {
      // For cart item, use the fetched item details which include currentStock
      setCart([...cart, { ...item, selectedQuantity }]);
    }
    setSelectedItemId('');
    setSelectedQuantity(1);
  };

  const handleRemoveFromCart = (itemIdToRemove: string) => {
    setCart(cart.filter(item => item.id !== itemIdToRemove));
  };

  const totalItemCost = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.selectedQuantity, 0);
  }, [cart]);
  const totalAmount = totalItemCost + FIXED_DEPOSIT_AMOUNT;

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!applicantInfo.applicantName.trim()) errors.applicantName = "이름을 입력해주세요.";
    if (!applicantInfo.phoneNumber.trim()) errors.phoneNumber = "전화번호를 입력해주세요.";
    else if (!/^\d{10,11}$/.test(applicantInfo.phoneNumber.replace(/-/g, ''))) errors.phoneNumber = "유효한 전화번호를 입력해주세요. (예: 01012345678)";
    if (!applicantInfo.studentId.trim()) errors.studentId = "학번을 입력해주세요.";
    if (!applicantInfo.accountHolderName.trim()) errors.accountHolderName = "예금주명을 입력해주세요.";
    if (!applicantInfo.accountNumber.trim()) errors.accountNumber = "계좌번호를 입력해주세요.";
    if (!rentalDate) errors.rentalDate = "대여일을 선택해주세요.";
    if (!returnDate) errors.returnDate = "반납 예정일을 선택해주세요.";
    else if (rentalDate && returnDate && rentalDate > returnDate) errors.returnDate = "반납 예정일은 대여일 이후여야 합니다.";
    
    // Validate cart items against current stock one last time before submission
    const currentItemsData = getItems();
    let cartStockError = false;
    for (const cartItem of cart) {
        const currentItemDetails = currentItemsData.find(i => i.id === cartItem.id);
        if (!currentItemDetails || cartItem.selectedQuantity > currentItemDetails.currentStock) {
            errors.cart = `${cartItem.name}의 재고(${currentItemDetails?.currentStock || 0}${cartItem.unit})가 부족합니다. 선택 수량을 조절해주세요.`;
            cartStockError = true;
            break; 
        }
    }
    if (cartStockError) {
        setItems(currentItemsData); // Refresh items in UI to show latest stock
    }


    if (cart.length === 0 && !errors.cart) errors.cart = "대여할 물품을 최소 1개 이상 선택해주세요.";

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const handleSubmitApplication = () => {
    if (!validateForm()) {
        const errorMessages = Object.values(formErrors).filter(Boolean).join('\n');
        setModalContent({ title: '입력 오류', message: errorMessages || '필수 정보를 모두 정확히 입력해주세요. 오류가 있는 항목을 확인하세요.'});
        setIsModalOpen(true);
        return;
    }

    const rentalItems: SelectedItemEntry[] = cart.map(item => ({ itemId: item.id, quantity: item.selectedQuantity }));
    
    try {
        const newApplication = addRentalApplication({
        ...applicantInfo,
        rentalDate,
        returnDate,
        items: rentalItems,
        });

        setModalContent({ 
        title: '신청 완료', 
        message: (
            <div>
            <p>대여 신청이 성공적으로 완료되었습니다.</p>
            <p className="mt-2 text-sm text-gray-600">
                신청 ID: {newApplication.id}<br />
                신청자명: {newApplication.applicantName}<br />
                반납 예정일: {newApplication.returnDate}<br />
                총 합계 금액: {newApplication.totalAmount.toLocaleString()}원 (보증금 {FIXED_DEPOSIT_AMOUNT.toLocaleString()}원 포함)
            </p>
            <p className="mt-3 text-xs text-kaist-gray">홈으로 돌아가 '대여 신청 내역 확인' 메뉴에서 상세 내용을 확인하거나 수정할 수 있습니다 (대여 전 상태인 경우).</p>
            </div>
        ) 
        });
        // Reset form and cart, also refresh items list from source to reflect stock changes
        handleFullReset(); // This will clear form fields and cart
        setItems(getItems()); // Fetch updated items list after submission
    } catch (error) {
        console.error("Error submitting application:", error);
        let errorMessage = '신청 중 오류가 발생했습니다. 다시 시도해주세요.';
        if (error instanceof Error) {
            errorMessage = error.message; // Show specific error message from dataService if thrown
        }
        setModalContent({ title: '신청 실패', message: errorMessage });
        setItems(getItems()); // Refresh items in case of stock related errors
    } finally {
        setIsModalOpen(true);
    }
  };

  const resetItemSelection = () => {
    setRentalDate(new Date().toISOString().split('T')[0]);
    setReturnDate('');
    setSelectedItemId('');
    setSelectedQuantity(1);
    setCart([]);
    setFormErrors({});
  }

  const handleFullReset = () => {
    setApplicantInfo({ applicantName: '', phoneNumber: '', studentId: '', accountHolderName: '', accountNumber: '' });
    resetItemSelection();
    setItems(getItems()); // Refresh items list on full reset
  };

  const handleGoHome = () => {
    navigate(ROUTES.HOME);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Button
            onClick={handleGoHome}
            variant="outline"
            size="sm"
            className="mb-6"
            aria-label="홈으로 이동"
        >
            홈으로 이동
        </Button>

        <header className="text-center mb-10">
            <h1 className="text-4xl font-bold text-kaist-orange">물품 대여 신청</h1>
            <p className="mt-2 text-lg text-kaist-gray">원하는 물품을 간편하게 신청하세요.</p>
        </header>

        <div className="space-y-8">
            <Card title="신청자 정보">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input label="이름" name="applicantName" value={applicantInfo.applicantName} onChange={handleApplicantInfoChange} error={formErrors.applicantName} placeholder="홍길동"/>
                <Input label="전화번호" name="phoneNumber" type="tel" value={applicantInfo.phoneNumber} onChange={handleApplicantInfoChange} error={formErrors.phoneNumber} placeholder="010-1234-5678"/>
                <Input label="학번" name="studentId" value={applicantInfo.studentId} onChange={handleApplicantInfoChange} error={formErrors.studentId} placeholder="20230001"/>
                <Input label="예금주명 (보증금 환급용)" name="accountHolderName" value={applicantInfo.accountHolderName} onChange={handleApplicantInfoChange} error={formErrors.accountHolderName} placeholder="홍길동"/>
                <Input label="계좌번호 (보증금 환급용)" name="accountNumber" value={applicantInfo.accountNumber} onChange={handleApplicantInfoChange} error={formErrors.accountNumber} placeholder="은행명 123-456-789012"/>
            </div>
            </Card>

            <Card title="대여 정보">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="rentalDate" className="block text-sm font-medium text-gray-700 mb-1">대여일</label>
                        <Input type="date" id="rentalDate" name="rentalDate" value={rentalDate} onChange={(e) => handleDateChange(e, 'rental')} min={new Date().toISOString().split('T')[0]} error={formErrors.rentalDate} leadingIcon={<CalendarIcon className="w-4 h-4"/>}/>
                    </div>
                    <div>
                        <label htmlFor="returnDate" className="block text-sm font-medium text-gray-700 mb-1">반납 예정일</label>
                        <Input type="date" id="returnDate" name="returnDate" value={returnDate} onChange={(e) => handleDateChange(e, 'return')} min={rentalDate || new Date().toISOString().split('T')[0]} error={formErrors.returnDate} leadingIcon={<CalendarIcon className="w-4 h-4"/>}/>
                    </div>
                </div>
            </Card>

            <Card title="물품 선택">
            <div className="flex flex-col sm:flex-row gap-4 items-end mb-6">
                <div className="flex-grow">
                <label htmlFor="item" className="block text-sm font-medium text-gray-700 mb-1">물품</label>
                <select id="item" value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-kaist-orange focus:border-kaist-orange sm:text-sm">
                    <option value="">물품 선택...</option>
                    {items.map(item => (
                    <option key={item.id} value={item.id} disabled={item.currentStock === 0}>
                        {item.name} (재고: {item.currentStock}{item.unit}) {item.currentStock === 0 ? "- 품절" : ""}
                    </option>
                    ))}
                </select>
                </div>
                <div className="w-full sm:w-auto">
                <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">수량</label>
                <Input type="number" id="quantity" value={selectedQuantity} onChange={(e) => setSelectedQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))} min="1" className="w-full sm:w-24"/>
                </div>
                <Button onClick={handleAddItemToCart} leftIcon={<PlusIcon />} className="w-full sm:w-auto">추가</Button>
            </div>

            {cart.length > 0 && (
                <div>
                <h4 className="text-md font-semibold text-gray-700 mb-3">선택된 물품 목록</h4>
                <div className="space-y-3">
                    {cart.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200">
                        <div className="flex items-center space-x-3">
                        <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded-md object-cover"/>
                        <div>
                            <p className="font-medium text-gray-800">{item.name}</p>
                            <p className="text-sm text-gray-500">수량: {item.selectedQuantity}{item.unit}</p>
                        </div>
                        </div>
                        <Button onClick={() => handleRemoveFromCart(item.id)} variant="danger" size="sm" className="p-1">
                        <TrashIcon className="w-4 h-4"/>
                        </Button>
                    </div>
                    ))}
                </div>
                </div>
            )}
            {formErrors.cart && <p className="mt-2 text-xs text-red-600">{formErrors.cart}</p>}
            </Card>

            <Card title="예상 비용">
            <div className="space-y-2 text-gray-700">
                <div className="flex justify-between"><p>총 대여 물품 개수:</p> <p>{cart.reduce((sum, item) => sum + item.selectedQuantity, 0)} 개</p></div>
                <div className="flex justify-between"><p>총 대여금액:</p> <p>{totalItemCost.toLocaleString()} 원</p></div>
                <div className="flex justify-between"><p>보증금 (고정):</p> <p>{FIXED_DEPOSIT_AMOUNT.toLocaleString()} 원</p></div>
                <hr className="my-2"/>
                <div className="flex justify-between font-semibold text-lg"><p>총 합계 금액:</p> <p>{totalAmount.toLocaleString()} 원</p></div>
            </div>
            </Card>

            <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
            <Button onClick={handleFullReset} variant="outline">전체 초기화</Button>
            <Button onClick={handleSubmitApplication} variant="primary">신청하기</Button>
            </div>
        </div>
      </div>


      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={modalContent.title}>
        {typeof modalContent.message === 'string' ? <p>{modalContent.message}</p> : modalContent.message}
         <div className="mt-4 text-right">
            <Button onClick={() => {
                setIsModalOpen(false);
                if (modalContent.title === '신청 완료') {
                    handleGoHome(); 
                }
            }} variant="primary">확인</Button>
        </div>
      </Modal>
    </div>
  );
};

export default UserRentalApplicationPage;