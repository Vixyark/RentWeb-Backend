import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RentalApplication, RentalStatus, Item } from '../../types';
import { getRentalApplications, updateRentalApplication, getItems, getAdminDashboardStats, getItem } from '../../services/dataService';
import { RENTAL_STATUS_OPTIONS, RENTAL_STATUS_COLORS } from '../../constants';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Badge from '../../components/common/Badge';
import { EyeIcon, EditIcon, SearchIcon, CalendarIcon, ChevronUpIcon, ChevronDownIcon } from '../../components/icons';

type SortConfig = { key: keyof RentalApplication | 'applicantName' | 'studentId'; direction: 'ascending' | 'descending' } | null;

const AdminDashboardPage: React.FC = () => {
  const [rentals, setRentals] = useState<RentalApplication[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]); // Keep allItems for getItemName
  const [stats, setStats] = useState({ newRequests: 0, dueToday: 0, currentlyRented: 0, lowStockItems: 0 });
  
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<RentalStatus | ''>('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRental, setSelectedRental] = useState<RentalApplication | null>(null);
  const [editedRental, setEditedRental] = useState<RentalApplication | null>(null);

  const fetchDashboardData = useCallback(() => {
    setIsLoading(true);
    setRentals(getRentalApplications().sort((a, b) => new Date(b.applicationDate).getTime() - new Date(a.applicationDate).getTime()));
    setAllItems(getItems()); // Ensure allItems is up-to-date for getItemName
    setStats(getAdminDashboardStats());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const getItemName = useCallback((itemId: string) => {
    // Use the getItem function for potentially more up-to-date item details if needed,
    // or rely on the allItems state if it's guaranteed to be fresh.
    // For simplicity with current structure, using allItems state is fine if fetchDashboardData keeps it fresh.
    const item = allItems.find(i => i.id === itemId);
    return item ? item.name : '알 수 없는 물품';
  }, [allItems]);

  const filteredAndSortedRentals = useMemo(() => {
    let filtered = [...rentals];

    if (statusFilter) {
      filtered = filtered.filter(r => r.status === statusFilter);
    }
    if (dateRange.start) {
      filtered = filtered.filter(r => r.applicationDate >= dateRange.start);
    }
    if (dateRange.end) {
      filtered = filtered.filter(r => r.applicationDate <= dateRange.end);
    }
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.applicantName.toLowerCase().includes(lowerSearchTerm) ||
        r.studentId.toLowerCase().includes(lowerSearchTerm) ||
        r.items.some(itemEntry => getItemName(itemEntry.itemId).toLowerCase().includes(lowerSearchTerm))
      );
    }

    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof RentalApplication];
        const bValue = b[sortConfig.key as keyof RentalApplication];
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [rentals, statusFilter, dateRange, searchTerm, sortConfig, getItemName]);

  const requestSort = (key: keyof RentalApplication | 'applicantName' | 'studentId') => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: keyof RentalApplication | 'applicantName' | 'studentId') => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ChevronUpIcon className="w-3 h-3 opacity-30 inline-block ml-1" />;
    }
    return sortConfig.direction === 'ascending' ? 
      <ChevronUpIcon className="w-3 h-3 inline-block ml-1" /> : 
      <ChevronDownIcon className="w-3 h-3 inline-block ml-1" />;
  };

  const openModal = (rental: RentalApplication) => {
    setSelectedRental(rental);
    setEditedRental({ ...rental }); 
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedRental(null);
    setEditedRental(null);
  };

  const handleModalInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (editedRental) {
      const { name, value, type } = e.target;
      if (type === 'checkbox') {
         const { checked } = e.target as HTMLInputElement;
         setEditedRental({ ...editedRental, [name]: checked });
      } else {
        setEditedRental({ ...editedRental, [name]: value });
      }
    }
  };
  
  const handleSaveChanges = () => {
    if (editedRental) {
      if (editedRental.status === RentalStatus.RETURNED && !editedRental.actualReturnDate) {
        alert('반납 완료 상태로 변경 시 실제 반납일을 필수로 입력해야 합니다.');
        return;
      }
      try {
        updateRentalApplication(editedRental);
        fetchDashboardData(); 
        closeModal();
      } catch (error) {
        console.error("Error updating rental application:", error);
        alert(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
      }
    }
  };

  const StatCard: React.FC<{ title: string; value: number | string; icon?: React.ReactNode }> = ({ title, value, icon }) => (
    <Card className="shadow-md">
      <div className="flex items-center">
        {icon && <div className="p-3 rounded-full bg-kaist-lightOrange mr-4 text-kaist-orange">{icon}</div>}
        <div>
          <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </Card>
  );

  if (isLoading) return <div className="flex justify-center items-center h-full"><p>로딩 중...</p></div>;

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-bold text-gray-800">대여 현황 대시보드</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="신규 대여 요청" value={stats.newRequests} />
        <StatCard title="오늘 반납 예정" value={stats.dueToday} />
        <StatCard title="현재 대여 중" value={stats.currentlyRented} />
        <StatCard title="재고 부족 경고" value={stats.lowStockItems} />
      </div>

      <Card title="대여 요청 목록">
        <div className="mb-6 space-y-4 md:space-y-0 md:flex md:items-end md:justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full lg:w-3/4">
            <Input 
              placeholder="검색 (신청자명, 학번, 물품명)" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
              leadingIcon={<SearchIcon className="w-4 h-4"/>}
            />
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value as RentalStatus | '')}
              className="block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-kaist-orange focus:border-kaist-orange sm:text-sm"
            >
              <option value="">상태 전체</option>
              {RENTAL_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex items-center space-x-2">
                <Input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))} leadingIcon={<CalendarIcon className="w-4 h-4"/>} />
                <span className="text-gray-500">-</span>
                <Input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))} min={dateRange.start} leadingIcon={<CalendarIcon className="w-4 h-4"/>} />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['신청자명', '학번', '대여 물품(요약)', '신청일', '반납 예정일', '상태'].map((header, idx) => {
                  const keyMap = {
                    '신청자명': 'applicantName', '학번': 'studentId', '신청일': 'applicationDate', '반납 예정일': 'returnDate', '상태': 'status'
                  } as Record<string, keyof RentalApplication>;
                  const sortKey = keyMap[header];
                  return (
                    <th key={idx} scope="col" 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => sortKey && requestSort(sortKey as keyof RentalApplication)}
                    >
                      {header} {sortKey && getSortIcon(sortKey as keyof RentalApplication)}
                    </th>
                  );
                })}
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedRentals.map((rental) => (
                <tr key={rental.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{rental.applicantName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{rental.studentId}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate" title={rental.items.map(itemEntry => `${getItemName(itemEntry.itemId)} (${itemEntry.quantity})`).join(', ')}>
                    {rental.items.map(itemEntry => `${getItemName(itemEntry.itemId)} (${itemEntry.quantity})`).join(', ')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{rental.applicationDate}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{rental.returnDate}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Badge colorClass={RENTAL_STATUS_COLORS[rental.status]}>{rental.status}</Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Button onClick={() => openModal(rental)} variant="outline" size="sm" leftIcon={<EyeIcon className="w-4 h-4" />}>
                      상세/수정
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredAndSortedRentals.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-500">데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isModalOpen && selectedRental && editedRental && (
        <Modal isOpen={isModalOpen} onClose={closeModal} title={`대여 요청 상세 (ID: ${selectedRental.id.substring(0,18)}...)`} size="lg">
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-700">신청자 정보</h4>
            <p><strong>이름:</strong> {selectedRental.applicantName}</p>
            <p><strong>학번:</strong> {selectedRental.studentId}</p>
            <p><strong>연락처:</strong> {selectedRental.phoneNumber}</p>
            <p><strong>계좌 정보:</strong> {selectedRental.accountHolderName} / {selectedRental.accountNumber}</p>
            
            <h4 className="font-semibold text-gray-700 mt-4">대여 정보</h4>
            <p><strong>신청일:</strong> {selectedRental.applicationDate}</p>
            <p><strong>대여일:</strong> {selectedRental.rentalDate}</p>
            <p><strong>반납 예정일:</strong> {selectedRental.returnDate}</p>
            <p><strong>대여 물품:</strong></p>
            <ul className="list-disc list-inside pl-4">
              {selectedRental.items.map(itemEntry => (
                <li key={itemEntry.itemId}>{getItemName(itemEntry.itemId)} x {itemEntry.quantity}</li>
              ))}
            </ul>
            <p><strong>총 금액:</strong> {selectedRental.totalAmount.toLocaleString()}원 (물품 {selectedRental.totalItemCost.toLocaleString()}원 + 보증금 {selectedRental.deposit.toLocaleString()}원)</p>

            <hr className="my-4"/>
            <h4 className="font-semibold text-gray-700">관리자 수정</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700">상태 변경</label>
                    <select id="status" name="status" value={editedRental.status} onChange={handleModalInputChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-kaist-orange focus:border-kaist-orange sm:text-sm rounded-md">
                    {RENTAL_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <Input label="대여 담당자" name="rentalStaff" value={editedRental.rentalStaff || ''} onChange={handleModalInputChange} />
                <Input label="반납 담당자" name="returnStaff" value={editedRental.returnStaff || ''} onChange={handleModalInputChange} />
                 {editedRental.status === RentalStatus.RETURNED && (
                    <>
                        <Input label="실제 반납일" type="date" name="actualReturnDate" value={editedRental.actualReturnDate || ''} onChange={handleModalInputChange} required/>
                        <div className="flex items-center mt-2 pt-4">
                            <input id="depositRefunded" name="depositRefunded" type="checkbox" checked={editedRental.depositRefunded || false} onChange={handleModalInputChange} className="h-4 w-4 text-kaist-orange border-gray-300 rounded focus:ring-kaist-orange"/>
                            <label htmlFor="depositRefunded" className="ml-2 block text-sm text-gray-900">보증금 환급 완료</label>
                        </div>
                    </>
                )}
            </div>
          </div>
          <div className="mt-6 flex justify-end space-x-3">
            <Button onClick={closeModal} variant="outline">취소</Button>
            <Button onClick={handleSaveChanges}>저장</Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminDashboardPage;