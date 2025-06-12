import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Item, RentalApplication, SelectedItemEntry, RentalStatus, CartItem } from '../../types';
import { findRentalApplications, updateRentalApplication, cancelRentalApplication, getItems, getItem } from '../../services/dataService';
import { ROUTES, FIXED_DEPOSIT_AMOUNT, RENTAL_STATUS_COLORS } from '../../constants';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import Modal from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import { SearchIcon, TrashIcon, PlusIcon, CalendarIcon, EditIcon } from '../../components/icons';

const UserCheckStatusPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchCriteria, setSearchCriteria] = useState({ name: '', studentId: '', phoneNumber: '' });
  const [searchErrors, setSearchErrors] = useState<Record<string, string>>({});
  const [foundApplications, setFoundApplications] = useState<RentalApplication[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string>('신청자 정보를 입력하고 조회해주세요.');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<{ title: string; message: React.ReactNode; onConfirm?: () => void }>({ title: '', message: '' });

  const [editingApplication, setEditingApplication] = useState<RentalApplication | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editableCart, setEditableCart] = useState<CartItem[]>([]);
  const [editableRentalDate, setEditableRentalDate] = useState<string>('');
  const [editableReturnDate, setEditableReturnDate] = useState<string>('');
  const [allItems, setAllItems] = useState<Item[]>([]);
  
  const [itemSelectionForEdit, setItemSelectionForEdit] = useState<{itemId: string; quantity: number}>({itemId: '', quantity: 1});


  useEffect(() => {
    // Fetch items once on component mount for select options and details
    setAllItems(getItems());
  }, []);

  // Re-fetch applications if search criteria is cleared or user wants to refresh
  const refreshApplications = () => {
    if (searchCriteria.name && searchCriteria.studentId && searchCriteria.phoneNumber) {
        handleSearch();
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchCriteria({ ...searchCriteria, [e.target.name]: e.target.value });
    if (searchErrors[e.target.name]) {
      setSearchErrors(prev => ({ ...prev, [e.target.name]: '' }));
    }
  };

  const validateSearch = (): boolean => {
    const errors: Record<string, string> = {};
    if (!searchCriteria.name.trim()) errors.name = "이름을 입력해주세요.";
    if (!searchCriteria.studentId.trim()) errors.studentId = "학번을 입력해주세요.";
    if (!searchCriteria.phoneNumber.trim()) errors.phoneNumber = "전화번호를 입력해주세요.";
    else if (!/^\d{10,11}$/.test(searchCriteria.phoneNumber.replace(/-/g, ''))) errors.phoneNumber = "유효한 전화번호를 입력해주세요. (예: 01012345678)";
    setSearchErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSearch = () => {
    if (!validateSearch()) {
      setMessage('정확한 정보를 입력 후 다시 시도해주세요.');
      setFoundApplications([]);
      return;
    }
    setIsLoading(true);
    // Simulate API call or directly use service
    const apps = findRentalApplications(searchCriteria.name, searchCriteria.studentId, searchCriteria.phoneNumber);
    setFoundApplications(apps);
    if (apps.length === 0) {
      setMessage('해당 정보로 신청된 내역이 없습니다. 입력 정보를 다시 확인해주세요.');
    } else {
      setMessage(''); 
    }
    setIsLoading(false);
  };
  
  const openConfirmationModal = (title: string, message: React.ReactNode, onConfirm?: () => void) => {
    setModalContent({ title, message, onConfirm });
    setIsModalOpen(true);
  };

  const handleCancelApplication = (appId: string) => {
    openConfirmationModal(
      '신청 취소 확인',
      '정말로 이 대여 신청을 취소하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      () => {
        try {
            const success = cancelRentalApplication(appId);
            if (success) {
              // Refresh applications list and item list (for stock updates)
              refreshApplications(); 
              setAllItems(getItems()); 
              openConfirmationModal('취소 완료', '대여 신청이 성공적으로 취소되었습니다.');
            } else {
              openConfirmationModal('취소 실패', '신청을 취소하는 중 오류가 발생했거나, 이미 처리된 신청입니다.');
            }
        } catch (error) {
            console.error("Error cancelling application:", error);
            openConfirmationModal('취소 오류', error instanceof Error ? error.message : '알 수 없는 오류로 취소에 실패했습니다.');
        }
      }
    );
  };

  // --- Edit Modal Logic ---
  const openEditModal = (app: RentalApplication) => {
    // Refresh allItems from source to ensure stock data is current for editing
    const currentAllItems = getItems();
    setAllItems(currentAllItems);

    setEditingApplication(app);
    const cartItems: CartItem[] = app.items.map(entry => {
        const itemDetail = currentAllItems.find(i => i.id === entry.itemId); // Use refreshed items
        return { ...itemDetail!, selectedQuantity: entry.quantity };
    }).filter(item => item && item.id); 
    setEditableCart(cartItems);
    setEditableRentalDate(app.rentalDate);
    setEditableReturnDate(app.returnDate);
    setItemSelectionForEdit({itemId: '', quantity: 1});
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingApplication(null);
    setEditableCart([]);
  };

  const handleEditCartItemQuantity = (itemId: string, newQuantityStr: string) => {
    const newQuantity = parseInt(newQuantityStr, 10) || 0; // Default to 0 if NaN

    const itemDetailGlobal = allItems.find(i => i.id === itemId); // From the globally fetched item list
    if (!itemDetailGlobal) return;

    const originalQuantityInApp = editingApplication?.items.find(i => i.itemId === itemId)?.quantity || 0;
    const currentStockOfItem = itemDetailGlobal.currentStock;
    // Effective available stock for *this specific item in this application* for edits:
    // Its current physical stock + what this application originally reserved for it.
    const effectiveAvailableStock = currentStockOfItem + originalQuantityInApp;

    if (newQuantity <= 0) {
        openConfirmationModal('수량 오류', '수량은 1개 이상이어야 합니다. 삭제하려면 삭제 버튼을 이용하세요.');
        // Optionally revert to original quantity or a safe minimum like 1
        setEditableCart(prevCart => prevCart.map(cartItem => 
            cartItem.id === itemId ? { ...cartItem, selectedQuantity: 1 } : cartItem
        ));
        return;
    }

    if (newQuantity > effectiveAvailableStock) {
        openConfirmationModal('재고 부족', `${itemDetailGlobal.name}의 가용 재고(${effectiveAvailableStock}${itemDetailGlobal.unit})를 초과할 수 없습니다. 현재 ${newQuantity}${itemDetailGlobal.unit} 선택됨.`);
        // Revert to max available or previous valid quantity
        setEditableCart(prevCart => prevCart.map(cartItem => 
            cartItem.id === itemId ? { ...cartItem, selectedQuantity: Math.min(cartItem.selectedQuantity, effectiveAvailableStock) } : cartItem
        ));
        return;
    }

    setEditableCart(prevCart => prevCart.map(cartItem => 
        cartItem.id === itemId ? { ...cartItem, selectedQuantity: newQuantity } : cartItem
    ));
  };


  const handleRemoveFromEditCart = (itemIdToRemove: string) => {
    setEditableCart(prevCart => prevCart.filter(item => item.id !== itemIdToRemove));
  };

  const handleAddItemToEditCart = () => {
    if (!itemSelectionForEdit.itemId) {
      openConfirmationModal('오류', '물품을 선택해주세요.');
      return;
    }
    // Use the refreshed `allItems` for current stock data
    const itemDetailGlobal = allItems.find(i => i.id === itemSelectionForEdit.itemId);
    if (!itemDetailGlobal) return;

    const quantityToAdd = itemSelectionForEdit.quantity;
    if (quantityToAdd <= 0) {
      openConfirmationModal('오류', '수량은 1개 이상이어야 합니다.');
      return;
    }

    const existingCartItem = editableCart.find(ci => ci.id === itemDetailGlobal.id);
    const originalQuantityInAppForItem = editingApplication?.items.find(i => i.itemId === itemDetailGlobal.id)?.quantity || 0;
    const currentStockOfItem = itemDetailGlobal.currentStock;
    
    let finalQuantityInCart;
    let stockCheckLimit;

    if (existingCartItem) { // Item already in cart, updating its quantity
        finalQuantityInCart = existingCartItem.selectedQuantity + quantityToAdd;
        // For an item already in cart, the limit is its physical stock + what this app originally held - what's already in the *editable* cart for it.
        // No, simpler: effective available = physical_stock + original_app_qty_for_this_item
        stockCheckLimit = currentStockOfItem + originalQuantityInAppForItem;
         if (finalQuantityInCart > stockCheckLimit) {
            openConfirmationModal('재고 부족', `총 선택 수량(${finalQuantityInCart})이 ${itemDetailGlobal.name}의 가용 재고(${stockCheckLimit}${itemDetailGlobal.unit})를 초과합니다.`);
            return;
        }
        setEditableCart(prevCart => prevCart.map(ci => ci.id === itemDetailGlobal.id ? {...ci, selectedQuantity: finalQuantityInCart} : ci));
    } else { // New item to cart
        finalQuantityInCart = quantityToAdd;
        // For a brand new item to the cart, the limit is simply its current physical stock.
        stockCheckLimit = currentStockOfItem;
         if (finalQuantityInCart > stockCheckLimit) {
            openConfirmationModal('재고 부족', `${itemDetailGlobal.name}의 현재 재고(${stockCheckLimit}${itemDetailGlobal.unit})를 초과할 수 없습니다.`);
            return;
        }
        setEditableCart(prevCart => [...prevCart, { ...itemDetailGlobal, selectedQuantity: finalQuantityInCart }]);
    }
    setItemSelectionForEdit({itemId: '', quantity: 1}); 
  };
  
  const handleSaveEdits = () => {
    if (!editingApplication) return;

    // Final validation before saving
    if (editableCart.length === 0) {
        openConfirmationModal('오류', '최소 1개 이상의 물품을 선택해야 합니다.');
        return;
    }
    if (!editableRentalDate || !editableReturnDate || editableRentalDate > editableReturnDate) {
        openConfirmationModal('날짜 오류', '대여일과 반납 예정일을 올바르게 선택해주세요. 반납 예정일은 대여일 이후여야 합니다.');
        return;
    }

    // Double check stock for all items in editableCart just before saving
    const currentGlobalItems = getItems(); // Get latest stock status
    for (const cartItem of editableCart) {
        const itemDetailGlobal = currentGlobalItems.find(i => i.id === cartItem.id);
        const originalQuantityInApp = editingApplication.items.find(i => i.itemId === cartItem.id)?.quantity || 0;
        const effectiveAvailableStock = (itemDetailGlobal?.currentStock || 0) + originalQuantityInApp;

        if (!itemDetailGlobal || cartItem.selectedQuantity > effectiveAvailableStock) {
            openConfirmationModal('재고 변경됨', `${cartItem.name}의 재고가 변경되어 요청 수량(${cartItem.selectedQuantity})을 만족할 수 없습니다. (현재 가용: ${effectiveAvailableStock}) 수량을 다시 확인해주세요.`);
            setAllItems(currentGlobalItems); // Update item list in state for combobox
            // Option: also update editableCart quantities to max available if user agrees
            return; 
        }
    }


    const updatedItems: SelectedItemEntry[] = editableCart.map(ci => ({ itemId: ci.id, quantity: ci.selectedQuantity }));
    
    const updatedApp: RentalApplication = {
      ...editingApplication,
      items: updatedItems,
      rentalDate: editableRentalDate,
      returnDate: editableReturnDate,
    };

    try {
        updateRentalApplication(updatedApp);
        // Refresh found applications to reflect changes and allItems for stock
        refreshApplications();
        setAllItems(getItems());
        closeEditModal();
        openConfirmationModal('수정 완료', '대여 신청 정보가 성공적으로 수정되었습니다.');
    } catch (error) {
        console.error("Error updating application:", error);
        openConfirmationModal('수정 실패', error instanceof Error ? error.message : '알 수 없는 오류로 수정에 실패했습니다.');
        setAllItems(getItems()); // Refresh items in case stock was part of the error
    }
  };


  const getItemDetails = (itemId: string): Item | undefined => allItems.find(item => item.id === itemId);


  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Button onClick={() => navigate(ROUTES.HOME)} variant="outline" size="sm" className="mb-6">
          홈으로 이동
        </Button>

        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold text-kaist-orange">대여 신청 내역 확인</h1>
          <p className="mt-2 text-lg text-kaist-gray">신청하신 대여 내역을 조회하고 관리할 수 있습니다.</p>
        </header>

        <Card title="신청 정보 입력">
          <div className="space-y-4">
            <Input label="이름" name="name" value={searchCriteria.name} onChange={handleSearchChange} error={searchErrors.name} placeholder="홍길동" />
            <Input label="학번" name="studentId" value={searchCriteria.studentId} onChange={handleSearchChange} error={searchErrors.studentId} placeholder="20230001" />
            <Input label="전화번호" name="phoneNumber" type="tel" value={searchCriteria.phoneNumber} onChange={handleSearchChange} error={searchErrors.phoneNumber} placeholder="010-1234-5678" />
          </div>
          <div className="mt-6">
            <Button onClick={handleSearch} leftIcon={<SearchIcon />} className="w-full" disabled={isLoading}>
              {isLoading ? '조회 중...' : '조회하기'}
            </Button>
          </div>
        </Card>

        {message && <p className="mt-6 text-center text-gray-600">{message}</p>}

        {foundApplications.length > 0 && (
          <div className="mt-8 space-y-6">
            <h2 className="text-2xl font-semibold text-gray-700">조회 결과 ({foundApplications.length}건)</h2>
            {foundApplications.map(app => (
              <Card key={app.id} title={`신청 ID: ${app.id.substring(0,18)}...`}>
                <div className="space-y-3">
                  <p><strong>신청일:</strong> {app.applicationDate}</p>
                  <p><strong>상태:</strong> <Badge colorClass={RENTAL_STATUS_COLORS[app.status]}>{app.status}</Badge></p>
                  <p><strong>대여일:</strong> {app.rentalDate}</p>
                  <p><strong>반납 예정일:</strong> {app.returnDate}</p>
                  <div>
                    <strong>대여 물품:</strong>
                    <ul className="list-disc list-inside pl-4 mt-1 text-sm text-gray-600">
                      {app.items.map(itemEntry => {
                        const itemDetail = getItemDetails(itemEntry.itemId);
                        return (
                          <li key={itemEntry.itemId}>
                            {itemDetail?.name || '알 수 없는 물품'} x {itemEntry.quantity}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <p><strong>총 물품 금액:</strong> {app.totalItemCost.toLocaleString()} 원</p>
                  <p><strong>보증금:</strong> {app.deposit.toLocaleString()} 원</p>
                  <p className="font-semibold"><strong>총 합계 금액:</strong> {app.totalAmount.toLocaleString()} 원</p>
                </div>
                {app.status === RentalStatus.PENDING && (
                  <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                    <Button onClick={() => openEditModal(app)} variant="secondary" size="sm" leftIcon={<EditIcon className="w-4 h-4"/>}>
                      신청 수정
                    </Button>
                    <Button onClick={() => handleCancelApplication(app.id)} variant="danger" size="sm" leftIcon={<TrashIcon className="w-4 h-4"/>}>
                      신청 취소
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={modalContent.title}
      >
        <div>{typeof modalContent.message === 'string' ? <p>{modalContent.message}</p> : modalContent.message}</div>
        <div className="mt-6 flex justify-end space-x-2">
          {modalContent.onConfirm && (
             <Button onClick={() => { setIsModalOpen(false); modalContent.onConfirm?.(); }} variant="primary">확인</Button>
          )}
          <Button onClick={() => setIsModalOpen(false)} variant={modalContent.onConfirm ? "outline" : "primary"}>
            {modalContent.onConfirm ? "취소" : "닫기"}
          </Button>
        </div>
      </Modal>

      {editingApplication && isEditModalOpen && (
        <Modal isOpen={isEditModalOpen} onClose={closeEditModal} title={`신청 수정 (ID: ${editingApplication.id.substring(0,18)}...)`} size="xl">
            <div className="space-y-6">
                <Card title="날짜 수정">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="대여일" type="date" value={editableRentalDate} onChange={e => setEditableRentalDate(e.target.value)} min={new Date().toISOString().split('T')[0]}/>
                        <Input label="반납 예정일" type="date" value={editableReturnDate} onChange={e => setEditableReturnDate(e.target.value)} min={editableRentalDate || new Date().toISOString().split('T')[0]}/>
                    </div>
                </Card>

                <Card title="물품 수정">
                     <div className="flex flex-col sm:flex-row gap-4 items-end mb-6">
                        <div className="flex-grow">
                        <label htmlFor="edit-item" className="block text-sm font-medium text-gray-700 mb-1">물품 추가</label>
                        <select id="edit-item" value={itemSelectionForEdit.itemId} 
                            onChange={(e) => setItemSelectionForEdit(prev => ({...prev, itemId: e.target.value}))} 
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-kaist-orange focus:border-kaist-orange sm:text-sm"
                        >
                            <option value="">물품 선택...</option>
                            {allItems.map(item => {
                                const originalQtyInApp = editingApplication.items.find(i => i.itemId === item.id)?.quantity || 0;
                                const currentItemStock = item.currentStock;
                                // Display stock for dropdown: if item is already in cart, show its current stock + what this app had. Otherwise, just current stock.
                                // This indicates how many *more* can be added or what the total could be.
                                let displayStockForSelection = currentItemStock;
                                if (editableCart.some(ci => ci.id === item.id)) { // If item already in cart
                                     displayStockForSelection = currentItemStock + originalQtyInApp - (editableCart.find(ci => ci.id === item.id)?.selectedQuantity || 0) ;
                                }
                                displayStockForSelection = Math.max(0, displayStockForSelection);


                                return (
                                    <option key={item.id} value={item.id} disabled={currentItemStock === 0 && !editableCart.some(ci => ci.id === item.id) }>
                                        {item.name} (가용 추가: {displayStockForSelection}{item.unit})
                                        {currentItemStock === 0 && !editableCart.some(ci => ci.id === item.id) ? " - 현재 재고 없음" : ""}
                                    </option>
                                );
                            })}
                        </select>
                        </div>
                        <div className="w-full sm:w-auto">
                        <label htmlFor="edit-quantity" className="block text-sm font-medium text-gray-700 mb-1">추가할 수량</label>
                        <Input type="number" id="edit-quantity" value={itemSelectionForEdit.quantity} 
                            onChange={(e) => setItemSelectionForEdit(prev => ({...prev, quantity: Math.max(1, parseInt(e.target.value, 10) || 1)}))} 
                            min="1" className="w-full sm:w-24"/>
                        </div>
                        <Button onClick={handleAddItemToEditCart} leftIcon={<PlusIcon />} className="w-full sm:w-auto">추가/업데이트</Button>
                    </div>

                    {editableCart.length > 0 ? (
                        <div className="space-y-3">
                        {editableCart.map(cartItem => (
                            <div key={cartItem.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md border">
                                <div className="flex items-center space-x-3">
                                    <img src={cartItem.imageUrl} alt={cartItem.name} className="w-10 h-10 rounded-md object-cover"/>
                                    <div>
                                        <p className="font-medium">{cartItem.name}</p>
                                        <p className="text-xs text-gray-500">단가: {cartItem.price.toLocaleString()}원</p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Input 
                                        type="number" 
                                        value={cartItem.selectedQuantity} 
                                        onChange={(e) => handleEditCartItemQuantity(cartItem.id, e.target.value)} 
                                        min="1" 
                                        className="w-20 text-sm p-1"
                                        aria-label={`수량 ${cartItem.name}`}
                                    />
                                    <Button onClick={() => handleRemoveFromEditCart(cartItem.id)} variant="danger" size="sm" className="p-1" aria-label={`삭제 ${cartItem.name}`}>
                                        <TrashIcon className="w-3 h-3"/>
                                    </Button>
                                </div>
                            </div>
                        ))}
                        </div>
                    ) : <p className="text-center text-gray-500">선택된 물품이 없습니다.</p>}
                </Card>
            </div>
            <div className="mt-8 flex justify-end space-x-3">
                <Button onClick={closeEditModal} variant="outline">취소</Button>
                <Button onClick={handleSaveEdits}>변경사항 저장</Button>
            </div>
        </Modal>
      )}
    </div>
  );
};

export default UserCheckStatusPage;