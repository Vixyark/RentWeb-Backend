import { Router, type IRequest as IttyRouterRequest } from 'itty-router';

// --- Placeholder Cloudflare Types ---
type D1Database = any; 
type ExecutionContext = any;
type D1PreparedStatement = any; 
interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: any;
  error?: string;
}

// Custom AppRequest extending itty-router's IRequest
interface AppRequest extends IttyRouterRequest {
  admin?: {
    id: string;
    iat?: number; 
    exp?: number;
  };
}


// --- Types ---
interface Item {
  id: string;
  name: string;
  initialStock: number;
  currentStock: number;
  price: number; // Price per rental period
  description: string;
  imageUrl: string;
  unit: string; // e.g., 개, 세트
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
  JWT_SECRET: string; 
  FIXED_DEPOSIT_AMOUNT: string; 
}

// --- Constants ---
const FIXED_DEPOSIT_AMOUNT_FN = (env: Env) => parseInt(env.FIXED_DEPOSIT_AMOUNT || "10000", 10);

// --- JWT Utilities ---
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

const generateJwt = async (payload: object, secret: string): Promise<string> => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));

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

  const encodedSignature = arrayBufferToBase64Url(signature);
  // console.log("[generateJwt] Generated real token.");
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
};

const verifyJwt = async (token: string, secret: string): Promise<any | null> => {
  // console.log(`[verifyJwt] Verifying token: ${token ? token.substring(0, 20) + "..." : "null"}`);
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
        console.log("[verifyJwt] Token structure invalid (not 3 parts).");
        return null;
    }

    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const signatureToVerify = base64UrlToUint8Array(encodedSignature);
    const dataToVerify = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
    const isValid = await crypto.subtle.verify( 'HMAC', key, signatureToVerify, dataToVerify );

    if (!isValid) {
        console.log("[verifyJwt] Signature verification failed.");
        return null;
    }
    
    const payloadString = new TextDecoder().decode(base64UrlToUint8Array(encodedPayload));
    const payload = JSON.parse(payloadString);

    if (payload.exp && Date.now() >= payload.exp * 1000) {
        console.log("[verifyJwt] Token expired.");
        return null;
    }
    // console.log("[verifyJwt] Token verified successfully. Payload:", payload);
    return payload;
  } catch (error: any) {
    console.error('[verifyJwt] JWT verification error:', error.message, error.stack);
    return null;
  }
};

// --- Router Setup ---
const router = Router();

// --- Middleware ---
const addCorsHeaders = (response: Response): Response => {
  const res = response || new Response(null); 
  const headers = res.headers;
  headers.set('Access-Control-Allow-Origin', '*'); 
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return res;
};

const authMiddleware = async (request: AppRequest, env: Env, context: ExecutionContext) => {
  console.log(`[authMiddleware IttyRouter] Entered for path: ${new URL(request.url).pathname}, Method: ${request.method}`);
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log("[authMiddleware IttyRouter] Auth failed: Missing or invalid token format");
    return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid token format' }), { status: 401 });
  }
  const token = authHeader.substring(7);
  
  if (!env.JWT_SECRET || !env.ADMIN_ID) {
      console.error("[authMiddleware IttyRouter] CRITICAL: JWT_SECRET or ADMIN_ID is not configured.");
      return new Response(JSON.stringify({ error: 'Server configuration error (secrets).' }), { status: 500 });
  }

  const payload = await verifyJwt(token, env.JWT_SECRET);
  // console.log("[authMiddleware IttyRouter] Payload from verifyJwt:", payload);
  
  if (payload && payload.id === env.ADMIN_ID) {
      // console.log("[authMiddleware IttyRouter] Auth successful. Setting request.admin.");
      request.admin = payload; 
  } else {
      console.log("[authMiddleware IttyRouter] Auth failed: Invalid token or payload mismatch.");
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), { status: 401 });
  }
};

// --- Helper Functions ---
const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const calculateRentalCosts = (selectedItems: SelectedItemEntry[], allDbItems: Item[], env: Env): { totalItemCost: number, totalAmount: number } => {
  let totalItemCostCalc = 0;
  selectedItems.forEach(selected => {
    const itemDetails = allDbItems.find(i => i.id === selected.itemId);
    if (itemDetails) {
      const price = Number(itemDetails.price);
      const quantity = Number(selected.quantity);
      if (!isNaN(price) && !isNaN(quantity)) {
        totalItemCostCalc += price * quantity;
      }
    }
  });
  const deposit = FIXED_DEPOSIT_AMOUNT_FN(env);
  return {
    totalItemCost: totalItemCostCalc,
    totalAmount: totalItemCostCalc + deposit,
  };
};

// --- Direct Auth Check for Direct Handlers ---
const directAuthCheck = async (request: Request, env: Env): Promise<any | Response> => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log("[Direct Auth Check] Auth failed: Missing or invalid token format");
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid token format' }), { status: 401 }));
    }
    const token = authHeader.substring(7);
    if (!env.JWT_SECRET || !env.ADMIN_ID) {
        console.error("[Direct Auth Check] CRITICAL: JWT_SECRET or ADMIN_ID is not configured.");
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Server configuration error (secrets).' }), { status: 500 }));
    }
    const payload = await verifyJwt(token, env.JWT_SECRET); 
    if (!(payload && payload.id === env.ADMIN_ID)) {
        console.log("[Direct Auth Check] Auth failed: Invalid token or payload mismatch. Payload:", payload);
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), { status: 401 }));
    }
    // console.log("[Direct Auth Check] Auth successful. Admin payload:", payload);
    return payload; 
};


// --- API Routes (via itty-router) ---

router.get('/api/items/:id', authMiddleware, async (request: AppRequest, env: Env) => {
  console.log("[GET /api/items/:id IttyRouter Handler] Entered.");
  const { id } = request.params!;
  const item = await env.DB.prepare("SELECT * FROM Items WHERE id = ?").bind(id).first() as Item | null;
  if (!item) return new Response(JSON.stringify({ error: 'Item not found' }), { status: 404 });
  return new Response(JSON.stringify(item), { headers: { 'Content-Type': 'application/json' } });
});


async function manageRentalUpdate(
  env: Env,
  originalApp: RentalApplication,
  updatedAppCore: Omit<RentalApplication, 'items' | 'totalItemCost' | 'totalAmount' | 'deposit'>, 
  newItems: SelectedItemEntry[] // These are the items that should *finally* be in the application
): Promise<{ finalApp: RentalApplication, dbOperations: D1PreparedStatement[] }> {
  console.log(`[manageRentalUpdate V3] Started for app ID: ${originalApp.id}. Original status: ${originalApp.status}, New status: ${updatedAppCore.status}`);
  console.log(`[manageRentalUpdate V3] Original items:`, originalApp.items);
  console.log(`[manageRentalUpdate V3] New items to use:`, newItems);

  const dbOperations: D1PreparedStatement[] = [];
  const allItemsDbResult = await env.DB.prepare("SELECT * FROM Items").all();
  const allDbItems = (allItemsDbResult?.results || []) as Item[];
  if (allDbItems.length === 0 && newItems.length > 0) {
       console.error("[manageRentalUpdate V3] Could not fetch item data for update, or DB is empty.");
  }

  const currentItemStockMap = new Map(allDbItems.map(item => [item.id, Number(item.currentStock)]));
  const oldStatusIsReserved = originalApp.status === RentalStatus.PENDING || originalApp.status === RentalStatus.RENTED;
  const newStatusIsReserved = updatedAppCore.status === RentalStatus.PENDING || updatedAppCore.status === RentalStatus.RENTED;
  
  const allInvolvedItemIds = new Set([...originalApp.items.map(i => i.itemId), ...newItems.map(i => i.itemId)]);
  console.log(`[manageRentalUpdate V3] All involved item IDs:`, Array.from(allInvolvedItemIds));

  for (const itemId of allInvolvedItemIds) {
    const oldEntry = originalApp.items.find(i => i.itemId === itemId);
    const newEntry = newItems.find(i => i.itemId === itemId);
    const oldQty = oldEntry ? Number(oldEntry.quantity) : 0;
    const newQty = newEntry ? Number(newEntry.quantity) : 0;
    const itemDetails = allDbItems.find(i => i.id === itemId);

    if (!itemDetails) {
        console.error(`[manageRentalUpdate V3] Item details for ${itemId} not found. Skipping stock adjustment for this item.`);
        continue; 
    }

    let stockChange = 0; 
    console.log(`[manageRentalUpdate V3] Processing item ${itemId} (${itemDetails.name}): Old Qty=${oldQty}, New Qty=${newQty}. Old Reserved=${oldStatusIsReserved}, New Reserved=${newStatusIsReserved}`);

    if (oldStatusIsReserved && !newStatusIsReserved) { 
      if (oldQty > 0) stockChange = oldQty; 
      console.log(`[manageRentalUpdate V3] Item ${itemId}: Old reserved, new not. Stock change: +${stockChange}`);
    } else if (!oldStatusIsReserved && newStatusIsReserved) { 
      if (newQty > 0) stockChange = -newQty; 
      console.log(`[manageRentalUpdate V3] Item ${itemId}: Old not reserved, new is. Stock change: ${stockChange}`);
    } else if (oldStatusIsReserved && newStatusIsReserved) { 
      stockChange = oldQty - newQty; 
      console.log(`[manageRentalUpdate V3] Item ${itemId}: Both old and new reserved. Stock change: ${stockChange} (oldQty ${oldQty} - newQty ${newQty})`);
    } else { 
      console.log(`[manageRentalUpdate V3] Item ${itemId}: Neither old nor new status reserves stock. No stock change.`);
    }
    
    if (stockChange !== 0) {
      const currentItemStock = currentItemStockMap.get(itemId) ?? 0;
      const futureStock = currentItemStock + stockChange;
      if (futureStock < 0) {
        throw new Error(`[manageRentalUpdate V3] Insufficient stock for ${itemDetails.name} to complete update. Required change: ${-stockChange}, Effective available: ${currentItemStock + (stockChange < 0 ? 0 : oldQty)}`);
      }
      const initialItemStock = Number(itemDetails.initialStock);
      if (futureStock > initialItemStock && stockChange > 0) { 
         console.warn(`[manageRentalUpdate V3] Stock for ${itemDetails.name} would exceed initial stock (${futureStock} > ${initialItemStock}). Capping at initial stock.`);
         stockChange = initialItemStock - currentItemStock; 
      }
      if (stockChange !== 0) { 
        console.log(`[manageRentalUpdate V3] Adding stock update for ${itemId}: currentStock ${currentItemStock} + (${stockChange}) = ${currentItemStock + stockChange}`);
        dbOperations.push(
          env.DB.prepare("UPDATE Items SET currentStock = currentStock + ? WHERE id = ?")
                .bind(stockChange, itemId)
        );
        currentItemStockMap.set(itemId, currentItemStock + stockChange); 
      }
    }
  }

  console.log(`[manageRentalUpdate V3] Deleting old items for app ID: ${originalApp.id}`);
  dbOperations.push(env.DB.prepare("DELETE FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(originalApp.id));
  
  console.log(`[manageRentalUpdate V3] Inserting new items for app ID: ${originalApp.id}:`, newItems);
  newItems.forEach(item => {
    dbOperations.push(
      env.DB.prepare("INSERT INTO RentalApplicationItems (rentalApplicationId, itemId, quantity) VALUES (?, ?, ?)")
            .bind(originalApp.id, item.itemId, item.quantity)
    );
  });
  
  const costs = calculateRentalCosts(newItems, allDbItems, env);
  const finalApp: RentalApplication = {
    ...updatedAppCore,
    id: originalApp.id, 
    items: newItems, 
    totalItemCost: costs.totalItemCost,
    deposit: FIXED_DEPOSIT_AMOUNT_FN(env),
    totalAmount: Number(costs.totalItemCost) + FIXED_DEPOSIT_AMOUNT_FN(env), 
    depositRefunded: !!updatedAppCore.depositRefunded, 
  };
  console.log(`[manageRentalUpdate V3] Final application data before DB update:`, finalApp);

   dbOperations.push(env.DB.prepare(
    "UPDATE RentalApplications SET applicantName=?, phoneNumber=?, studentId=?, accountHolderName=?, accountNumber=?, rentalDate=?, returnDate=?, totalItemCost=?, deposit=?, totalAmount=?, status=?, applicationDate=?, rentalStaff=?, returnStaff=?, actualReturnDate=?, depositRefunded=? WHERE id = ?"
  ).bind(
    finalApp.applicantName, finalApp.phoneNumber, finalApp.studentId, finalApp.accountHolderName, finalApp.accountNumber,
    finalApp.rentalDate, finalApp.returnDate, finalApp.totalItemCost, finalApp.deposit, finalApp.totalAmount,
    finalApp.status, finalApp.applicationDate, finalApp.rentalStaff, finalApp.returnStaff, finalApp.actualReturnDate,
    finalApp.depositRefunded ? 1 : 0,
    finalApp.id
  ));
  console.log(`[manageRentalUpdate V3] Total DB operations prepared: ${dbOperations.length}`);
  return { finalApp, dbOperations };
}


router.get('/api/admin/rentals/:id', authMiddleware, async (request: AppRequest, env: Env) => {
  console.log("[GET /api/admin/rentals/:id IttyRouter Handler] Entered.");
  const { id } = request.params!;
  const app = await env.DB.prepare("SELECT * FROM RentalApplications WHERE id = ?").bind(id).first() as Omit<RentalApplication, 'items'> | null;
  if (!app) return new Response(JSON.stringify({ error: 'Rental application not found' }), { status: 404 });
  
  const itemsDbResult = await env.DB.prepare("SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(id).all();
  const items = (itemsDbResult?.results || []) as SelectedItemEntry[];
  const fullApp = { ...app, items: items, depositRefunded: !!(app as any).depositRefunded };
  return new Response(JSON.stringify(fullApp), { headers: { 'Content-Type': 'application/json' } });
});


// 404 Route for itty-router
router.all('*', () => new Response(JSON.stringify({ error: 'Not Found (itty-router)' }), { status: 404 }));

// --- Main Fetch Handler ---
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    console.log(`[Main Fetch] Request received: ${request.method} ${url.pathname}`);

    if (request.method === 'OPTIONS') {
      console.log(`[Main Fetch] Handling OPTIONS request for ${url.pathname}`);
      return addCorsHeaders(new Response(null, { status: 204 }));
    }

    // Direct handler for /api/auth/login
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      console.log("[Direct Login Handler] Processing /api/auth/login");
      if (!env.ADMIN_ID || !env.ADMIN_PASSWORD || !env.JWT_SECRET) {
        console.error("[Direct Login Handler] CRITICAL: Missing secrets (ADMIN_ID, ADMIN_PASSWORD, or JWT_SECRET).");
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Server configuration error.' }), { status: 500 }));
      }
      try {
        const body = await request.json();
        const { id, password } = body as any;
        if (id === env.ADMIN_ID && password === env.ADMIN_PASSWORD) {
          const jwtPayload = { 
            id: env.ADMIN_ID, 
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // 7 days expiration
          };
          const token = await generateJwt(jwtPayload, env.JWT_SECRET);
          return addCorsHeaders(new Response(JSON.stringify({ token }), { headers: { 'Content-Type': 'application/json' } }));
        }
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 }));
      } catch (e: any) {
        console.error("[Direct Login Handler] Error:", e.message, e.stack);
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Failed to process login request.', details: e.message }), { status: 500 }));
      }
    }

    // Direct handler for GET /api/items (PUBLIC)
    if (url.pathname === '/api/items' && request.method === 'GET') {
      console.log("[Direct Handler GET /api/items PUBLIC] Processing...");
      if (!env.DB) {
        console.error("[Direct Handler GET /api/items PUBLIC] CRITICAL: env.DB is not defined!");
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Database configuration error.' }), { status: 500 }));
      }
      try {
        const dbResult = await env.DB.prepare("SELECT * FROM Items ORDER BY name ASC").all();
        if (!dbResult || !dbResult.success) {
            console.error("[Direct Handler GET /api/items PUBLIC] D1 query failed. Error:", dbResult?.error);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Failed to fetch items.', details: dbResult?.error }), { status: 500 }));
        }
        const results = (dbResult.results || []) as Item[];
        console.log(`[Direct Handler GET /api/items PUBLIC] Fetched ${results.length} items.`);
        return addCorsHeaders(new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } }));
      } catch (e: any) {
        console.error("[Direct Handler GET /api/items PUBLIC] Error during D1 query:", e.message);
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Error querying items.', details: e.message }), { status: 500 }));
      }
    }
    
    // Direct handler for POST /api/items (Admin Only)
    if (url.pathname === '/api/items' && request.method === 'POST') {
        console.log("[Direct Handler POST /api/items] Processing...");
        const authResult = await directAuthCheck(request, env);
        if (authResult instanceof Response) return authResult; 
        
        console.log("[Direct Handler POST /api/items] Admin user authenticated:", JSON.stringify(authResult));

        if (!env.DB) {
            console.error("[Direct Handler POST /api/items] CRITICAL: env.DB is not defined!");
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Database configuration error.' }), { status: 500 }));
        }

        let rawItemData;
        try {
            console.log("[Direct Handler POST /api/items] Attempting request.json()...");
            rawItemData = await request.json();
            console.log("[Direct Handler POST /api/items] request.json() successful. Parsed data:", JSON.stringify(rawItemData));
        } catch (e: any) {
            console.error("[Direct Handler POST /api/items] Error parsing request.json():", e.message, e.stack);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Failed to parse request body.', details: e.message }), { status: 400 }));
        }

        try {
            const typedRawItemData = rawItemData as Omit<Item, 'id' | 'currentStock'> & { initialStock?: string | number, price?: string | number };
            const initialStockNum = Number(typedRawItemData.initialStock);
            const priceNum = Number(typedRawItemData.price);

            if (!typedRawItemData.name || typedRawItemData.initialStock == null || isNaN(initialStockNum) || initialStockNum < 0 || 
                typedRawItemData.price == null || isNaN(priceNum) || priceNum < 0 || !typedRawItemData.unit) {
                console.error("[Direct Handler POST /api/items] Validation failed. Data:", JSON.stringify({ ...typedRawItemData, initialStockNum, priceNum }));
                const errors: Record<string, string> = {};
                if(!typedRawItemData.name) errors.name = "Name is required.";
                if(typedRawItemData.initialStock == null || isNaN(initialStockNum) || initialStockNum < 0) errors.initialStock = "Initial stock must be a non-negative number.";
                if(typedRawItemData.price == null || isNaN(priceNum) || priceNum < 0) errors.price = "Price must be a non-negative number.";
                if(!typedRawItemData.unit) errors.unit = "Unit is required.";
                return addCorsHeaders(new Response(JSON.stringify({ error: 'Missing required fields or invalid numeric values.', details: errors }), { status: 400 }));
            }

            const newItemId = generateId('item');
            const newItem: Item = {
                name: typedRawItemData.name,
                initialStock: initialStockNum,
                currentStock: initialStockNum, 
                price: priceNum,
                description: typedRawItemData.description || '',
                imageUrl: typedRawItemData.imageUrl || `https://picsum.photos/seed/${newItemId}/200`,
                unit: typedRawItemData.unit,
                id: newItemId,
            };
            console.log("[Direct Handler POST /api/items] Constructed newItem for DB:", JSON.stringify(newItem));
            
            console.log("[Direct Handler POST /api/items] Preparing D1 statement for INSERT...");
            const statement = env.DB.prepare(
              "INSERT INTO Items (id, name, initialStock, currentStock, price, description, imageUrl, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(newItem.id, newItem.name, newItem.initialStock, newItem.currentStock, newItem.price, newItem.description, newItem.imageUrl, newItem.unit);
            
            console.log("[Direct Handler POST /api/items] Executing D1 INSERT statement...");
            const dbResult = await statement.run();
            console.log("[Direct Handler POST /api/items] D1 INSERT result:", JSON.stringify(dbResult));

            if (!dbResult || !dbResult.success) { 
                console.error("[Direct Handler POST /api/items] D1 INSERT failed. Full result:", JSON.stringify(dbResult));
                return addCorsHeaders(new Response(JSON.stringify({ error: 'Failed to add item to database.', details: dbResult?.error || 'Unknown D1 error' }), { status: 500 }));
            }

            console.log("[Direct Handler POST /api/items] Item added successfully. Returning new item.");
            return addCorsHeaders(new Response(JSON.stringify(newItem), { status: 201, headers: { 'Content-Type': 'application/json' } }));
        } catch (e: any) {
            console.error("[Direct Handler POST /api/items] Unhandled error in D1 logic or validation:", e.message, e.stack);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Internal server error while adding item.', details: e.message }), { status: 500 }));
        }
    }
    
    // Direct handler for PUT /api/items/:id (Admin only)
    const itemUpdateMatch = url.pathname.match(/^\/api\/items\/([a-zA-Z0-9-]+)$/);
    if (itemUpdateMatch && request.method === 'PUT') {
        const itemId = itemUpdateMatch[1];
        const routeName = `[Direct Handler PUT /api/items/:id]`;
        console.log(`${routeName} Processing for ID: ${itemId}`);

        const authResult = await directAuthCheck(request, env);
        if (authResult instanceof Response) return authResult;
        console.log(`${routeName} Admin user authenticated for ID: ${itemId}.`);

        if (!env.DB) {
            console.error(`${routeName} CRITICAL: env.DB is not defined for ID: ${itemId}`);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Database configuration error.' }), { status: 500 }));
        }

        let updatedItemData;
        try {
            console.log(`${routeName} Attempting to parse request.json() for ID: ${itemId}`);
            updatedItemData = await request.json() as Item;
            console.log(`${routeName} Successfully parsed request.json() for ID: ${itemId}.`);
        } catch (e: any) {
            console.error(`${routeName} Error parsing request.json() for ID: ${itemId}:`, e.message);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Invalid request body.', details: e.message }), { status: 400 }));
        }
        
        try {
            console.log(`${routeName} Validating item data for ID: ${itemId}. CurrentStock: ${updatedItemData.currentStock}, InitialStock: ${updatedItemData.initialStock}, Price: ${updatedItemData.price}`);
            if (updatedItemData.currentStock > updatedItemData.initialStock) {
                console.warn(`${routeName} Validation failed for ID: ${itemId}: Current stock ${updatedItemData.currentStock} > initial stock ${updatedItemData.initialStock}.`);
                return addCorsHeaders(new Response(JSON.stringify({ error: 'Current stock cannot exceed initial stock.' }), { status: 400 }));
            }
            if (updatedItemData.currentStock < 0 || updatedItemData.initialStock < 0 || updatedItemData.price < 0) {
                console.warn(`${routeName} Validation failed for ID: ${itemId}: Stock or price is negative.`);
                return addCorsHeaders(new Response(JSON.stringify({ error: 'Stock and price cannot be negative.' }), { status: 400 }));
            }
            console.log(`${routeName} Validation successful for ID: ${itemId}.`);

            console.log(`${routeName} Preparing D1 statement for UPDATE on ID: ${itemId}`);
            const statement = env.DB.prepare(
                "UPDATE Items SET name = ?, initialStock = ?, currentStock = ?, price = ?, description = ?, imageUrl = ?, unit = ? WHERE id = ?"
            ).bind(updatedItemData.name, updatedItemData.initialStock, updatedItemData.currentStock, updatedItemData.price, updatedItemData.description, updatedItemData.imageUrl, updatedItemData.unit, itemId);
            
            console.log(`${routeName} Executing D1 UPDATE statement for ID: ${itemId}`);
            const dbResult = await statement.run();
            console.log(`${routeName} D1 UPDATE result for ID: ${itemId}:`, JSON.stringify(dbResult));

            if (!dbResult || !dbResult.success || (dbResult.meta && dbResult.meta.changes === 0)) {
                const errorMsg = dbResult?.error || (dbResult?.meta?.changes === 0 ? 'Item not found or no changes made' : 'Unknown D1 error');
                console.error(`${routeName} D1 UPDATE failed for ID: ${itemId}. Error: ${errorMsg}. Full result:`, JSON.stringify(dbResult));
                return addCorsHeaders(new Response(JSON.stringify({ error: errorMsg }), { status: dbResult?.error ? 500 : 404 }));
            }
            
            console.log(`${routeName} Item updated successfully for ID: ${itemId}. Returning updated item data.`);
            return addCorsHeaders(new Response(JSON.stringify(updatedItemData), { headers: { 'Content-Type': 'application/json' } }));
        } catch (e: any) {
            console.error(`${routeName} Unhandled error during D1 logic or validation for ID: ${itemId}:`, e.message, e.stack);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Internal server error while updating item.', details: e.message }), { status: 500 }));
        }
    }

    // Direct handler for DELETE /api/items/:id (Admin only)
    const itemDeleteMatch = url.pathname.match(/^\/api\/items\/([a-zA-Z0-9-]+)$/);
    if (itemDeleteMatch && request.method === 'DELETE') {
        const itemId = itemDeleteMatch[1];
        const routeName = `[Direct Handler DELETE /api/items/:id]`;
        console.log(`${routeName} Processing for ID: ${itemId}`);

        const authResult = await directAuthCheck(request, env);
        if (authResult instanceof Response) return authResult;
        console.log(`${routeName} Admin user authenticated for ID: ${itemId}.`);

        if (!env.DB) {
            console.error(`${routeName} CRITICAL: env.DB is not defined for ID: ${itemId}`);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Database configuration error.' }), { status: 500 }));
        }
        
        try {
            console.log(`${routeName} Checking for active rentals for item ID: ${itemId}`);
            const activeRentalCheck = await env.DB.prepare(
                "SELECT 1 FROM RentalApplicationItems rai JOIN RentalApplications ra ON rai.rentalApplicationId = ra.id WHERE rai.itemId = ? AND (ra.status = ? OR ra.status = ?) LIMIT 1"
            ).bind(itemId, RentalStatus.PENDING, RentalStatus.RENTED).first();

            if (activeRentalCheck) {
                console.warn(`${routeName} Cannot delete item ID: ${itemId} due to active rentals.`);
                return addCorsHeaders(new Response(JSON.stringify({ error: 'Cannot delete item with active (Pending or Rented) rental applications.' }), { status: 400 }));
            }
            console.log(`${routeName} No active rentals found for item ID: ${itemId}. Proceeding with delete.`);

            console.log(`${routeName} Preparing D1 statement for DELETE on ID: ${itemId}`);
            const statement = env.DB.prepare("DELETE FROM Items WHERE id = ?").bind(itemId);
            
            console.log(`${routeName} Executing D1 DELETE statement for ID: ${itemId}`);
            const dbResult = await statement.run();
            console.log(`${routeName} D1 DELETE result for ID: ${itemId}:`, JSON.stringify(dbResult));

            if (!dbResult || !dbResult.success || (dbResult.meta && dbResult.meta.changes === 0)) {
                const errorMsg = dbResult?.error || (dbResult?.meta?.changes === 0 ? 'Item not found' : 'Unknown D1 error during delete');
                console.error(`${routeName} D1 DELETE failed for ID: ${itemId}. Error: ${errorMsg}. Full result:`, JSON.stringify(dbResult));
                return addCorsHeaders(new Response(JSON.stringify({ error: errorMsg }), { status: dbResult?.error ? 500 : 404 }));
            }
            
            console.log(`${routeName} Item deleted successfully for ID: ${itemId}.`);
            return addCorsHeaders(new Response(null, { status: 204 }));
        } catch (e: any) {
            console.error(`${routeName} Unhandled error during D1 logic or validation for ID: ${itemId}:`, e.message, e.stack);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Internal server error while deleting item.', details: e.message }), { status: 500 }));
        }
    }


    // Direct handler for POST /api/rentals/apply (User rental submission)
    if (url.pathname === '/api/rentals/apply' && request.method === 'POST') {
      console.log("[Direct Handler POST /api/rentals/apply] Processing...");

      if (!env.DB) {
        console.error("[Direct Handler POST /api/rentals/apply] CRITICAL: env.DB is not defined!");
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Database configuration error.' }), { status: 500 }));
      }

      let appData;
      try {
        console.log("[Direct Handler POST /api/rentals/apply] Attempting request.json()...");
        appData = await request.json() as Omit<RentalApplication, 'id' | 'applicationDate' | 'status' | 'totalItemCost' | 'totalAmount' | 'deposit'>;
        console.log("[Direct Handler POST /api/rentals/apply] request.json() successful. Parsed data length:", JSON.stringify(appData)?.length);
      } catch (e: any) {
        console.error("[Direct Handler POST /api/rentals/apply] Error parsing request.json():", e.message, e.stack);
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Failed to parse request body.', details: e.message }), { status: 400 }));
      }

      try {
        console.log("[Direct Handler POST /api/rentals/apply] Fetching all items from DB for validation...");
        const dbItemsResult = await env.DB.prepare("SELECT * FROM Items").all();
        const allDbItems = (dbItemsResult?.results || []) as Item[];
        if (allDbItems.length === 0 && appData.items.length > 0) {
            console.warn("[Direct Handler POST /api/rentals/apply] DB has no items, but application contains items. Proceeding with caution.");
        }
        console.log(`[Direct Handler POST /api/rentals/apply] Fetched ${allDbItems.length} items from DB.`);

        const stockAdjustments: D1PreparedStatement[] = [];
        console.log("[Direct Handler POST /api/rentals/apply] Validating stock for application items:", appData.items);
        for (const selectedItem of appData.items) {
          const itemDetail = allDbItems.find(i => i.id === selectedItem.itemId);
          if (!itemDetail) {
            console.error(`[Direct Handler POST /api/rentals/apply] Item not found in DB: ${selectedItem.itemId}`);
            return addCorsHeaders(new Response(JSON.stringify({ error: `Item with ID ${selectedItem.itemId} not found.` }), { status: 400 }));
          }
          if (Number(itemDetail.currentStock) < Number(selectedItem.quantity)) {
            console.error(`[Direct Handler POST /api/rentals/apply] Insufficient stock for ${itemDetail.name}. Requested: ${selectedItem.quantity}, Available: ${itemDetail.currentStock}.`);
            return addCorsHeaders(new Response(JSON.stringify({ error: `Insufficient stock for ${itemDetail.name}. Requested: ${selectedItem.quantity}, Available: ${itemDetail.currentStock}.` }), { status: 400 }));
          }
          stockAdjustments.push(
            env.DB.prepare("UPDATE Items SET currentStock = currentStock - ? WHERE id = ? AND currentStock >= ?")
                  .bind(selectedItem.quantity, selectedItem.itemId, selectedItem.quantity)
          );
        }
        console.log("[Direct Handler POST /api/rentals/apply] Stock validation successful. Stock adjustments prepared:", stockAdjustments.length);

        const costs = calculateRentalCosts(appData.items, allDbItems, env);
        console.log("[Direct Handler POST /api/rentals/apply] Calculated costs:", costs);

        const newApplication: RentalApplication = {
          ...appData,
          id: generateId('rental'),
          applicationDate: new Date().toISOString().split('T')[0],
          status: RentalStatus.PENDING,
          totalItemCost: costs.totalItemCost,
          deposit: FIXED_DEPOSIT_AMOUNT_FN(env),
          totalAmount: Number(costs.totalItemCost) + FIXED_DEPOSIT_AMOUNT_FN(env),
        };
        console.log("[Direct Handler POST /api/rentals/apply] New application object created:", newApplication.id);

        const rentalApplicationItemsInserts: D1PreparedStatement[] = newApplication.items.map(item =>
          env.DB.prepare("INSERT INTO RentalApplicationItems (rentalApplicationId, itemId, quantity) VALUES (?, ?, ?)")
                .bind(newApplication.id, item.itemId, item.quantity)
        );
        console.log("[Direct Handler POST /api/rentals/apply] RentalApplicationItems INSERTs prepared:", rentalApplicationItemsInserts.length);

        const mainApplicationInsert = env.DB.prepare(
          "INSERT INTO RentalApplications (id, applicantName, phoneNumber, studentId, accountHolderName, accountNumber, rentalDate, returnDate, totalItemCost, deposit, totalAmount, status, applicationDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          newApplication.id, newApplication.applicantName, newApplication.phoneNumber, newApplication.studentId, newApplication.accountHolderName, newApplication.accountNumber,
          newApplication.rentalDate, newApplication.returnDate, newApplication.totalItemCost, newApplication.deposit, newApplication.totalAmount, newApplication.status, newApplication.applicationDate
        );
        console.log("[Direct Handler POST /api/rentals/apply] Main RentalApplication INSERT prepared.");

        console.log("[Direct Handler POST /api/rentals/apply] Preparing D1 batch operations...");
        const batchOps = [mainApplicationInsert, ...rentalApplicationItemsInserts, ...stockAdjustments];
        
        console.log("[Direct Handler POST /api/rentals/apply] Executing D1 batch operations (" + batchOps.length + " ops)...");
        const batchResults = await env.DB.batch(batchOps);
        console.log("[Direct Handler POST /api/rentals/apply] D1 batch operations completed. Results:", JSON.stringify(batchResults.map(r => ({success: r.success, error: r.error, meta: r.meta}))));
        
        for (const result of batchResults) {
            if (!result.success) {
                console.error("[Direct Handler POST /api/rentals/apply] D1 batch operation failed:", result);
                throw new Error(result.error || 'A D1 batch operation failed.');
            }
        }

        console.log("[Direct Handler POST /api/rentals/apply] Application submitted successfully. Returning new application data.");
        return addCorsHeaders(new Response(JSON.stringify(newApplication), { status: 201, headers: { 'Content-Type': 'application/json' } }));

      } catch (e: any) {
        console.error("[Direct Handler POST /api/rentals/apply] Error processing application:", e.message, e.stack, e.cause);
        if (e.message?.includes("constraint") || e.cause?.message?.includes("CONSTRAINT") || e.message?.includes("CHECK constraint failed")) {
           return addCorsHeaders(new Response(JSON.stringify({ error: 'Stock became unavailable during transaction or data invalid. Please check stock and try again.' }), { status: 409 }));
        }
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Failed to submit application.', details: e.message }), { status: 500 }));
      }
    }
    
    // Direct Handler for POST /api/rentals/find
    if (url.pathname === '/api/rentals/find' && request.method === 'POST') {
      console.log("[Direct Handler POST /api/rentals/find] Processing...");
      if (!env.DB) {
        console.error("[Direct Handler POST /api/rentals/find] CRITICAL: env.DB is not defined!");
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Database configuration error.' }), { status: 500 }));
      }
      try {
        const { name, studentId, phoneNumber } = await request.json() as { name?: string, studentId?: string, phoneNumber?: string };
        console.log(`[Direct Handler POST /api/rentals/find] Search criteria: Name=${name}, StudentID=${studentId}, Phone=${phoneNumber}`);

        if (!name || !studentId || !phoneNumber) {
          console.warn("[Direct Handler POST /api/rentals/find] Validation failed: Missing name, studentId, or phoneNumber.");
          return addCorsHeaders(new Response(JSON.stringify({ error: 'Name, studentId, and phoneNumber are required.' }), { status: 400 }));
        }

        const appDbResult = await env.DB.prepare(
          "SELECT * FROM RentalApplications WHERE applicantName = ? AND studentId = ? AND phoneNumber = ? ORDER BY applicationDate DESC"
        ).bind(name, studentId, phoneNumber).all();
        
        const applicationsFromDb = (appDbResult?.results || []) as (Omit<RentalApplication, 'items' | 'depositRefunded'> & {depositRefunded?: number | boolean})[];
        console.log(`[Direct Handler POST /api/rentals/find] Found ${applicationsFromDb.length} applications from DB.`);

        if (applicationsFromDb.length === 0) {
          return addCorsHeaders(new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } }));
        }
        
        const applicationsWithItems: RentalApplication[] = [];
        for (const app of applicationsFromDb) {
          const itemsDbResult = await env.DB.prepare(
            "SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?"
          ).bind(app.id).all();
          const items = (itemsDbResult?.results || []) as SelectedItemEntry[];
          applicationsWithItems.push({ 
              ...app, 
              items: items, 
              depositRefunded: typeof app.depositRefunded === 'number' ? app.depositRefunded === 1 : !!app.depositRefunded 
          });
        }
        console.log(`[Direct Handler POST /api/rentals/find] Processed ${applicationsWithItems.length} applications with items.`);
        return addCorsHeaders(new Response(JSON.stringify(applicationsWithItems), { headers: { 'Content-Type': 'application/json' } }));

      } catch (e: any) {
        console.error("[Direct Handler POST /api/rentals/find] Error:", e.message, e.stack);
        return addCorsHeaders(new Response(JSON.stringify({ error: 'Failed to find applications.', details: e.message }), { status: 500 }));
      }
    }

    // Direct handler for PUT /api/rentals/:id (User update rental application)
    const userRentalUpdateMatch = url.pathname.match(/^\/api\/rentals\/([a-zA-Z0-9-]+)$/);
    if (userRentalUpdateMatch && request.method === 'PUT') {
        const rentalId = userRentalUpdateMatch[1];
        const routeName = `[Direct Handler PUT /api/rentals/:id]`;
        console.log(`${routeName} Processing for ID: ${rentalId}`);

        if (!env.DB) {
            console.error(`${routeName} CRITICAL: env.DB is not defined for ID: ${rentalId}`);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Database configuration error.' }), { status: 500 }));
        }

        let newItemsData: SelectedItemEntry[], rentalDate: string, returnDate: string;
        try {
            console.log(`${routeName} Attempting to parse request.json() for ID: ${rentalId}`);
            const body = await request.json() as {items: SelectedItemEntry[], rentalDate: string, returnDate: string};
            newItemsData = body.items;
            rentalDate = body.rentalDate;
            returnDate = body.returnDate;
            console.log(`${routeName} Successfully parsed request.json() for ID: ${rentalId}. Items count: ${newItemsData?.length}`);
        } catch (e: any) {
            console.error(`${routeName} Error parsing request.json() for ID: ${rentalId}:`, e.message);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Invalid request body.', details: e.message }), { status: 400 }));
        }

        if (!newItemsData || newItemsData.length === 0 || !rentalDate || !returnDate || rentalDate > returnDate) {
            console.warn(`${routeName} Validation failed for ID: ${rentalId}. Items: ${newItemsData?.length}, rentalDate: ${rentalDate}, returnDate: ${returnDate}`);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Invalid data: Items list cannot be empty, and dates must be valid.' }), { status: 400 }));
        }

        try {
            console.log(`${routeName} Fetching original application from DB for ID: ${rentalId}`);
            const originalAppFromDbResult = await env.DB.prepare("SELECT * FROM RentalApplications WHERE id = ?").bind(rentalId).first();
            const originalAppFromDb = originalAppFromDbResult as (Omit<RentalApplication, 'items' | 'depositRefunded'> & {depositRefunded?: number | boolean}) | null;

            console.log(`${routeName} Fetched original application status for ID: ${rentalId}: ${originalAppFromDb ? 'found' : 'not found'}`);

            if (!originalAppFromDb) {
                return addCorsHeaders(new Response(JSON.stringify({ error: 'Application not found' }), { status: 404 }));
            }
            if (originalAppFromDb.status !== RentalStatus.PENDING) {
                return addCorsHeaders(new Response(JSON.stringify({ error: 'Only PENDING applications can be modified by user.' }), { status: 403 }));
            }
            
            console.log(`${routeName} Fetching original items from DB for ID: ${rentalId}`);
            const originalItemsDbResult = await env.DB.prepare("SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(rentalId).all();
            const originalItemsFromDb = (originalItemsDbResult?.results || []) as SelectedItemEntry[];
            console.log(`${routeName} Fetched ${originalItemsFromDb.length} original items for ID: ${rentalId}`);
            
            const fullOriginalApp: RentalApplication = {
                ...(originalAppFromDb as Omit<RentalApplication, 'items'>), 
                items: originalItemsFromDb, 
                depositRefunded: typeof originalAppFromDb.depositRefunded === 'number' ? originalAppFromDb.depositRefunded === 1 : !!originalAppFromDb.depositRefunded 
            };
            const updatedAppCore = { ...fullOriginalApp, rentalDate, returnDate }; 

            console.log(`${routeName} Calling manageRentalUpdate for ID: ${rentalId}`);
            const { finalApp, dbOperations } = await manageRentalUpdate(env, fullOriginalApp, updatedAppCore, newItemsData);
            console.log(`${routeName} manageRentalUpdate returned for ID: ${rentalId}. DB operations to batch: ${dbOperations.length}`);
            
            await env.DB.batch(dbOperations);
            console.log(`${routeName} DB batch successful for ID: ${rentalId}`);
            return addCorsHeaders(new Response(JSON.stringify(finalApp), { headers: { 'Content-Type': 'application/json' }}));
        } catch (e: any) {
            console.error(`${routeName} Error updating user rental application for ID: ${rentalId}:`, e.message, e.stack);
            return addCorsHeaders(new Response(JSON.stringify({ error: e.message || 'Failed to update application.' }), { status: e.message?.includes("Insufficient stock") || e.message?.includes("stock became unavailable") ? 409 : 500 }));
        }
    }

    // Direct handler for POST /api/rentals/:id/cancel
    const userRentalCancelMatch = url.pathname.match(/^\/api\/rentals\/([a-zA-Z0-9-]+)\/cancel$/);
    if (userRentalCancelMatch && request.method === 'POST') {
        const rentalId = userRentalCancelMatch[1];
        const routeName = `[Direct Handler POST /api/rentals/:id/cancel]`;
        console.log(`${routeName} Processing for ID: ${rentalId}`);

        if (!env.DB) {
            console.error(`${routeName} CRITICAL: env.DB is not defined for ID: ${rentalId}`);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Database configuration error.' }), { status: 500 }));
        }

        try {
            console.log(`${routeName} Fetching application to cancel from DB for ID: ${rentalId}`);
            const appToCancelResult = await env.DB.prepare("SELECT * FROM RentalApplications WHERE id = ?").bind(rentalId).first();
            const appToCancel = appToCancelResult as (Omit<RentalApplication, 'items'> & {status: RentalStatus}) | null; 
            
            if (!appToCancel) {
                console.warn(`${routeName} Application not found for ID: ${rentalId}`);
                return addCorsHeaders(new Response(JSON.stringify({ error: 'Application not found' }), { status: 404 }));
            }
            
            if (appToCancel.status !== RentalStatus.PENDING) {
                console.warn(`${routeName} Attempt to cancel non-PENDING application (status: ${appToCancel.status}) for ID: ${rentalId}`);
                return addCorsHeaders(new Response(JSON.stringify({ error: 'Only PENDING applications can be cancelled by user.' }), { status: 403 }));
            }
            console.log(`${routeName} Application ${rentalId} is PENDING, proceeding with cancellation.`);

            console.log(`${routeName} Fetching items to restore stock for ID: ${rentalId}`);
            const itemsToRestoreDbResult = await env.DB.prepare("SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(rentalId).all();
            const itemsToRestore = (itemsToRestoreDbResult?.results || []) as SelectedItemEntry[];
            console.log(`${routeName} Found ${itemsToRestore.length} item entries to restore stock for ID: ${rentalId}`);

            const dbOperations: D1PreparedStatement[] = [];
            if (itemsToRestore.length > 0) {
                itemsToRestore.forEach(item => {
                    dbOperations.push(
                        env.DB.prepare("UPDATE Items SET currentStock = currentStock + ? WHERE id = ?")
                            .bind(item.quantity, item.itemId)
                    );
                });
                console.log(`${routeName} Prepared ${itemsToRestore.length} stock update operations for ID: ${rentalId}`);
            }

            console.log(`${routeName} Preparing to delete item entries and application for ID: ${rentalId}`);
            dbOperations.push(env.DB.prepare("DELETE FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(rentalId));
            dbOperations.push(env.DB.prepare("DELETE FROM RentalApplications WHERE id = ?").bind(rentalId));
            
            console.log(`${routeName} Executing batch D1 operations (${dbOperations.length}) for ID: ${rentalId}`);
            await env.DB.batch(dbOperations);
            console.log(`${routeName} DB batch successful. Application ${rentalId} cancelled.`);
            return addCorsHeaders(new Response(JSON.stringify({ message: 'Application cancelled successfully.' }), { headers: { 'Content-Type': 'application/json' } }));

        } catch (e: any) {
            console.error(`${routeName} Error cancelling application for ID: ${rentalId}:`, e.message, e.stack);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Failed to cancel application.', details: e.message }), { status: 500 }));
        }
    }


    // Direct handler for GET /api/admin/rentals
    if (url.pathname === '/api/admin/rentals' && request.method === 'GET') {
        console.log("[Direct Handler GET /api/admin/rentals] Processing...");
        const authResult = await directAuthCheck(request, env);
        if (authResult instanceof Response) return authResult;

        if (!env.DB) {
            console.error("[Direct Handler GET /api/admin/rentals] CRITICAL: env.DB is not defined!");
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Database configuration error.' }), { status: 500 }));
        }
        try {
            const appDbResult = await env.DB.prepare("SELECT * FROM RentalApplications ORDER BY applicationDate DESC").all();
            const applications = (appDbResult?.results || []) as (Omit<RentalApplication, 'items' | 'depositRefunded'> & {depositRefunded?: number | boolean})[];
            if (applications.length === 0) {
                 return addCorsHeaders(new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } }));
            }
            const applicationsWithItems: RentalApplication[] = [];
            for (const app of applications) {
                const itemsDbResult = await env.DB.prepare("SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(app.id).all();
                applicationsWithItems.push({ 
                    ...app, 
                    items: (itemsDbResult?.results || []) as SelectedItemEntry[], 
                    depositRefunded: typeof app.depositRefunded === 'number' ? app.depositRefunded === 1 : !!app.depositRefunded 
                });
            }
            return addCorsHeaders(new Response(JSON.stringify(applicationsWithItems), { headers: { 'Content-Type': 'application/json' } }));
        } catch (e: any) {
            console.error("[Direct Handler GET /api/admin/rentals] Error during D1 query:", e.message);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Error querying rental applications.', details: e.message }), { status: 500 }));
        }
    }

    // Direct handler for GET /api/admin/dashboard/stats
    if (url.pathname === '/api/admin/dashboard/stats' && request.method === 'GET') {
        console.log("[Direct Handler GET /api/admin/dashboard/stats] Processing...");
        const authResult = await directAuthCheck(request, env);
        if (authResult instanceof Response) return authResult;

        if (!env.DB) {
            console.error("[Direct Handler GET /api/admin/dashboard/stats] CRITICAL: env.DB is not defined!");
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Database configuration error.' }), { status: 500 }));
        }
        try {
            const today = new Date().toISOString().split('T')[0];
            const newRequestsQuery = env.DB.prepare("SELECT COUNT(*) as count FROM RentalApplications WHERE status = ?").bind(RentalStatus.PENDING);
            const dueTodayQuery = env.DB.prepare("SELECT COUNT(*) as count FROM RentalApplications WHERE status = ? AND returnDate = ?").bind(RentalStatus.RENTED, today);
            const currentlyRentedQuery = env.DB.prepare("SELECT COUNT(*) as count FROM RentalApplications WHERE status = ?").bind(RentalStatus.RENTED);
            const lowStockItemsQuery = env.DB.prepare("SELECT COUNT(*) as count FROM Items WHERE currentStock < 5 AND initialStock > 0");
            
            const batchResults = await env.DB.batch([newRequestsQuery, dueTodayQuery, currentlyRentedQuery, lowStockItemsQuery]);
            const stats = {
                newRequests: (batchResults[0]?.results?.[0] as { count: number } | undefined)?.count || 0,
                dueToday: (batchResults[1]?.results?.[0] as { count: number } | undefined)?.count || 0,
                currentlyRented: (batchResults[2]?.results?.[0] as { count: number } | undefined)?.count || 0,
                lowStockItems: (batchResults[3]?.results?.[0] as { count: number } | undefined)?.count || 0,
            };
            return addCorsHeaders(new Response(JSON.stringify(stats), { headers: { 'Content-Type': 'application/json' } }));
        } catch (e: any) {
            console.error("[Direct Handler GET /api/admin/dashboard/stats] Error during D1 query:", e.message);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Error querying dashboard stats.', details: e.message }), { status: 500 }));
        }
    }
    
    // Direct handler for PUT /api/admin/rentals/:id (Admin update rental application)
    const adminRentalUpdateMatch = url.pathname.match(/^\/api\/admin\/rentals\/([a-zA-Z0-9-]+)$/);
    if (adminRentalUpdateMatch && request.method === 'PUT') {
        const rentalId = adminRentalUpdateMatch[1];
        console.log(`[Direct Handler PUT /api/admin/rentals/:id] Processing for ID: ${rentalId}`);
        const authResult = await directAuthCheck(request, env);
        if (authResult instanceof Response) return authResult;

        if (!env.DB) {
            console.error(`[Direct Handler PUT /api/admin/rentals/:id] CRITICAL: env.DB is not defined for ID: ${rentalId}`);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Database configuration error.' }), { status: 500 }));
        }

        let adminUpdatedData;
        try {
            adminUpdatedData = await request.json() as Partial<RentalApplication>;
            console.log(`[Direct Handler PUT /api/admin/rentals/:id] Parsed admin update data for ID: ${rentalId}`, adminUpdatedData);
        } catch (e: any) {
            console.error(`[Direct Handler PUT /api/admin/rentals/:id] Error parsing request body for ID: ${rentalId}`, e);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Failed to parse request body.', details: e.message }), { status: 400 }));
        }

        try {
            const originalAppFromDbResult = await env.DB.prepare("SELECT * FROM RentalApplications WHERE id = ?").bind(rentalId).first();
             if (!originalAppFromDbResult) {
                console.error(`[Direct Handler PUT /api/admin/rentals/:id] Application not found: ${rentalId}`);
                return addCorsHeaders(new Response(JSON.stringify({ error: 'Application not found' }), { status: 404 }));
            }
            const originalAppFromDb = originalAppFromDbResult as (Omit<RentalApplication, 'items' | 'depositRefunded'> & {depositRefunded?: number | boolean});


            const originalItemsDbResult = await env.DB.prepare("SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(rentalId).all();
            const originalItemsFromDb = (originalItemsDbResult?.results || []) as SelectedItemEntry[];
            const fullOriginalApp: RentalApplication = {
                ...(originalAppFromDb as Omit<RentalApplication, 'items'>), 
                items: originalItemsFromDb, 
                depositRefunded: typeof originalAppFromDb.depositRefunded === 'number' ? originalAppFromDb.depositRefunded === 1 : !!originalAppFromDb.depositRefunded 
            };
            console.log(`[Direct Handler PUT /api/admin/rentals/:id] Fetched original application for ID: ${rentalId}`, fullOriginalApp);

            const newItemsToUse = fullOriginalApp.items; 

            const updatedAppCore: Omit<RentalApplication, 'items' | 'totalItemCost' | 'totalAmount' | 'deposit'> = {
                ...fullOriginalApp,
                ...adminUpdatedData, 
                id: fullOriginalApp.id, 
            };
            console.log(`[Direct Handler PUT /api/admin/rentals/:id] Core data for update for ID: ${rentalId}`, updatedAppCore);
             
            if (updatedAppCore.status === RentalStatus.RETURNED && !updatedAppCore.actualReturnDate) {
                 console.error(`[Direct Handler PUT /api/admin/rentals/:id] Actual return date required for RETURNED status. ID: ${rentalId}`);
                 return addCorsHeaders(new Response(JSON.stringify({ error: 'Actual return date is required for RETURNED status.' }), { status: 400 }));
            }

            const { finalApp, dbOperations } = await manageRentalUpdate(env, fullOriginalApp, updatedAppCore, newItemsToUse);
            console.log(`[Direct Handler PUT /api/admin/rentals/:id] Prepared ${dbOperations.length} DB operations for ID: ${rentalId}`);
            
            await env.DB.batch(dbOperations);
            console.log(`[Direct Handler PUT /api/admin/rentals/:id] Batch operations successful for ID: ${rentalId}. Returning updated app.`);
            return addCorsHeaders(new Response(JSON.stringify(finalApp), { headers: { 'Content-Type': 'application/json' }}));

        } catch (e: any) {
            console.error(`[Direct Handler PUT /api/admin/rentals/:id] Error updating application for ID: ${rentalId}:`, e.message, e.stack);
            const status = e.message?.includes("Insufficient stock") || e.message?.includes("stock became unavailable") ? 409 : 500;
            return addCorsHeaders(new Response(JSON.stringify({ error: e.message || 'Failed to update application.' }), { status }));
        }
    }
    
    // Direct handler for DELETE /api/admin/rentals/:id (Admin delete rental application)
    const adminRentalDeleteMatch = url.pathname.match(/^\/api\/admin\/rentals\/([a-zA-Z0-9-]+)$/);
    if (adminRentalDeleteMatch && request.method === 'DELETE') {
        const rentalId = adminRentalDeleteMatch[1];
        const routeName = `[Direct Handler DELETE /api/admin/rentals/:id]`;
        console.log(`${routeName} Processing for ID: ${rentalId}`);

        const authResult = await directAuthCheck(request, env);
        if (authResult instanceof Response) return authResult;
        console.log(`${routeName} Admin user authenticated for ID: ${rentalId}.`);

        if (!env.DB) {
            console.error(`${routeName} CRITICAL: env.DB is not defined for ID: ${rentalId}`);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Database configuration error.' }), { status: 500 }));
        }

        try {
            console.log(`${routeName} Fetching application to delete from DB for ID: ${rentalId}`);
            const appToDeleteResult = await env.DB.prepare("SELECT id, status FROM RentalApplications WHERE id = ?").bind(rentalId).first();
            const appToDelete = appToDeleteResult as { id: string, status: RentalStatus } | null;

            if (!appToDelete) {
                console.warn(`${routeName} Application not found for ID: ${rentalId}`);
                return addCorsHeaders(new Response(JSON.stringify({ error: 'Application not found' }), { status: 404 }));
            }
            console.log(`${routeName} Application ${rentalId} found with status: ${appToDelete.status}.`);

            const dbOperations: D1PreparedStatement[] = [];

            if (appToDelete.status === RentalStatus.PENDING || appToDelete.status === RentalStatus.RENTED) {
                console.log(`${routeName} Application status is ${appToDelete.status}. Fetching items to restore stock for ID: ${rentalId}`);
                const itemsToRestoreDbResult = await env.DB.prepare("SELECT itemId, quantity FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(rentalId).all();
                const itemsToRestore = (itemsToRestoreDbResult?.results || []) as SelectedItemEntry[];
                console.log(`${routeName} Found ${itemsToRestore.length} item entries to restore stock for ID: ${rentalId}`);

                if (itemsToRestore.length > 0) {
                    itemsToRestore.forEach(item => {
                        dbOperations.push(
                            env.DB.prepare("UPDATE Items SET currentStock = currentStock + ? WHERE id = ?")
                                .bind(item.quantity, item.itemId)
                        );
                    });
                    console.log(`${routeName} Prepared ${itemsToRestore.length} stock update operations for ID: ${rentalId}`);
                }
            } else {
                console.log(`${routeName} Application status is ${appToDelete.status}. No stock restoration needed for ID: ${rentalId}`);
            }

            console.log(`${routeName} Preparing to delete item entries and application for ID: ${rentalId}`);
            dbOperations.push(env.DB.prepare("DELETE FROM RentalApplicationItems WHERE rentalApplicationId = ?").bind(rentalId));
            dbOperations.push(env.DB.prepare("DELETE FROM RentalApplications WHERE id = ?").bind(rentalId));
            
            console.log(`${routeName} Executing batch D1 operations (${dbOperations.length}) for ID: ${rentalId}`);
            const batchResults = await env.DB.batch(dbOperations);
            console.log(`${routeName} D1 batch operations completed for ID ${rentalId}. Results:`, JSON.stringify(batchResults.map(r => ({success: r.success, error: r.error, meta: r.meta}))));
            
            for (const result of batchResults) {
                if (!result.success) {
                    console.error(`${routeName} D1 batch operation failed for ID ${rentalId}:`, result);
                    throw new Error(result.error || 'A D1 batch operation failed during deletion.');
                }
            }
            
            console.log(`${routeName} DB batch successful. Application ${rentalId} deleted.`);
            return addCorsHeaders(new Response(null, { status: 204 })); 

        } catch (e: any) {
            console.error(`${routeName} Error deleting application for ID: ${rentalId}:`, e.message, e.stack);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Failed to delete application.', details: e.message }), { status: 500 }));
        }
    }


    // Fallback to itty-router for all other routes
    console.log(`[Main Fetch] Passing request to itty-router for ${request.method} ${url.pathname}`);
    let responseFromRouter: Response;
    try {
      responseFromRouter = await router.handle(request as AppRequest, env, ctx); 
      console.log(`[Main Fetch] router.handle returned for ${request.method} ${url.pathname}. Status: ${responseFromRouter.status}`);
    } catch (e: any) {
      console.error(`[Main Fetch] Error from router.handle for ${url.pathname}:`, e.message, e.stack);
      responseFromRouter = new Response(JSON.stringify({ error: 'Internal Server Error (router main catch)', details: e.message }), { status: 500 });
    }
    
    return addCorsHeaders(responseFromRouter);
  },
};