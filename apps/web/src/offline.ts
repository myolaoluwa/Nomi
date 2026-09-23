import type { Row, User } from "./lib";
type Pending = {
  id: string;
  userId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};
const name = "nomi-offline-v1";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("profile");
      request.result.createObjectStore("pending", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function operation<T>(
  store: "profile" | "pending",
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode),
      req = run(tx.objectStore(store));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error || req.error);
    };
  });
}
export async function saveOfflineProfile(user: User, categories: Row[]) {
  await operation("profile", "readwrite", (s) =>
    s.put({ user, categories }, "current"),
  );
}
export async function loadOfflineProfile(): Promise<
  { user: User; categories: Row[] } | undefined
> {
  return operation("profile", "readonly", (s) => s.get("current"));
}
export async function queueActivity(
  userId: string,
  payload: Record<string, unknown>,
) {
  const id = String(payload.client_id || crypto.randomUUID());
  await operation("pending", "readwrite", (s) =>
    s.put({
      id,
      userId,
      payload: { ...payload, client_id: id },
      createdAt: new Date().toISOString(),
    }),
  );
  return id;
}
export async function pendingActivities(userId: string): Promise<Pending[]> {
  const all = await operation<Pending[]>("pending", "readonly", (s) =>
    s.getAll(),
  );
  return all.filter((p) => p.userId === userId);
}
export async function removePending(id: string) {
  await operation("pending", "readwrite", (s) => s.delete(id));
}
export async function clearOfflineData() {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["profile", "pending"], "readwrite");
    tx.objectStore("profile").clear();
    tx.objectStore("pending").clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
