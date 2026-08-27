# Security Specification - BizFlow

## 1. Data Invariants

- **Sales**: 
  - Every sale must have a valid `repId`.
  - `createdAt` must be a server-side timestamp.
  - Users can only read sales they created (unless they are admin).
- **Customers**:
  - `name` and `locationStr` are required.
  - Balances can only be updated during a sale or by an admin.
- **Inventory**:
  - Only admins can update stock levels or add products.
  - Reps can only read inventory and decrement stock during a sale.
- **Messages**:
  - Users can only read and write messages in their authorized channels.
  - `timestamp` must be server-side.

## 2. Dirty Dozen Payloads (Denial Expected)

1. **Identity Spoofing**: Creating a sale with a different `repId` than the authenticated user.
2. **PII Leak**: A Rep trying to read the entire `customers` collection or another Rep's `sales` without authorization.
3. **Price Manipulation**: Updating a product's `price` in the global `inventory` from the Rep app.
4. **Stock Injection**: Increasing stock levels manually from a Rep account.
5. **Balance Takeover**: Directly setting a customer's `balance` to 0 without a linked transaction.
6. **Future Dating**: Creating a sale with a `createdAt` date in the future.
7. **Ghost Fields**: Adding `isVerified: true` to a customer profile.
8. **Admin Promotion**: A Rep trying to add themselves to an `admins` collection.
9. **Message Impersonation**: Sending a chat message with someone else's `uid`.
10. **Resource Poisoning**: Using a 1MB string for a shop name.
11. **Negative Inventory**: Setting stock to a negative number.
12. **Orphaned Sales**: Creating a sale for a non-existent customer ID (relational check).

## 3. Conflict Report

| Collection | Identity Spoofing | State Shortcutting | Resource Poisoning |
| :--- | :--- | :--- | :--- |
| `sales` | Blocked by `repId` match | Blocked by `isValidSale()` | Blocked by size checks |
| `customers` | Blocked by `isValidCustomer()` | N/A | Blocked by size checks |
| `inventory` | Admin only | Admin only | Blocked by size checks |
| `messages` | Blocked by `uid` match | N/A | Blocked by size checks |
