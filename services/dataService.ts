import { Item, RentalApplication, RentalStatus, SelectedItemEntry } from '../types';
import { INITIAL_ITEMS, FIXED_DEPOSIT_AMOUNT } from '../constants';

const ITEMS_KEY = 'kaistWelfareItems';
const RENTALS_KEY = 'kaistWelfareRentals';

// Initialize localStorage if empty
const initializeStorage = () => {
  if (!localStorage.getItem(ITEMS_KEY)) {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(INITIAL_ITEMS));
  }
  if (!localStorage.getItem(RENTALS_KEY)) {
    localStorage.setItem(RENTALS_KEY, JSON.stringify([]));
  }
};

initializeStorage();

// Item Services
export const getItems = (): Item[] => {
  const itemsJson = localStorage.getItem(ITEMS_KEY);
  return itemsJson ? JSON.parse(itemsJson) : [];
};

export const getItem = (id: string): Item | undefined => {
  return getItems().find(item => item.id === id);
};

export const addItem = (itemData: Omit<Item, 'id' | 'currentStock'>): Item => {
  const items = getItems();
  const newItem: Item = {
    ...itemData,
    id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    currentStock: itemData.initialStock, // Current stock is same as initial for a new item
  };
  items.push(newItem);
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  return newItem;
};

export const updateItem = (updatedItem: Item): Item => {
  let items = getItems();
   if (updatedItem.currentStock > updatedItem.initialStock) {
    throw new Error(`Current stock (${updatedItem.currentStock}) cannot exceed initial stock (${updatedItem.initialStock}) for item ${updatedItem.name}.`);
  }
  items = items.map(item => (item.id === updatedItem.id ? updatedItem : item));
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  return updatedItem;
};

export const deleteItem = (id: string): void => {
  const rentals = getRentalApplications();
  const hasActiveRentals = rentals.some(rental =>
    (rental.status === RentalStatus.PENDING || rental.status === RentalStatus.RENTED) &&
    rental.items.some(itemEntry => itemEntry.itemId === id)
  );

  if (hasActiveRentals) {
    throw new Error('Cannot delete item with active (Pending or Rented) rental applications.');
  }

  let items = getItems();
  items = items.filter(item => item.id !== id);
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
};


// Rental Application Services
export const getRentalApplications = (): RentalApplication[] => {
  const rentalsJson = localStorage.getItem(RENTALS_KEY);
  return rentalsJson ? JSON.parse(rentalsJson).map((app: RentalApplication) => ({
    ...app, // Ensure all fields are present, especially if new fields were added to the type
    deposit: app.deposit ?? FIXED_DEPOSIT_AMOUNT 
  })) : [];
};

export const getRentalApplication = (id: string): RentalApplication | undefined => {
  return getRentalApplications().find(app => app.id === id);
};

const calculateRentalCosts = (items: SelectedItemEntry[], allItems: Item[]): { totalItemCost: number, totalAmount: number } => {
  let totalItemCost = 0;
  items.forEach(selected => {
    const itemDetails = allItems.find(i => i.id === selected.itemId);
    if (itemDetails) {
      totalItemCost += itemDetails.price * selected.quantity;
    }
  });
  return {
    totalItemCost,
    totalAmount: totalItemCost + FIXED_DEPOSIT_AMOUNT,
  };
};

const adjustStockForItem = (itemId: string, quantity: number, operation: 'decrease' | 'increase') => {
  const currentItems = getItems(); // Get fresh list of items
  const item = currentItems.find(i => i.id === itemId);
  if (item) {
    let newStock = item.currentStock;
    if (operation === 'decrease') {
      if (item.currentStock < quantity) {
        throw new Error(`Insufficient stock for item ${item.name}. Requested: ${quantity}, Available: ${item.currentStock}`);
      }
      newStock -= quantity;
    } else {
      newStock += quantity;
      // Ensure current stock does not exceed initial stock when increasing
      if (newStock > item.initialStock) {
        newStock = item.initialStock; 
      }
    }
    const updatedItems = currentItems.map(i => i.id === itemId ? { ...item, currentStock: newStock } : i);
    localStorage.setItem(ITEMS_KEY, JSON.stringify(updatedItems));
  } else {
     throw new Error(`Item with ID ${itemId} not found for stock adjustment.`);
  }
};


export const addRentalApplication = (
  appData: Omit<RentalApplication, 'id' | 'applicationDate' | 'status' | 'totalItemCost' | 'totalAmount' | 'deposit'>
): RentalApplication => {
  const allItems = getItems(); // Get current items for cost calculation and stock check
  
  // Validate stock before creating application
  for (const selectedItem of appData.items) {
    const itemDetail = allItems.find(i => i.id === selectedItem.itemId);
    if (!itemDetail || itemDetail.currentStock < selectedItem.quantity) {
      throw new Error(`Insufficient stock for ${itemDetail?.name || 'unknown item'}. Requested: ${selectedItem.quantity}, Available: ${itemDetail?.currentStock || 0}. Please refresh and try again.`);
    }
  }

  const { totalItemCost, totalAmount } = calculateRentalCosts(appData.items, allItems);

  const newApplication: RentalApplication = {
    ...appData,
    id: `rental-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    applicationDate: new Date().toISOString().split('T')[0],
    status: RentalStatus.PENDING,
    totalItemCost,
    deposit: FIXED_DEPOSIT_AMOUNT,
    totalAmount,
  };
  
  // Decrease stock for PENDING applications
  newApplication.items.forEach(itemEntry => adjustStockForItem(itemEntry.itemId, itemEntry.quantity, 'decrease'));

  const rentals = getRentalApplications();
  rentals.push(newApplication);
  localStorage.setItem(RENTALS_KEY, JSON.stringify(rentals));
  return newApplication;
};


export const updateRentalApplication = (updatedApp: RentalApplication): RentalApplication => {
  let rentals = getRentalApplications();
  const originalApp = rentals.find(r => r.id === updatedApp.id);
  const allItems = getItems(); // Get fresh items for cost calculation and stock checks

  if (!originalApp) {
    throw new Error(`Rental application with ID ${updatedApp.id} not found.`);
  }
  
  const { totalItemCost, totalAmount } = calculateRentalCosts(updatedApp.items, allItems);
  const appWithRecalculatedCosts: RentalApplication = {
      ...updatedApp,
      totalItemCost,
      deposit: FIXED_DEPOSIT_AMOUNT,
      totalAmount
  };

  const oldStatusIsReserved = originalApp.status === RentalStatus.PENDING || originalApp.status === RentalStatus.RENTED;
  const newStatusIsReserved = appWithRecalculatedCosts.status === RentalStatus.PENDING || appWithRecalculatedCosts.status === RentalStatus.RENTED;

  // Temporarily hold stock adjustments to validate all changes first
  const stockAdjustments: Array<{ itemId: string; quantity: number; operation: 'decrease' | 'increase' }> = [];

  const allInvolvedItemIds = new Set([...originalApp.items.map(i => i.itemId), ...appWithRecalculatedCosts.items.map(i => i.itemId)]);

  allInvolvedItemIds.forEach(itemId => {
    const oldEntry = originalApp.items.find(i => i.itemId === itemId);
    const newEntry = appWithRecalculatedCosts.items.find(i => i.itemId === itemId);
    const oldQty = oldEntry ? oldEntry.quantity : 0;
    const newQty = newEntry ? newEntry.quantity : 0;
    const itemDetails = allItems.find(i => i.id === itemId);
    if (!itemDetails) throw new Error(`Item details for ${itemId} not found during update.`);


    if (oldStatusIsReserved && !newStatusIsReserved) { // Moving out of reserved: restore original quantity
      if (oldQty > 0) stockAdjustments.push({ itemId, quantity: oldQty, operation: 'increase' });
    } else if (!oldStatusIsReserved && newStatusIsReserved) { // Moving into reserved: decrease new quantity
      if (newQty > 0) stockAdjustments.push({ itemId, quantity: newQty, operation: 'decrease' });
    } else if (oldStatusIsReserved && newStatusIsReserved) { // Staying in reserved: adjust by delta
      const delta = newQty - oldQty;
      if (delta > 0) stockAdjustments.push({ itemId, quantity: delta, operation: 'decrease' }); // More items requested
      else if (delta < 0) stockAdjustments.push({ itemId, quantity: -delta, operation: 'increase' }); // Fewer items requested
    }
  });

  // Validate proposed stock adjustments
  const tempStockLevels = new Map(allItems.map(item => [item.id, item.currentStock]));
  for (const adj of stockAdjustments) {
    const currentTempStock = tempStockLevels.get(adj.itemId) || 0;
    if (adj.operation === 'decrease') {
      if (currentTempStock < adj.quantity) {
        const item = allItems.find(i => i.id === adj.itemId);
        throw new Error(`Insufficient stock for ${item?.name || adj.itemId} to complete update. Requested change: ${adj.quantity}, Available: ${currentTempStock}`);
      }
      tempStockLevels.set(adj.itemId, currentTempStock - adj.quantity);
    } else {
      // tempStockLevels.set(adj.itemId, currentTempStock + adj.quantity); // Not strictly needed for validation of decrease, but good for tracking
    }
  }

  // If validation passes, apply stock adjustments
  stockAdjustments.forEach(adj => adjustStockForItem(adj.itemId, adj.quantity, adj.operation));
  
  rentals = rentals.map(app => (app.id === appWithRecalculatedCosts.id ? appWithRecalculatedCosts : app));
  localStorage.setItem(RENTALS_KEY, JSON.stringify(rentals));
  return appWithRecalculatedCosts;
};

export const cancelRentalApplication = (applicationId: string): boolean => {
  let rentals = getRentalApplications();
  const appToCancel = rentals.find(r => r.id === applicationId);

  if (appToCancel && appToCancel.status === RentalStatus.PENDING) {
    // Restore stock for PENDING applications being cancelled
    appToCancel.items.forEach(itemEntry => adjustStockForItem(itemEntry.itemId, itemEntry.quantity, 'increase'));
    
    rentals = rentals.filter(r => r.id !== applicationId);
    localStorage.setItem(RENTALS_KEY, JSON.stringify(rentals));
    return true; 
  }
  if (appToCancel && (appToCancel.status === RentalStatus.RENTED || appToCancel.status === RentalStatus.RETURNED)) {
    throw new Error("Cannot cancel an application that is already Rented or Returned via this method. Admin should change status.");
  }
  return false; 
};


export const findRentalApplications = (name: string, studentId: string, phoneNumber: string): RentalApplication[] => {
  const rentals = getRentalApplications();
  return rentals.filter(app => 
    app.applicantName === name &&
    app.studentId === studentId &&
    app.phoneNumber === phoneNumber
  ).sort((a, b) => new Date(b.applicationDate).getTime() - new Date(a.applicationDate).getTime()); 
};

export const getAdminDashboardStats = () => {
  const rentals = getRentalApplications();
  const items = getItems();
  const today = new Date().toISOString().split('T')[0];

  const newRequests = rentals.filter(r => r.status === RentalStatus.PENDING).length;
  const dueToday = rentals.filter(r => r.status === RentalStatus.RENTED && r.returnDate === today).length;
  const currentlyRented = rentals.filter(r => r.status === RentalStatus.RENTED).length;
  const lowStockItems = items.filter(i => i.currentStock < 5 && i.initialStock > 0).length; // Only count if it was ever in stock

  return { newRequests, dueToday, currentlyRented, lowStockItems };
};