export type OfflineOperationStatus =
  | 'PENDING'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED'
  | 'CONFLICT';

export type OfflineOperation = {
  client_operation_id: string;
  business_id: string | null;
  user_id: string;
  device_id: string;
  path: string;
  method: string;
  body: unknown;
  created_at: string;
  updated_at: string;
  attempts: number;
  status: OfflineOperationStatus;
  last_error?: string;
};

const DB_NAME = 'bedss-offline';
const DB_VERSION = 2;
const STORE = 'operations';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: 'client_operation_id',
        });

        store.createIndex('status', 'status', {
          unique: false,
        });

        store.createIndex('created_at', 'created_at', {
          unique: false,
        });
        store.createIndex('user_id', 'user_id', { unique: false });
        store.createIndex('business_id', 'business_id', { unique: false });
      } else {
        const tx = request.transaction;
        const store = tx?.objectStore(STORE);
        if (store && !store.indexNames.contains('user_id')) store.createIndex('user_id', 'user_id', { unique: false });
        if (store && !store.indexNames.contains('business_id')) store.createIndex('business_id', 'business_id', { unique: false });
        // V1 kayıtlarında kullanıcı/firma sahipliği yoktu. Tenant verisi karışmasın diye güvenli şekilde temizlenir.
        if (oldVersion < 2 && store) store.clear();
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOfflineOperation(
  operation: OfflineOperation,
): Promise<void> {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(operation);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

export async function getOfflineOperations(
  statuses: OfflineOperationStatus[] = ['PENDING', 'FAILED'],
  scope?: { user_id: string; business_id: string | null },
): Promise<OfflineOperation[]> {
  const db = await openDb();

  const rows = await new Promise<OfflineOperation[]>(
    (resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');

      const request =
        tx.objectStore(STORE).getAll();

      request.onsuccess = () => {
        const values =
          (request.result || []) as OfflineOperation[];

        resolve(
          values
            .filter((x) => statuses.includes(x.status))
            .filter(
              (x) =>
                !scope ||
                (x.user_id === scope.user_id &&
                  x.business_id === scope.business_id),
            )
            .sort((a, b) =>
              a.created_at.localeCompare(b.created_at),
            ),
        );
      };

      request.onerror = () => reject(request.error);
    },
  );

  db.close();
  return rows;
}

export async function updateOfflineOperation(
  id: string,
  patch: Partial<OfflineOperation>,
): Promise<void> {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get = store.get(id);

    get.onsuccess = () => {
      if (!get.result) return;

      store.put({
        ...get.result,
        ...patch,
        updated_at: new Date().toISOString(),
      });
    };

    get.onerror = () => reject(get.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

export async function deleteOfflineOperation(
  id: string,
): Promise<void> {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');

    tx.objectStore(STORE).delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

export async function recoverStuckOfflineOperations(scope?: { user_id: string; business_id: string | null }): Promise<void> {
  const rows = await getOfflineOperations(['SYNCING'], scope);
  await Promise.all(rows.map((row) => updateOfflineOperation(row.client_operation_id, {
    status: 'PENDING',
    last_error: 'Önceki senkronizasyon yarıda kaldı; yeniden denenecek.',
  })));
}

export async function purgeOfflineOperationsForUser(userId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      for (const row of request.result as OfflineOperation[]) {
        if (row.user_id === userId) store.delete(row.client_operation_id);
      }
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function offlineQueueCount(): Promise<number> {
  const rows = await getOfflineOperations([
    'PENDING',
    'FAILED',
    'CONFLICT',
    'SYNCING',
  ]);

  return rows.length;
}
export async function getPendingOfflineCount(): Promise<number> {
  const rows = await getOfflineOperations([
    'PENDING',
    'FAILED',
    'CONFLICT',
    'SYNCING',
  ]);

  return rows.filter(
    (x) =>
      x.path === '/count/offline-submit',
  ).length;
}
const PHOTO_DB_NAME = 'bedss-offline-photos';
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE = 'photos';

export type OfflinePhoto = {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  created_at: string;
};

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request =
      indexedDB.open(
        PHOTO_DB_NAME,
        PHOTO_DB_VERSION,
      );

    request.onupgradeneeded = (event) => {
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      const db = request.result;

      if (
        !db.objectStoreNames.contains(
          PHOTO_STORE,
        )
      ) {
        db.createObjectStore(
          PHOTO_STORE,
          {
            keyPath: 'id',
          },
        );
      }
    };

    request.onsuccess = () =>
      resolve(request.result);

    request.onerror = () =>
      reject(request.error);
  });
}

export async function saveOfflinePhoto(
  file: File,
): Promise<string> {
  const db = await openPhotoDb();

  const id = crypto.randomUUID();

  const photo: OfflinePhoto = {
    id,
    blob: file,
    name: file.name || 'offline-photo.jpg',
    type:
      file.type ||
      'image/jpeg',
    size: file.size,
    created_at:
      new Date().toISOString(),
  };

  await new Promise<void>(
    (resolve, reject) => {
      const tx =
        db.transaction(
          PHOTO_STORE,
          'readwrite',
        );

      tx.objectStore(
        PHOTO_STORE,
      ).put(photo);

      tx.oncomplete = () =>
        resolve();

      tx.onerror = () =>
        reject(tx.error);
    },
  );

  db.close();

  return id;
}

export async function getOfflinePhoto(
  id: string,
): Promise<OfflinePhoto | null> {
  const db = await openPhotoDb();

  const photo =
    await new Promise<OfflinePhoto | null>(
      (resolve, reject) => {
        const tx =
          db.transaction(
            PHOTO_STORE,
            'readonly',
          );

        const request =
          tx.objectStore(
            PHOTO_STORE,
          ).get(id);

        request.onsuccess = () =>
          resolve(
            request.result ||
              null,
          );

        request.onerror = () =>
          reject(
            request.error,
          );
      },
    );

  db.close();

  return photo;
}

export async function deleteOfflinePhoto(
  id: string,
): Promise<void> {
  const db = await openPhotoDb();

  await new Promise<void>(
    (resolve, reject) => {
      const tx =
        db.transaction(
          PHOTO_STORE,
          'readwrite',
        );

      tx.objectStore(
        PHOTO_STORE,
      ).delete(id);

      tx.oncomplete = () =>
        resolve();

      tx.onerror = () =>
        reject(tx.error);
    },
  );

  db.close();
}