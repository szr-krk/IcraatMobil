const DB_NAME = 'icraat-mobil';
const DB_VERSION = 1;
const EVK_STORE = 'evks';
const SETTINGS_STORE = 'settings';

let databasePromise;

export function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(EVK_STORE)) {
        const store = database.createObjectStore(EVK_STORE, { keyPath: 'evkId' });
        store.createIndex('sourceUnit', 'sourceUnit', { unique: false });
        store.createIndex('reportPeriod', 'reportPeriod', { unique: false });
        store.createIndex('startEpochMillis', 'startEpochMillis', { unique: false });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Veritabanı başka bir sekmede güncelleniyor.'));
  });
  return databasePromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllEvks() {
  const database = await openDatabase();
  const transaction = database.transaction(EVK_STORE, 'readonly');
  return requestResult(transaction.objectStore(EVK_STORE).getAll());
}

export async function getEvk(evkId) {
  const database = await openDatabase();
  const transaction = database.transaction(EVK_STORE, 'readonly');
  return requestResult(transaction.objectStore(EVK_STORE).get(evkId));
}

export async function putEvk(evk) {
  const database = await openDatabase();
  const transaction = database.transaction(EVK_STORE, 'readwrite');
  await requestResult(transaction.objectStore(EVK_STORE).put(evk));
  return evk;
}

export async function putManyEvks(evks) {
  if (!evks.length) return;
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(EVK_STORE, 'readwrite');
    const store = transaction.objectStore(EVK_STORE);
    evks.forEach(evk => store.put(evk));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Kayıt işlemi tamamlanamadı.'));
  });
}

export async function deleteEvk(evkId) {
  const database = await openDatabase();
  const transaction = database.transaction(EVK_STORE, 'readwrite');
  await requestResult(transaction.objectStore(EVK_STORE).delete(evkId));
}

export async function deleteAllEvks() {
  const database = await openDatabase();
  const transaction = database.transaction(EVK_STORE, 'readwrite');
  await requestResult(transaction.objectStore(EVK_STORE).clear());
}

export async function updateEvk(evkId, mutator) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EVK_STORE, 'readwrite');
    const store = transaction.objectStore(EVK_STORE);
    const readRequest = store.get(evkId);
    let updated;
    readRequest.onsuccess = () => {
      const current = readRequest.result;
      if (!current) {
        transaction.abort();
        reject(new Error('EVK bulunamadı.'));
        return;
      }
      try {
        updated = mutator(structuredClone(current));
        if (!updated) {
          transaction.abort();
          reject(new Error('EVK güncellemesi geçersiz.'));
          return;
        }
        store.put(updated);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };
    readRequest.onerror = () => reject(readRequest.error);
    transaction.oncomplete = () => resolve(updated);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => {
      if (transaction.error) reject(transaction.error);
    };
  });
}

export async function getSetting(key, fallback = null) {
  const database = await openDatabase();
  const transaction = database.transaction(SETTINGS_STORE, 'readonly');
  const value = await requestResult(transaction.objectStore(SETTINGS_STORE).get(key));
  return value ? value.value : fallback;
}

export async function setSetting(key, value) {
  const database = await openDatabase();
  const transaction = database.transaction(SETTINGS_STORE, 'readwrite');
  await requestResult(transaction.objectStore(SETTINGS_STORE).put({ key, value }));
}

export async function evkIdExists(evkId) {
  return Boolean(await getEvk(evkId));
}
