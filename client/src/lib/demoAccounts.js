/**
 * Demo logins for the mock phase. They seed the mock user store (mocks/auth.js)
 * and are listed on the sign-in page so the reviewer can try both roles
 * without registering. Step 10 removes the panel once real accounts exist.
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
