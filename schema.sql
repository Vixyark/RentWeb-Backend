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