import type { Row } from './api';

const DB_NAME = 'bedss-offline-session';
const DB_VERSION = 1;
const STORE = 'state';

type StoredValue = {
  key: string;
  value: unknown;
  updated_at: string;
};

export type OfflineActiveLocation = {
  location_id: string;
  name: string;
  code: string;
};

export type OfflineCountState = {
  room_id: string;
  active: OfflineActiveLocation | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request =
      indexedDB.open(
        DB_NAME,
        DB_VERSION,
      );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (
        !db.objectStoreNames.contains(
          STORE,
        )
      ) {
        db.createObjectStore(
          STORE,
          {
            keyPath: 'key',
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

async function setValue(
  key: string,
  value: unknown,
) {
  const db = await openDb();

  await new Promise<void>(
    (resolve, reject) => {
      const tx =
        db.transaction(
          STORE,
          'readwrite',
        );

      tx.objectStore(STORE).put({
        key,
        value,
        updated_at:
          new Date().toISOString(),
      } satisfies StoredValue);

      tx.oncomplete = () =>
        resolve();

      tx.onerror = () =>
        reject(tx.error);
    },
  );

  db.close();
}

async function getValue<T>(
  key: string,
): Promise<T | null> {
  const db = await openDb();

  const result =
    await new Promise<StoredValue | null>(
      (resolve, reject) => {
        const tx =
          db.transaction(
            STORE,
            'readonly',
          );

        const request =
          tx.objectStore(
            STORE,
          ).get(key);

        request.onsuccess = () =>
          resolve(
            request.result ||
              null,
          );

        request.onerror = () =>
          reject(request.error);
      },
    );

  db.close();

  return (
    (result?.value as T) ??
    null
  );
}

async function deleteValue(
  key: string,
) {
  const db = await openDb();

  await new Promise<void>(
    (resolve, reject) => {
      const tx =
        db.transaction(
          STORE,
          'readwrite',
        );

      tx.objectStore(STORE).delete(key);

      tx.oncomplete = () =>
        resolve();

      tx.onerror = () =>
        reject(tx.error);
    },
  );

  db.close();
}

export async function saveOfflineUser(
  user: Row,
) {
  await setValue(
    'user',
    user,
  );
}

export async function getOfflineUser():
  Promise<Row | null> {
  return getValue<Row>('user');
}

export async function clearOfflineUser() {
  await deleteValue('user');
}

export async function saveActiveCountState(
  state: OfflineCountState,
) {
  await setValue(
    'active-count',
    state,
  );
}

export async function getActiveCountState():
  Promise<OfflineCountState | null> {
  return getValue<OfflineCountState>(
    'active-count',
  );
}

export async function clearActiveCountState() {
  await deleteValue(
    'active-count',
  );
}