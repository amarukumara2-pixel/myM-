import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as fs from 'fs';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-project",
    firestore: {
      rules: fs.readFileSync('DRAFT_firestore.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Bizflow Rules", () => {
  it("allows admin to write inventory", async () => {
    const admin = testEnv.authenticatedContext('admin_uid', { email_verified: true });
    // This is assuming 'admin_uid' is in the admins collection. 
    // In tests we can mock it by explicitly creating the admin doc using testEnv.withSecurityRulesDisabled
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc('admins/admin_uid').set({ active: true });
    });
    const db = admin.firestore();
    // Test payload for inventory
    const payload = {
        name: "Test item", qty: 10, price: 50, cost: 30, category: "Items"
    };
    await expect(db.collection('inventory').doc('it1').set(payload)).resolves.toBeUndefined();
  });

  it("denies unverified rep to read sales", async () => {
     const unverified = testEnv.authenticatedContext('rep_1', { email_verified: false });
     const db = unverified.firestore();
     await expect(db.collection('sales').get()).rejects.toThrow();
  });
});
