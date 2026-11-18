import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPool, migrateTestDatabase, resetDatabase, closeTestDatabase } from '../test/db.js';
import { registerUser } from '../services/auth.js';
import { createAddressService } from '../services/addresses.js';

const addresses = createAddressService(testPool);

const address = (overrides = {}) => ({
  label: 'Rumah',
  recipient: 'Sari Wulandari',
  phone: '081234567890',
  street: 'Jl. Kayu Tangi II No. 18, Banjarmasin',
  district: 'Banjarmasin Utara',
  city: 'Banjarmasin',
  province: 'Kalimantan Selatan',
  postalCode: '70123',
  notes: '',
  isDefault: false,
  ...overrides,
});

let sari;
let rani;

beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();

  sari = await registerUser(testPool, {
    name: 'Sari Wulandari',
    email: 'sari@badekor.id',
    phone: '081234567890',
    password: 'rahasia123',
  });

  rani = await registerUser(testPool, {
    name: 'Rani BaDekor',
    email: 'rani@badekor.id',
    phone: '081100000000',
    password: 'rahasia123',
  });
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('list', () => {
  it('returns an empty list for a new customer', async () => {
    expect(await addresses.list(sari.id)).toEqual([]);
  });

  it('returns the camelCase shape the account forms read', async () => {
    await addresses.create(sari.id, address());

    const [created] = await addresses.list(sari.id);

    expect(created).toEqual({
      id: expect.any(Number),
      label: 'Rumah',
      recipient: 'Sari Wulandari',
      phone: '081234567890',
      street: 'Jl. Kayu Tangi II No. 18, Banjarmasin',
      district: 'Banjarmasin Utara',
      city: 'Banjarmasin',
      province: 'Kalimantan Selatan',
      postalCode: '70123',
      notes: '',
      isDefault: true,
    });
  });

  it('never returns another customer’s addresses', async () => {
    await addresses.create(sari.id, address({ label: 'Rumah Sari' }));
    await addresses.create(rani.id, address({ label: 'Rumah Rani' }));

    const sariList = await addresses.list(sari.id);

    expect(sariList).toHaveLength(1);
    expect(sariList[0].label).toBe('Rumah Sari');
  });

  it('lists the default address first, then the rest by id', async () => {
    await addresses.create(sari.id, address({ label: 'Pertama' }));
    const second = await addresses.create(sari.id, address({ label: 'Kedua' }));
    await addresses.create(sari.id, address({ label: 'Ketiga' }));
    await addresses.setDefault(sari.id, second.id);

    const list = await addresses.list(sari.id);

    expect(list.map((item) => item.label)).toEqual(['Kedua', 'Pertama', 'Ketiga']);
  });
});

describe('create', () => {
  it('makes the first address the default even when isDefault is false', async () => {
    const created = await addresses.create(sari.id, address({ isDefault: false }));

    expect(created.isDefault).toBe(true);
  });

  it('replaces the previous default when a new one asks to be default', async () => {
    const first = await addresses.create(sari.id, address({ label: 'Rumah' }));
    const second = await addresses.create(sari.id, address({ label: 'Kantor', isDefault: true }));

    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(true);

    const list = await addresses.list(sari.id);
    expect(list.filter((item) => item.isDefault)).toHaveLength(1);
    expect(list.find((item) => item.isDefault).id).toBe(second.id);
  });

  it('keeps the existing default when a second address is not marked default', async () => {
    const first = await addresses.create(sari.id, address());
    await addresses.create(sari.id, address({ label: 'Kantor' }));

    const list = await addresses.list(sari.id);
    expect(list.find((item) => item.isDefault).id).toBe(first.id);
  });

  it('serialises two simultaneous first addresses, leaving exactly one default', async () => {
    const results = await Promise.all([
      addresses.create(sari.id, address({ label: 'Bersamaan A' })),
      addresses.create(sari.id, address({ label: 'Bersamaan B' })),
    ]);

    const list = await addresses.list(sari.id);

    expect(list).toHaveLength(2);
    expect(list.filter((item) => item.isDefault)).toHaveLength(1);
    // With no default requested, the first one becomes it; the second must not
    // clobber it just because both thought they were first.
    expect(results.some((item) => item.isDefault)).toBe(true);
  });

  it('keeps exactly one default when two simultaneous creates both ask for it', async () => {
    await addresses.create(sari.id, address({ label: 'Awal' }));

    await Promise.all([
      addresses.create(sari.id, address({ label: 'Bersamaan A', isDefault: true })),
      addresses.create(sari.id, address({ label: 'Bersamaan B', isDefault: true })),
    ]);

    const list = await addresses.list(sari.id);
    expect(list.filter((item) => item.isDefault)).toHaveLength(1);
  });
});

describe('update', () => {
  it('saves the edited fields', async () => {
    const created = await addresses.create(sari.id, address());

    const updated = await addresses.update(sari.id, created.id, {
      ...address({ label: 'Rumah Orang Tua', city: 'Martapura' }),
      isDefault: created.isDefault,
    });

    expect(updated).toMatchObject({ id: created.id, label: 'Rumah Orang Tua', city: 'Martapura' });
  });

  it('promotes the edited address when isDefault is true and demotes the old default', async () => {
    const first = await addresses.create(sari.id, address({ label: 'Rumah' }));
    const second = await addresses.create(sari.id, address({ label: 'Kantor' }));

    await addresses.update(sari.id, second.id, {
      ...address({ label: 'Kantor' }),
      isDefault: true,
    });

    const list = await addresses.list(sari.id);
    expect(list.find((item) => item.isDefault).id).toBe(second.id);
    expect(list.find((item) => item.id === first.id).isDefault).toBe(false);
  });

  it('moves the default to the oldest other address when the flag is cleared', async () => {
    const first = await addresses.create(sari.id, address({ label: 'Rumah' }));
    const second = await addresses.create(sari.id, address({ label: 'Kantor' }));

    // `first` is the default; clearing the flag must promote the oldest other
    // address instead of leaving the account without one.
    await addresses.update(sari.id, first.id, { ...address({ label: 'Rumah' }), isDefault: false });

    const after = await addresses.list(sari.id);
    expect(after.filter((item) => item.isDefault)).toHaveLength(1);
    expect(after.find((item) => item.isDefault).id).toBe(second.id);
    expect(after.find((item) => item.id === first.id).isDefault).toBe(false);
  });

  it('keeps the only address as default when the flag is cleared', async () => {
    await addresses.create(sari.id, address());

    const list = await addresses.list(sari.id);
    await addresses.update(sari.id, list[0].id, { ...address(), isDefault: false });

    const after = await addresses.list(sari.id);
    expect(after).toHaveLength(1);
    expect(after[0].isDefault).toBe(true);
  });

  it('always leaves exactly one default after a run of edits', async () => {
    const first = await addresses.create(sari.id, address({ label: 'Rumah' }));
    const second = await addresses.create(sari.id, address({ label: 'Kantor' }));

    await addresses.update(sari.id, first.id, { ...address({ label: 'Rumah' }), isDefault: false });
    await addresses.update(sari.id, second.id, { ...address({ label: 'Kantor' }), isDefault: false });
    await addresses.update(sari.id, first.id, { ...address({ label: 'Rumah' }), isDefault: true });

    const after = await addresses.list(sari.id);
    expect(after.filter((item) => item.isDefault)).toHaveLength(1);
    expect(after.find((item) => item.isDefault).id).toBe(first.id);
  });

  it('refuses to touch another customer’s address', async () => {
    const theirs = await addresses.create(rani.id, address());

    await expect(
      addresses.update(sari.id, theirs.id, address({ label: 'Dibajak' }))
    ).rejects.toMatchObject({ status: 404, code: 'ADDRESS_NOT_FOUND' });
  });

  it('reports a missing address as 404', async () => {
    await expect(addresses.update(sari.id, 999_999, address())).rejects.toMatchObject({
      status: 404,
      code: 'ADDRESS_NOT_FOUND',
    });
  });
});

describe('remove', () => {
  it('deletes the address', async () => {
    const created = await addresses.create(sari.id, address());

    await addresses.remove(sari.id, created.id);

    expect(await addresses.list(sari.id)).toEqual([]);
  });

  it('promotes the oldest remaining address when the default is deleted', async () => {
    const first = await addresses.create(sari.id, address({ label: 'Pertama' }));
    const second = await addresses.create(sari.id, address({ label: 'Kedua' }));

    await addresses.remove(sari.id, first.id);

    const list = await addresses.list(sari.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: second.id, isDefault: true });
  });

  it('leaves the default alone when a non-default address is deleted', async () => {
    const first = await addresses.create(sari.id, address({ label: 'Rumah' }));
    const second = await addresses.create(sari.id, address({ label: 'Kantor' }));

    await addresses.remove(sari.id, second.id);

    const list = await addresses.list(sari.id);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(first.id);
    expect(list[0].isDefault).toBe(true);
  });

  it('refuses to delete another customer’s address', async () => {
    const theirs = await addresses.create(rani.id, address());

    await expect(addresses.remove(sari.id, theirs.id)).rejects.toMatchObject({
      status: 404,
      code: 'ADDRESS_NOT_FOUND',
    });
    expect(await addresses.list(rani.id)).toHaveLength(1);
  });
});

describe('setDefault', () => {
  it('moves the default flag to the chosen address', async () => {
    const first = await addresses.create(sari.id, address({ label: 'Rumah' }));
    const second = await addresses.create(sari.id, address({ label: 'Kantor' }));

    await addresses.setDefault(sari.id, second.id);

    const list = await addresses.list(sari.id);
    expect(list.find((item) => item.isDefault).id).toBe(second.id);
    expect(list.find((item) => item.id === first.id).isDefault).toBe(false);
  });

  it('is a no-op when the address is already the default', async () => {
    const created = await addresses.create(sari.id, address());

    await addresses.setDefault(sari.id, created.id);

    expect(await addresses.list(sari.id)).toHaveLength(1);
  });

  it('refuses another customer’s address', async () => {
    const theirs = await addresses.create(rani.id, address());

    await expect(addresses.setDefault(sari.id, theirs.id)).rejects.toMatchObject({
      status: 404,
      code: 'ADDRESS_NOT_FOUND',
    });
  });
});
