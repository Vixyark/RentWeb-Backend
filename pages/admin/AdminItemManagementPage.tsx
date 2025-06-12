import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Item } from '../../types';
import { getItems, addItem, updateItem, deleteItem } from '../../services/dataService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import { PlusIcon, EditIcon, TrashIcon, SearchIcon } from '../../components/icons';

const AdminItemManagementPage: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<Item> & { currentStockForEdit?: number } | null>(null);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [imageUrlPreview, setImageUrlPreview] = useState<string>('');

  const fetchItems = useCallback(() => {
    setIsLoading(true);
    setItems(getItems());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return items.filter(item => 
      item.name.toLowerCase().includes(lowerSearchTerm) ||
      item.id.toLowerCase().includes(lowerSearchTerm)
    );
  }, [items, searchTerm]);

  const openModal = (mode: 'add' | 'edit', item?: Item) => {
    setModalMode(mode);
    if (mode === 'edit' && item) {
      setEditingItem({ ...item, currentStockForEdit: item.currentStock }); // Store currentStock separately for edit logic
      setImageUrlPreview(item.imageUrl || '');
    } else {
      setEditingItem({ name: '', initialStock: 10, currentStockForEdit:10, price: 1000, description: '', imageUrl: '', unit: '개' });
      setImageUrlPreview('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setImageUrlPreview('');
  };

  const handleModalInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (editingItem) {
      const { name, value, type } = e.target;
      let val: string | number = value;
      if (type === 'number') {
        val = parseFloat(value);
        if (isNaN(val)) val = 0; // Or handle empty string case for numbers
      }
      
      const updatedEditingItem = { ...editingItem, [name]: val };

      // If initialStock is changed, also update currentStockForEdit if it exceeds new initialStock
      if (name === 'initialStock' && typeof val === 'number') {
        updatedEditingItem.currentStockForEdit = Math.min(updatedEditingItem.currentStockForEdit ?? val, val);
      }


      setEditingItem(updatedEditingItem);
      if (name === 'imageUrl') {
        setImageUrlPreview(value);
      }
    }
  };

  const handleSaveItem = () => {
    if (!editingItem || !editingItem.name || editingItem.initialStock == null || editingItem.initialStock < 0 || editingItem.price == null || editingItem.price < 0 || !editingItem.unit) {
        alert('물품명, 초기 재고(0 이상), 가격(0 이상), 단위는 필수 항목입니다.');
        return;
    }
     if (editingItem.currentStockForEdit != null && editingItem.initialStock != null && editingItem.currentStockForEdit > editingItem.initialStock) {
        alert('현재 재고는 초기 재고 수량보다 클 수 없습니다.');
        return;
    }


    if (modalMode === 'add') {
      addItem({
        name: editingItem.name,
        initialStock: editingItem.initialStock,
        price: editingItem.price,
        description: editingItem.description || '',
        imageUrl: editingItem.imageUrl || `https://picsum.photos/seed/${Date.now()}/200`,
        unit: editingItem.unit,
      });
    } else if (editingItem.id && editingItem.currentStockForEdit !== undefined) {
      const itemToUpdate: Item = {
          id: editingItem.id,
          name: editingItem.name,
          initialStock: editingItem.initialStock,
          currentStock: editingItem.currentStockForEdit, // Use the edited current stock
          price: editingItem.price,
          description: editingItem.description || '',
          imageUrl: editingItem.imageUrl || `https://picsum.photos/seed/${editingItem.id}/200`,
          unit: editingItem.unit
      };
      updateItem(itemToUpdate);
    }
    fetchItems();
    closeModal();
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm('정말로 이 물품을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다. 관련된 대여 내역이 있을 경우 주의하십시오.')) {
      try {
        deleteItem(id);
        fetchItems();
      } catch (error) {
         alert(error instanceof Error ? error.message : "삭제 중 오류 발생");
      }
    }
  };

  if (isLoading) return <div className="flex justify-center items-center h-full"><p>로딩 중...</p></div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-gray-800">물품 관리</h2>
        <Button onClick={() => openModal('add')} leftIcon={<PlusIcon />}>새 물품 추가</Button>
      </div>

      <Card>
        <div className="mb-6">
          <Input 
            placeholder="물품명 또는 ID 검색" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            leadingIcon={<SearchIcon className="w-4 h-4"/>}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이미지</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">물품명</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">재고 (현재/초기)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">단위</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">가격</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">설명</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <img src={item.imageUrl || 'https://picsum.photos/40'} alt={item.name} className="w-10 h-10 rounded-md object-cover"/>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.currentStock} / {item.initialStock}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.unit}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.price.toLocaleString()} 원</td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={item.description}>{item.description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <Button onClick={() => openModal('edit', item)} variant="outline" size="sm" className="p-1.5">
                      <EditIcon className="w-4 h-4"/>
                    </Button>
                    <Button onClick={() => handleDeleteItem(item.id)} variant="danger" size="sm" className="p-1.5">
                      <TrashIcon className="w-4 h-4"/>
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-500">데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isModalOpen && editingItem && (
        <Modal isOpen={isModalOpen} onClose={closeModal} title={modalMode === 'add' ? '새 물품 추가' : '물품 수정'} size="lg">
          <div className="space-y-4">
            {modalMode === 'edit' && editingItem.id && (
              <Input label="물품 ID" value={editingItem.id} readOnly disabled />
            )}
            <Input label="물품명" name="name" value={editingItem.name || ''} onChange={handleModalInputChange} required />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="초기 재고" name="initialStock" type="number" value={editingItem.initialStock || 0} onChange={handleModalInputChange} min="0" required />
                {modalMode === 'edit' && <Input label="현재 재고" name="currentStockForEdit" type="number" value={editingItem.currentStockForEdit ?? 0} onChange={handleModalInputChange} min="0" required />}
                <Input label="단위" name="unit" value={editingItem.unit || ''} onChange={handleModalInputChange} required />
            </div>
            <Input label="대여 가격 (원)" name="price" type="number" value={editingItem.price || 0} onChange={handleModalInputChange} min="0" required />
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">설명</label>
              <textarea id="description" name="description" value={editingItem.description || ''} onChange={handleModalInputChange} rows={3} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-kaist-orange focus:border-kaist-orange sm:text-sm"/>
            </div>
            <Input label="이미지 URL" name="imageUrl" value={editingItem.imageUrl || ''} onChange={handleModalInputChange} />
            {imageUrlPreview && (
                <div className="mt-2">
                    <p className="text-sm text-gray-600">이미지 미리보기:</p>
                    <img src={imageUrlPreview} alt="Preview" className="mt-1 w-32 h-32 rounded-md object-cover border border-gray-200" onError={(e) => { e.currentTarget.style.display='none'; e.currentTarget.src='https://picsum.photos/200/200'; setTimeout(() => e.currentTarget.style.display='block', 50) }} onLoad={(e) => e.currentTarget.style.display='block'}/>
                </div>
            )}
          </div>
          <div className="mt-6 flex justify-end space-x-3">
            <Button onClick={closeModal} variant="outline">취소</Button>
            <Button onClick={handleSaveItem}>{modalMode === 'add' ? '추가하기' : '저장하기'}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminItemManagementPage;