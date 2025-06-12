
import { Router, IRequest } from 'itty-router';
// NOTE: In a real Cloudflare Worker, you'd use `hono/jwt` or a similar robust library for JWT.
// For this example, we'll use a simplified conceptual JWT handling.
// You would install it via npm and import it. For now, basic crypto.
// Example: import { sign, verify } from '@tsndr/cloudflare-worker-jwt'; - if you were to use such a library

// --- Placeholder Cloudflare Types ---
type D1Database = any; // This 'any' type is often a source of issues with specific D1 method typings
type ExecutionContext = any;
type D1PreparedStatement = any; // Ideally, this would be a more specific type from Cloudflare's SDK
interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: any;
  error?: string;
}


// --- Types (mirroring frontend types.ts) ---
interface Item {
  id: string;
  name: string;
  initialStock: number;
  currentStock: number;
  price: number;
  description: string;
  imageUrl: string;
  unit: string;
}

interface SelectedItemEntry {
  itemId: string;
  quantity: number;
}

enum RentalStatus {
  PENDING = '대여 전',
  RENTED = '대여 중',
  RETURNED = '반납 완료',
}

interface RentalApplication {
  id: string;
  applicantName: string;
  phoneNumber: string;
  studentId: string;
  accountHolderName: string;
  accountNumber: string;
  rentalDate: string; // YYYY-MM-DD
  returnDate: string; // YYYY-MM-DD
  items: SelectedItemEntry[];
  totalItemCost: number;
  deposit: number;
  totalAmount: number;
  status: RentalStatus;
  applicationDate: string; // YYYY-MM-DD
  rentalStaff?: string;
  returnStaff?: string;
  actualReturnDate?: string; // YYYY-MM-DD
  depositRefunded?: boolean;
}

// --- Environment Variables ---
export interface Env {
  DB: D1Database;
  ADMIN_ID: string;
  ADMIN_PASSWORD: string;
  JWT_SECRET: string; // A strong secret key
  FIXED_DEPOSIT_AMOUNT: string; // Store as string, parse to number
}

// --- Constants ---
const FIXED_DEPOSIT_AMOUNT = (env: Env) => parseInt(env.FIXED_DEPOSIT_AMOUNT || "10000", 10);


// --- D1 Database Schema (for reference) ---
/*
  -- Items Table
  CREATE TABLE IF NOT EXISTS Items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    initialStock INTEGER NOT NULL,
    currentStock INTEGER NOT NULL,
    price INTEGER NOT NULL,
    description TEXT,
    imageUrl TEXT,
    unit TEXT NOT NULL,
    CHECK (currentStock >= 0),
    CHECK (currentStock <= initialStock)
  );

  -- RentalApplications Table
  CREATE TABLE IF NOT EXISTS RentalApplications (
    id TEXT PRIMARY KEY,
    applicantName TEXT NOT NULL,
    phoneNumber TEXT NOT NULL,
    studentId TEXT NOT NULL,
    accountHolderName TEXT NOT NULL,
    accountNumber TEXT NOT NULL,
    rentalDate TEXT NOT NULL, -- YYYY-MM-DD
    returnDate TEXT NOT NULL, -- YYYY-MM-DD
    totalItemCost INTEGER NOT NULL,
    deposit INTEGER NOT NULL,
    totalAmount INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('대여 전', '대여 중', '반납 완료')),
    applicationDate TEXT NOT NULL, -- YYYY-MM-DD
    rentalStaff TEXT,
    returnStaff TEXT,
    actualReturnDate TEXT, -- YYYY-MM-DD
    depositRefunded INTEGER DEFAULT 0 -- 0 for false, 1 for true
  );

  -- RentalApplicationItems Table (Junction Table)
  CREATE TABLE IF NOT EXISTS RentalApplicationItems (
    rentalApplicationId TEXT NOT NULL,
    itemId TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    PRIMARY KEY (rentalApplicationId, itemId),
    FOREIGN KEY (rentalApplicationId) REFERENCES RentalApplications(id) ON DELETE CASCADE,
    FOREIGN KEY (itemId) REFERENCES Items(id) ON DELETE RESTRICT
  );
*/


// --- JWT Utilities (Simplified) ---
// In a real app, use a proper JWT library and consider key rotation, algorithm choices, etc.
const generateJwt = async (payload: object, secret: string): Promise<string> => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const key = await crypto.subtle.importKey(
    'raw', 
    new TextEncoder().encode(secret), 
    { name: 'HMAC', hash: 'SHA-256' }, 
    false, 
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC', 
    key, 
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
};

const verifyJwt = async (token: string, secret: string): Promise<any | null> => {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      (new Uint8Array(atob(encodedSignature.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => c.charCodeAt(0)))).buffer,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );

    if (!isValid) return null;

    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')));
    // Check expiry if 'exp' claim is present
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null; // Token expired
    }
    return payload;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
};


// --- Router Setup ---
const router = Router();

// --- Middleware ---
const addCorsHeaders = (response: Response) => {
  response.headers.set('Access-Control-Allow-Origin', '*'); // Adjust for production
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
};

const authMiddleware = async (request: IRequest, env: Env, context: ExecutionContext) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid token' }), { status: 401 });
  }
  const token = authHeader.substring(7);
  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload || payload.id !== env.ADMIN_ID) { // Simple check, could be more robust
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), { status: 401 });
  }
  // Attach admin payload to request for later use if needed
  (request as any).admin = payload;
};


// --- Helper Functions ---
const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const calculateRentalCosts = (selectedItems: SelectedItemEntry[], allDbItems: Item[], env: Env): { totalItemCost: number, totalAmount: number } => {
  let totalItemCost = 0;
  selectedItems.forEach(selected => {
    const itemDetails = allDbItems.find(i => i.id === selected.itemId);
    if (itemDetails) {
      // Ensure properties are treated as numbers
      const price = Number(itemDetails.price);
      const quantity = Number(selected.quantity);
      if (!isNaN(price) && !isNaN(quantity)) {
        totalItemCost += price * quantity;
      }
    }
  });
  const deposit = FIXED_DEPOSIT_AMOUNT(env);
  return {
    totalItemCost,
    totalAmount: totalItemCost + deposit,
  };
};

// --- API Routes ---

// Auth
router.post('/api/auth/login', async (request: IRequest, env: Env) => {
  const { id, password } = await request.json() as any;
  if (id === env.ADMIN_ID && password === env.ADMIN_PASSWORD) {
    const jwtPayload = { id: env.ADMIN_ID, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) }; // Expires in 24 hours
    const token = await generateJwt(jwtPayload, env.JWT_SECRET);
    return new Response(JSON.stringify({ token }), { headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
});

// Items - Admin Only
router.get('/api/items', authMiddleware, async (request: IRequest, env: Env) => {
  const dbResult = await env.DB.prepare("SELECT * FROM Items ORDER BY name ASC").all();
  const results = (dbResult?.results || []) as Item[];
  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
});

router.post('/api/items', authMiddleware, async (request: IRequest, env: Env) => {
  const itemData = await request.json() as Omit<Item, 'id' | 'currentStock'>;
  if (!itemData.name || itemData.initialStock == null || itemData.initialStock < 0 || itemData.price == null || itemData.price < 0 || !itemData.unit) {
    return new Response(JSON.stringify({ error: 'Missing required fields or invalid values for item.' }), { status: 400 });
  }
  const newItem: Item = {
    ...itemData,
    id: generateId('item'),
    currentStock: itemData.initialStock,
    imageUrl: itemData.imageUrl || `https://picsum.photos/seed/${Date.now()}/200`,
  };
  await env.DB.prepare(
    "INSERT INTO Items (id, name, initialStock, currentStock, price, description, imageUrl, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(newItem.id, newItem.name, newItem.initialStock, newItem.currentStock, newItem.price, newItem.description || '', newItem.imageUrl, newItem.unit).run();
  return new Response(JSON.stringify(newItem), { status: 201, headers: { 'Content-Type': 'application/json' } });
});

router.get('/api/items/:id', authMiddleware, async (request: IRequest, env: Env) => {
  const { id } = request.params;
  const item = await env.DB.prepare("SELECT * FROM Items WHERE id = ?").bind(id).first() as Item | null;
  if (!item) return new Response(JSON.stringify({ error: 'Item not found' }), { status: 404 });
  return new Response(JSON.stringify(item), { headers: { 'Content-Type': 'application/json' } });
});

router.put('/api/items/:id', authMiddleware, async (request: IRequest, env: Env) => {
  const { id } = request.params;
  const updatedItemData = await request.json() as Item;

  if (updatedItemData.currentStock > updatedItemData.initialStock) {
    return new Response(JSON.stringify({ error: 'Current stock cannot exceed initial stock.' }), { status: 400 });
  }
  if (updatedItemData.currentStock < 0 || updatedItemData.initialStock < 0 || updatedItemData.price < 0) {
     return new Response(JSON.stringify({ error: 'Stock and price cannot be negative.' }), { status: 400 });
  }

  const result = await env.DB.prepare(
    "UPDATE Items SET name = ?, initialStock = ?, currentStock = ?, price = ?, description = ?, imageUrl = ?, unit = ? WHERE id = ?"
  ).bind(updatedItemData.name, updatedItemData.initialStock, updatedItemData.currentStock, updatedItemData.price, updatedItemData.description, updatedItemData.imageUrl, updatedItemData.unit, id).run();
  
  if (result.changes === 0) {
    return new Response(JSON.stringify({ error: 'Item not found or no changes made' }), { status: 404 });
  }
  return new Response(JSON.stringify(updatedItemData), { headers: { 'Content-Type': 'application/json' } });
});

router.delete('/api/items/:id', authMiddleware, async (request: IRequest, env: Env) => {
  const { id } = request.params;
  // Check for active rentals
  const activeRentalCheck = await env.DB.prepare(
    "SELECT 1 FROM RentalApplicationItems rai JOIN RentalApplications ra ON rai.rentalApplicationId = ra.id WHERE rai.itemId = ? AND (ra.status = ? OR ra.status = ?) LIMIT 1"
  ).bind(id, RentalStatus.PENDING, RentalStatus.RENTED).first();

  if (activeRentalCheck) {
    return new Response(JSON.stringify({ error: 'Cannot delete item with active (Pending or Rented) rental applications.' }), { status: 400 });
  }

  const result = await env.DB.prepare("DELETE FROM Items WHERE id = ?").bind(id).run();
  if (result.changes === 0) {
    return new Response(JSON.stringify({ error: 'Item not found' }), { status: 404 });
  }
  return new Response(null, { status: 204 });
});


// Rental Applications - Public / User
router.post('/api/rentals/apply', async (request: IRequest, env: Env) => {
  const appData = await request.json() as Omit<RentalApplication, 'id' | 'applicationDate' | 'status' | 'totalItemCost' | 'totalAmount' | 'deposit'>;

  // Fetch all items for cost calculation and stock check
  const dbResult = await env.DB.prepare("SELECT * FROM Items").all();
  const allDbItems = (dbResult?.results || []) as Item[];
  if (allDbItems.length === 0 && appData.items.length > 0) { // check if items were expected but not found
      // This check is a bit simplistic, assumes if appData.items has content, allDbItems should too
      console.error("Failed to fetch items from DB or DB is empty, but application has items.");
      // return new Response(JSON.stringify({ error: 'Could not fetch item data for validation.' }), { status: 500 });
  }


  // Validate stock & prepare stock adjustments
  const stockAdjustments: D1PreparedStatement[] = [];
  for (const selectedItem of appData.items) {
    const itemDetail = allDbItems.find(i => i.id === selectedItem.itemId);
    if (!itemDetail || Number(itemDetail.currentStock) < Number(selectedItem.quantity)) {
      return new Response(JSON.stringify({ error: `Insufficient stock for ${itemDetail?.name || 'unknown item'}. Requested: ${selectedItem.quantity}, Available: ${itemDetail?.currentStock || 0}.` }), { status: 400 });
    }
    stockAdjustments.push(
      env.DB.prepare("UPDATE Items SET currentStock = currentStock - ? WHERE id = ? AND currentStock >= ?")
            .bind(selectedItem.quantity, selectedItem.itemId, selectedItem.quantity)
    );
  }

  const costs = calculateRentalCosts(appData.items, allDbItems, env);
  const newApplication: RentalApplication = {
    ...appData,
    id: generateId('rental'),
    applicationDate: new Date().toISOString().split('T')[0],
    status: RentalStatus.PENDING,
    totalItemCost: costs.totalItemCost,
    deposit: FIXED_DEPOSIT_AMOUNT(env),
    totalAmount: Number(costs.totalItemCost) + FIXED_DEPOSIT_AMOUNT(env),
  };

  const rentalApplicationItemsInserts: D1PreparedStatement[] = newApplication.items.map(item =>
    env.DB.prepare("INSERT INTO RentalApplicationItems (rentalApplicationId, itemId, quantity) VALUES (?, ?, ?)")
          .bind(newApplication.id, item.itemId, item.quantity)
  );

  const mainApplicationInsert = env.DB.prepare(
    "INSERT INTO RentalApplications (id, applicantName, phoneNumber, studentId, accountHolderName, accountNumber, rentalDate, returnDate, totalItemCost, deposit, totalAmount, status, applicationDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    newApplication.id, newApplication.applicantName, newApplication.phoneNumber, newApplication.studentId, newApplication.accountHolderName, newApplication.accountNumber,
    newApplication.rentalDate, newApplication.returnDate, newApplication.totalItemCost, newApplication.deposit, newApplication.totalAmount, newApplication.status, newApplication.applicationDate
  );

  try {
    // Batch operations: Add application, then items, then adjust stock
    const batchOps = [mainApplicationInsert, ...rentalApplicationItemsInserts, ...stockAdjustments];
    await env.DB.batch(batchOps);
    return new Response(JSON.stringify(newApplication), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error("Error adding rental application:", e.message, e.cause);
    // Attempt to determine if it was a stock issue (e.cause might contain SQLITE_CONSTRAINT if check failed)
    // This is a simplified rollback; D1 doesn't have true transactions across separate .run() calls.
    // The batch operation helps, but if one part of batch fails, D1 might leave partial data.
    // Robust error handling would involve more complex state management or compensating transactions.
    if (e.message?.includes("constraint") || e.cause?.message?.includes("CONSTRAINT")) {
         return new Response(JSON.stringify({ error: 'Stock became unavailable during transaction. Please try again.' }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: 'Failed to submit application.', details: e.message }), { status: 500 });
  }
});

router.post('/api/rentals/find', async (request: IRequest, env: Env) => {
  const { name, studentId, phoneNumber } = await request.json() as any;
  if (!name || !studentId || !phoneNumber) {
    return new Response(JSON.stringify({ error: 'Name, studentId, and phoneNumber are required.' }), { status: 400 });
  }

  const appDbResult = await env.DB.prepare(
    "SELECT * FROM RentalApplications WHERE applicantName = ? AND studentId = ? AND phoneNumber = ? ORDER BY applicationDate DESC"
  ).bind(name, studentId, phoneNumber).all();
  const applications = (appDbResult?.results || []) as Omit<RentalApplication, 'items'>[];


  if (applications.length === 0) {
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  }
  
  const applicationsWithItems: RentalApplication[] = [];
  for (const app of applications) {
    const itemsDbResult = await env.DB.prepare(
      "SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?"
    ).bind(app.id).all();
    const items = (itemsDbResult?.results || []) as SelectedItemEntry[];
    applicationsWithItems.push({ ...app, items: items, depositRefunded: !!(app as any).depositRefunded });
  }

  return new Response(JSON.stringify(applicationsWithItems), { headers: { 'Content-Type': 'application/json' } });
});


// Helper to manage stock and application item updates during complex rental updates
async function manageRentalUpdate(
  env: Env,
  originalApp: RentalApplication,
  updatedAppCore: Omit<RentalApplication, 'items' | 'totalItemCost' | 'totalAmount' | 'deposit'>, // Core fields of the updated app
  newItems: SelectedItemEntry[] // The new list of items for the application
): Promise<{ finalApp: RentalApplication, dbOperations: D1PreparedStatement[] }> {
  
  const dbOperations: D1PreparedStatement[] = [];
  const allItemsDbResult = await env.DB.prepare("SELECT * FROM Items").all();
  const allDbItems = (allItemsDbResult?.results || []) as Item[];
  if (allDbItems.length === 0 && newItems.length > 0) {
       // Similar to above, log if items are expected but not found
       console.error("Could not fetch item data for update, or DB is empty.");
       // throw new Error("Could not fetch item data for update."); // Or handle more gracefully
  }


  const currentItemStockMap = new Map(allDbItems.map(item => [item.id, Number(item.currentStock)]));

  // 1. Calculate stock adjustments
  const oldStatusIsReserved = originalApp.status === RentalStatus.PENDING || originalApp.status === RentalStatus.RENTED;
  const newStatusIsReserved = updatedAppCore.status === RentalStatus.PENDING || updatedAppCore.status === RentalStatus.RENTED;

  const allInvolvedItemIds = new Set([...originalApp.items.map(i => i.itemId), ...newItems.map(i => i.itemId)]);

  for (const itemId of allInvolvedItemIds) {
    const oldEntry = originalApp.items.find(i => i.itemId === itemId);
    const newEntry = newItems.find(i => i.itemId === itemId);
    const oldQty = oldEntry ? Number(oldEntry.quantity) : 0;
    const newQty = newEntry ? Number(newEntry.quantity) : 0;
    const itemDetails = allDbItems.find(i => i.id === itemId);
    if (!itemDetails) throw new Error(`Item details for ${itemId} not found during update.`);

    let stockChange = 0; // positive to increase stock, negative to decrease

    if (oldStatusIsReserved && !newStatusIsReserved) { // Moving out of reserved: restore original quantity
      if (oldQty > 0) stockChange = oldQty;
    } else if (!oldStatusIsReserved && newStatusIsReserved) { // Moving into reserved: decrease new quantity
      if (newQty > 0) stockChange = -newQty;
    } else if (oldStatusIsReserved && newStatusIsReserved) { // Staying in reserved: adjust by delta
      stockChange = oldQty - newQty; // If newQty > oldQty, stockChange is negative (decrease stock)
    }
    
    if (stockChange !== 0) {
      const currentItemStock = currentItemStockMap.get(itemId) ?? 0;
      const futureStock = currentItemStock + stockChange;
      if (futureStock < 0) {
        throw new Error(`Insufficient stock for ${itemDetails.name} to complete update. Required change: ${-stockChange}, Effective available: ${currentItemStock + oldQty}`);
      }
      const initialItemStock = Number(itemDetails.initialStock);
      if (futureStock > initialItemStock) {
         // This can happen if restoring stock. Cap at initialStock.
         const cappedStockChange = initialItemStock - currentItemStock;
         stockChange = cappedStockChange;
      }
      if (stockChange !== 0) { // re-check because it might have been capped to 0
        dbOperations.push(
          env.DB.prepare("UPDATE Items SET currentStock = currentStock + ? WHERE id = ?")
                .bind(stockChange, itemId)
        );
        currentItemStockMap.set(itemId, currentItemStock + stockChange); // Update map for subsequent checks
      }
    }
  }

  // 2. Update RentalApplicationItems: Delete old, insert new
  dbOperations.push(env.DB.prepare("DELETE FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(originalApp.id));
  newItems.forEach(item => {
    dbOperations.push(
      env.DB.prepare("INSERT INTO RentalApplicationItems (rentalApplicationId, itemId, quantity) VALUES (?, ?, ?)")
            .bind(originalApp.id, item.itemId, item.quantity)
    );
  });
  
  // 3. Recalculate costs for the application
  const costs = calculateRentalCosts(newItems, allDbItems, env);
  const finalApp: RentalApplication = {
    ...updatedAppCore,
    id: originalApp.id, // Ensure ID is from original app
    items: newItems,
    totalItemCost: costs.totalItemCost,
    deposit: FIXED_DEPOSIT_AMOUNT(env),
    totalAmount: Number(costs.totalItemCost) + FIXED_DEPOSIT_AMOUNT(env), // Ensure totalAmount is number
    depositRefunded: !!updatedAppCore.depositRefunded, // Ensure boolean
  };

  // 4. Prepare main application update
   dbOperations.push(env.DB.prepare(
    "UPDATE RentalApplications SET applicantName=?, phoneNumber=?, studentId=?, accountHolderName=?, accountNumber=?, rentalDate=?, returnDate=?, totalItemCost=?, deposit=?, totalAmount=?, status=?, applicationDate=?, rentalStaff=?, returnStaff=?, actualReturnDate=?, depositRefunded=? WHERE id = ?"
  ).bind(
    finalApp.applicantName, finalApp.phoneNumber, finalApp.studentId, finalApp.accountHolderName, finalApp.accountNumber,
    finalApp.rentalDate, finalApp.returnDate, finalApp.totalItemCost, finalApp.deposit, finalApp.totalAmount,
    finalApp.status, finalApp.applicationDate, finalApp.rentalStaff, finalApp.returnStaff, finalApp.actualReturnDate,
    finalApp.depositRefunded ? 1 : 0,
    finalApp.id
  ));

  return { finalApp, dbOperations };
}


// User updates their PENDING application
router.put('/api/rentals/:id', async (request: IRequest, env: Env) => {
  const { id } = request.params;
  const { items: newItemsData, rentalDate, returnDate } = await request.json() as { items: SelectedItemEntry[], rentalDate: string, returnDate: string };

  if (!newItemsData || newItemsData.length === 0 || !rentalDate || !returnDate || rentalDate > returnDate) {
    return new Response(JSON.stringify({ error: 'Invalid data: Items list cannot be empty, and dates must be valid.' }), { status: 400 });
  }

  const originalAppFromDb = await env.DB.prepare("SELECT * FROM RentalApplications WHERE id = ?").bind(id).first() as Omit<RentalApplication, 'items'> | null;
  if (!originalAppFromDb) return new Response(JSON.stringify({ error: 'Application not found' }), { status: 404 });
  if (originalAppFromDb.status !== RentalStatus.PENDING) {
    return new Response(JSON.stringify({ error: 'Only PENDING applications can be modified by user.' }), { status: 403 });
  }
  
  const originalItemsDbResult = await env.DB.prepare("SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(id).all();
  const originalItemsFromDb = (originalItemsDbResult?.results || []) as SelectedItemEntry[];
  const fullOriginalApp: RentalApplication = {...originalAppFromDb, items: originalItemsFromDb, depositRefunded: !!(originalAppFromDb as any).depositRefunded };


  // Prepare updated core fields, only dates are changing from user side for now. Other fields remain same.
  const updatedAppCore = { ...fullOriginalApp, rentalDate, returnDate };


  try {
    const { finalApp, dbOperations } = await manageRentalUpdate(env, fullOriginalApp, updatedAppCore, newItemsData);
    await env.DB.batch(dbOperations);
    return new Response(JSON.stringify(finalApp), { headers: { 'Content-Type': 'application/json' }});
  } catch (e: any) {
    console.error("Error updating user rental application:", e);
    return new Response(JSON.stringify({ error: e.message || 'Failed to update application.' }), { status: e.message?.includes("Insufficient stock") ? 409 : 500 });
  }
});


router.post('/api/rentals/:id/cancel', async (request: IRequest, env: Env) => {
  const { id } = request.params;
  
  const appToCancel = await env.DB.prepare("SELECT * FROM RentalApplications WHERE id = ?").bind(id).first() as Omit<RentalApplication, 'items'> | null;
  if (!appToCancel) return new Response(JSON.stringify({ error: 'Application not found' }), { status: 404 });

  if (appToCancel.status !== RentalStatus.PENDING) {
    return new Response(JSON.stringify({ error: 'Only PENDING applications can be cancelled by user.' }), { status: 403 });
  }

  const itemsToRestoreDbResult = await env.DB.prepare("SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(id).all();
  const itemsToRestore = (itemsToRestoreDbResult?.results || []) as SelectedItemEntry[];
  
  const dbOperations: D1PreparedStatement[] = [];
  if (itemsToRestore) {
    itemsToRestore.forEach(item => {
      dbOperations.push(
        env.DB.prepare("UPDATE Items SET currentStock = currentStock + ? WHERE id = ?")
              .bind(item.quantity, item.itemId)
      );
    });
  }
  dbOperations.push(env.DB.prepare("DELETE FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(id));
  dbOperations.push(env.DB.prepare("DELETE FROM RentalApplications WHERE id = ?").bind(id));

  try {
    await env.DB.batch(dbOperations);
    return new Response(JSON.stringify({ message: 'Application cancelled successfully.' }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error("Error cancelling application:", e);
    return new Response(JSON.stringify({ error: 'Failed to cancel application.', details: e.message }), { status: 500 });
  }
});


// Admin Rentals
router.get('/api/admin/rentals', authMiddleware, async (request: IRequest, env: Env) => {
  const appDbResult = await env.DB.prepare(
    "SELECT * FROM RentalApplications ORDER BY applicationDate DESC"
  ).all();
  const applications = (appDbResult?.results || []) as Omit<RentalApplication, 'items'>[];

  if (applications.length === 0) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  
  const applicationsWithItems: RentalApplication[] = [];
  for (const app of applications) {
    const itemsDbResult = await env.DB.prepare(
      "SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?"
    ).bind(app.id).all();
    const items = (itemsDbResult?.results || []) as SelectedItemEntry[];
    applicationsWithItems.push({ ...app, items: items, depositRefunded: !!(app as any).depositRefunded });
  }
  return new Response(JSON.stringify(applicationsWithItems), { headers: { 'Content-Type': 'application/json' } });
});

router.get('/api/admin/rentals/:id', authMiddleware, async (request: IRequest, env: Env) => {
  const { id } = request.params;
  const app = await env.DB.prepare("SELECT * FROM RentalApplications WHERE id = ?").bind(id).first() as Omit<RentalApplication, 'items'> | null;
  if (!app) return new Response(JSON.stringify({ error: 'Rental application not found' }), { status: 404 });
  
  const itemsDbResult = await env.DB.prepare("SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(id).all();
  const items = (itemsDbResult?.results || []) as SelectedItemEntry[];
  const fullApp = { ...app, items: items, depositRefunded: !!(app as any).depositRefunded };
  return new Response(JSON.stringify(fullApp), { headers: { 'Content-Type': 'application/json' } });
});

router.put('/api/admin/rentals/:id', authMiddleware, async (request: IRequest, env: Env) => {
  const { id } = request.params;
  const adminUpdatedData = await request.json() as Partial<RentalApplication> & { items?: SelectedItemEntry[] }; // Admin can update various fields

  const originalAppFromDb = await env.DB.prepare("SELECT * FROM RentalApplications WHERE id = ?").bind(id).first() as Omit<RentalApplication, 'items'> | null;
  if (!originalAppFromDb) return new Response(JSON.stringify({ error: 'Application not found' }), { status: 404 });

  const originalItemsDbResult = await env.DB.prepare("SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(id).all();
  const originalItemsFromDb = (originalItemsDbResult?.results || []) as SelectedItemEntry[];
  const fullOriginalApp: RentalApplication = {...originalAppFromDb, items: originalItemsFromDb, depositRefunded: !!(originalAppFromDb as any).depositRefunded };

  // If admin sends new items list, use it. Otherwise, keep original items.
  const newItemsToUse = adminUpdatedData.items || fullOriginalApp.items;

  // Merge admin changes with original app data
  const updatedAppCore: Omit<RentalApplication, 'items' | 'totalItemCost' | 'totalAmount' | 'deposit'> = {
    ...fullOriginalApp, // Start with full original data
    ...adminUpdatedData, // Overlay admin's changes (status, staff, dates etc.)
    id: fullOriginalApp.id, // Ensure ID is not changed
    // `items` will be handled by manageRentalUpdate
  };
  
  // Validation for admin updates
  if (updatedAppCore.status === RentalStatus.RETURNED && !updatedAppCore.actualReturnDate) {
    return new Response(JSON.stringify({ error: 'Actual return date is required for RETURNED status.' }), { status: 400 });
  }

  try {
    const { finalApp, dbOperations } = await manageRentalUpdate(env, fullOriginalApp, updatedAppCore, newItemsToUse);
    await env.DB.batch(dbOperations);
    return new Response(JSON.stringify(finalApp), { headers: { 'Content-Type': 'application/json' }});
  } catch (e: any) {
    console.error("Error updating admin rental application:", e);
    return new Response(JSON.stringify({ error: e.message || 'Failed to update application.' }), { status: e.message?.includes("Insufficient stock") ? 409 : 500 });
  }
});


// Admin Dashboard Stats
router.get('/api/admin/dashboard/stats', authMiddleware, async (request: IRequest, env: Env) => {
  const today = new Date().toISOString().split('T')[0];

  const newRequestsQuery = env.DB.prepare("SELECT COUNT(*) as count FROM RentalApplications WHERE status = ?").bind(RentalStatus.PENDING);
  const dueTodayQuery = env.DB.prepare("SELECT COUNT(*) as count FROM RentalApplications WHERE status = ? AND returnDate = ?").bind(RentalStatus.RENTED, today);
  const currentlyRentedQuery = env.DB.prepare("SELECT COUNT(*) as count FROM RentalApplications WHERE status = ?").bind(RentalStatus.RENTED);
  const lowStockItemsQuery = env.DB.prepare("SELECT COUNT(*) as count FROM Items WHERE currentStock < 5 AND initialStock > 0");

  // D1 batch returns an array of D1Result objects.
  const batchResults = await env.DB.batch([
    newRequestsQuery, dueTodayQuery, currentlyRentedQuery, lowStockItemsQuery
  ]);
  
  const stats = {
    newRequests: (batchResults[0]?.results?.[0] as { count: number } | undefined)?.count || 0,
    dueToday: (batchResults[1]?.results?.[0] as { count: number } | undefined)?.count || 0,
    currentlyRented: (batchResults[2]?.results?.[0] as { count: number } | undefined)?.count || 0,
    lowStockItems: (batchResults[3]?.results?.[0] as { count: number } | undefined)?.count || 0,
  };
  return new Response(JSON.stringify(stats), { headers: { 'Content-Type': 'application/json' } });
});

// 404 Route
router.all('*', () => new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 }));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Handle OPTIONS requests for CORS preflight
    if (request.method === 'OPTIONS') {
      return addCorsHeaders(new Response(null, { status: 204 }));
    }
    try {
      const response = await router.handle(request, env, ctx);
      return addCorsHeaders(response);
    } catch (e: any) {
      console.error("Global error handler:", e);
      const errorResponse = new Response(JSON.stringify({ error: 'Internal Server Error', details: e.message }), { status: 500 });
      return addCorsHeaders(errorResponse);
    }
  },
};

// Helper to get item name by ID, if needed by any logic (though mostly frontend concern)
// async function getItemName(itemId: string, env: Env): Promise<string> {
//   const item = await env.DB.prepare("SELECT name FROM Items WHERE id = ?").bind(itemId).first<{name: string}>();
//   return item ? item.name : '알 수 없는 물품';
// }
