/**
 * Demo logins seeded by `server/src/db/seed.js` (`npm run db:seed`). They are
 * listed on the sign-in page so a reviewer can try both roles without
 * registering. Step 10 removes the panel once real accounts are enough.
 */
export const DEMO_ACCOUNTS = [
  {
    role: 'customer',
    label: 'Pelanggan',
    name: 'Sari Wulandari',
    email: 'sari@badekor.id',
    password: 'rahasia123',
    phone: '081234567890',
  },
  {
    role: 'admin',
    label: 'Admin',
    name: 'Rani BaDekor',
    email: 'admin@badekor.id',
    password: 'rahasia123',
    phone: '081100000000',
  },
];
