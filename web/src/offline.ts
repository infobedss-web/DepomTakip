import { API_BASE } from './api';
import { getOfflineUser } from './offlineSession';
import {
  deleteOfflinePhoto,
  getOfflineOperations,
  getOfflinePhoto,
  saveOfflineOperation,
  updateOfflineOperation,
  recoverStuckOfflineOperations,
  type OfflineOperation,
} from './offlineDb';

export type SyncResult = {
  synced: number;
  failed: number;
  conflict: number;
};

function getDeviceId(): string {
  const key = 'bedss_device_id';
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
}

export function createClientOperationId(): string {
  return crypto.randomUUID();
}

export async function queueOfflineOperation(
  path: string,
  method: string,
  body: unknown,
): Promise<OfflineOperation> {
  const now = new Date().toISOString();
  const user = await getOfflineUser();
  if (!user?.id) throw new Error('Çevrimdışı işlem için kullanıcı oturumu bulunamadı.');

  const operation: OfflineOperation = {
    client_operation_id: createClientOperationId(),
    business_id: (user.business_id as string | null) ?? null,
    user_id: String(user.id),
    device_id: getDeviceId(),
    path,
    method,
    body,
    created_at: now,
    updated_at: now,
    attempts: 0,
    status: 'PENDING',
  };

  await saveOfflineOperation(operation);

  window.dispatchEvent(
    new CustomEvent('bedss-offline-queue-change'),
  );

  return operation;
}

export async function syncOfflineOperations(): Promise<SyncResult> {
  if (!navigator.onLine) {
    return {
      synced: 0,
      failed: 0,
      conflict: 0,
    };
  }

  const user = await getOfflineUser();
  if (!user?.id) return { synced: 0, failed: 0, conflict: 0 };
  const scope = { user_id: String(user.id), business_id: (user.business_id as string | null) ?? null };
  await recoverStuckOfflineOperations(scope);
  const operations = await getOfflineOperations(['PENDING', 'FAILED'], scope);

  let synced = 0;
  let failed = 0;
  let conflict = 0;

  for (const operation of operations) {
    await updateOfflineOperation(
      operation.client_operation_id,
      {
        status: 'SYNCING',
        attempts: operation.attempts + 1,
        last_error: '',
      },
    );

    try {
      let requestBody =
        operation.body as any;

      let uploadedPhotoId:
        string | null = null;

      const localPhotoId =
        requestBody?.offline_photo_id;

      if (localPhotoId) {
        const photo =
          await getOfflinePhoto(
            localPhotoId,
          );

        if (!photo) {
          throw new Error(
            'Çevrimdışı fotoğraf cihazda bulunamadı.',
          );
        }

        const form =
          new FormData();

        form.set(
          'photo',
          new File(
            [photo.blob],
            photo.name,
            {
              type: photo.type,
            },
          ),
        );

        const photoResponse =
          await fetch(
            API_BASE + '/api/photos',
            {
              method: 'POST',
              credentials:
                'include',
              body: form,
            },
          );

        const photoData =
          await photoResponse
            .json()
            .catch(() => ({}));

        if (
          !photoResponse.ok
        ) {
          throw new Error(
            photoData?.error ||
              `Fotoğraf yüklenemedi. HTTP ${photoResponse.status}`,
          );
        }

        uploadedPhotoId =
          photoData.id;

        requestBody = {
          ...requestBody,
          photo_id:
            uploadedPhotoId,
        };

        delete requestBody.offline_photo_id;
      }

      const response = await fetch(
        API_BASE + '/api' + operation.path,
        {
          method:
            operation.method,
          credentials:
            'include',
          headers: {
            'Content-Type':
              'application/json',
            'X-Client-Operation-Id':
              operation.client_operation_id,
          },
          body:
            requestBody === undefined
              ? undefined
              : JSON.stringify(
                  requestBody,
                ),
        },
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (response.ok) {
        await updateOfflineOperation(
          operation.client_operation_id,
          {
            status: 'SYNCED',
            last_error: '',
          },
        );

        if (localPhotoId) {
          await deleteOfflinePhoto(
            localPhotoId,
          );
        }

        synced++;
        continue;
      }

      if (response.status === 409) {
        await updateOfflineOperation(
          operation.client_operation_id,
          {
            status: 'CONFLICT',
            last_error:
              data?.error || 'Senkronizasyon çakışması.',
          },
        );

        conflict++;
        continue;
      }

      await updateOfflineOperation(
        operation.client_operation_id,
        {
          status: 'FAILED',
          last_error:
            data?.error ||
            `HTTP ${response.status}`,
        },
      );

      failed++;
    } catch (error) {
      await updateOfflineOperation(
        operation.client_operation_id,
        {
          status: 'FAILED',
          last_error:
            error instanceof Error
              ? error.message
              : 'Bağlantı hatası',
        },
      );

      failed++;
      break;
    }
  }

  window.dispatchEvent(
    new CustomEvent('bedss-offline-queue-change'),
  );

  return {
    synced,
    failed,
    conflict,
  };
}

let syncRunning = false;

export async function triggerOfflineSync() {
  if (syncRunning || !navigator.onLine) return;

  syncRunning = true;

  try {
    await syncOfflineOperations();
  } finally {
    syncRunning = false;
  }
}

export function installOfflineSyncListeners() {
  window.addEventListener('online', () => {
    void triggerOfflineSync();
  });

  document.addEventListener(
    'visibilitychange',
    () => {
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine
      ) {
        void triggerOfflineSync();
      }
    },
  );
}