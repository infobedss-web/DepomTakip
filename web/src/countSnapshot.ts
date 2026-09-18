export type OfflineSnapshotProduct = {
  stock_id: string;
  location_id: string;
  location_name: string;
  location_code: string;
  product_id: string;
  name: string;
  sku: string;
  barcode: string;
  variant?: string;
  lot?: string | null;
  serial?: string | null;
  units: Array<{
    name: string;
    multiplier: number;
  }>;
};

export type OfflineSnapshot = {
  room: {
    id: string;
    name: string;
    code: string;
    warehouse_id: string;
    starts_at: string;
    ends_at: string;
  };
  assignments: Array<{
    location_id: string;
    location_name: string;
    location_code: string;
    approved: boolean;
    finished_at?: string | null;
  }>;
  products: OfflineSnapshotProduct[];
  cached_at: string;
};

const DB_NAME = 'bedss-count-cache';
const VERSION = 1;
const STORE = 'snapshots';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request =
      indexedDB.open(DB_NAME, VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, {
          keyPath: 'room.id',
        });
      }
    };

    request.onsuccess = () =>
      resolve(request.result);

    request.onerror = () =>
      reject(request.error);
  });
}

export async function saveCountSnapshot(
  snapshot: OfflineSnapshot,
) {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx =
      db.transaction(STORE, 'readwrite');

    tx.objectStore(STORE).put(snapshot);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

export async function getCountSnapshot(
  roomId: string,
): Promise<OfflineSnapshot | null> {
  const db = await openDb();

  const result =
    await new Promise<OfflineSnapshot | null>(
      (resolve, reject) => {
        const tx =
          db.transaction(STORE, 'readonly');

        const request =
          tx.objectStore(STORE).get(roomId);

        request.onsuccess = () =>
          resolve(request.result || null);

        request.onerror = () =>
          reject(request.error);
      },
    );

  db.close();

  return result;
}

export function findSnapshotProduct(
  snapshot: OfflineSnapshot,
  value: string,
  options: {
    lot?: string;
    serial?: string;
    location_code?: string;
  } = {},
): OfflineSnapshotProduct {
  const code = value.trim();

  const matches = snapshot.products.filter(
    (p) =>
      (p.barcode === code || p.sku === code) &&
      (!options.lot || p.lot === options.lot) &&
      (!options.serial ||
        p.serial === options.serial) &&
      (!options.location_code ||
        p.location_code ===
          options.location_code),
  );

  if (!matches.length) {
    throw new Error(
      'Ürün çevrimdışı sayım verisinde bulunamadı.',
    );
  }

  if (matches.length > 1) {
    throw new Error(
      'Birden fazla stok bulundu. Lot, seri veya hücre kodunu girin.',
    );
  }

  return matches[0];
}