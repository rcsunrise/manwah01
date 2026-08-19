import { createClient } from '@supabase/supabase-js';

const safeProcessEnv = typeof process !== 'undefined' ? process.env : {} as Record<string, string | undefined>;

const isPlaceholder = (val: string | undefined) => !val || val.includes('在这里填入') || val.includes('placeholder');

// Server-side env vars
const serverUrl = typeof process !== 'undefined' ? (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '') : '';
const serverServiceKey = typeof process !== 'undefined' ? (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '') : '';

function createMockSupabaseClient() {
  const demoUser = {
    id: 'demo-user-001',
    email: 'demo@manwah.com',
    user_metadata: { name: '敏华体验用户', role: 'user' },
    role: 'user'
  };
  const demoSession = {
    access_token: 'local-mock-session',
    token_type: 'bearer',
    user: demoUser
  };

  const serverMockStores: Record<string, any[]> = (globalThis as any).__SUPABASE_MOCK_STORES__ || {};
  (globalThis as any).__SUPABASE_MOCK_STORES__ = serverMockStores;

  const loadMockStore = (tableName: string): any[] => {
    let memoryData = serverMockStores[tableName];
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(`manwah_sb_mock_${tableName}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
    }
    return memoryData || [];
  };

  const saveMockStore = (tableName: string, data: any[]) => {
    serverMockStores[tableName] = data;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`manwah_sb_mock_${tableName}`, JSON.stringify(data));
      } catch (e) {
        console.warn(`[SupabaseMock] Failed to write mock store for table ${tableName}:`, e);
      }
    }
  };

  const getTableDefaultData = (tableName: string, isSingle: boolean) => {
    const stored = loadMockStore(tableName);
    if (stored.length > 0) {
      return isSingle ? stored[0] : stored;
    }

    if (tableName === 'profiles') {
      const p = { id: 'demo-user-001', name: '敏华体验用户', dept_id: 'dept-1', quota_limit: 100000, quota_used: 1200, role: 'user' };
      return isSingle ? p : [p];
    }
    if (tableName === 'departments') {
      const d = { id: 'dept-1', name: '全站系统', quota_limit: 1000000, quota_used: 10000 };
      return isSingle ? d : [d];
    }
    if (tableName === 'department_configs') {
      const c = { api_key: '', api_base_url: 'https://generativelanguage.googleapis.com/v1beta', dept_name: '全站系统', routing_mode: 'google' };
      return isSingle ? c : [c];
    }
    return isSingle ? null : [];
  };

  const mockFrom = (tableName: string) => {
    let isSingle = false;
    let operation = 'select';
    let payloadData: any = null;
    const eqFilters: Array<{ field: string; value: any }> = [];
    let orFilterStr: string | null = null;

    const builder: any = {
      select: () => {
        // Supabase supports mutation().select(); selecting the representation
        // must not turn the pending mutation back into a read operation.
        if (operation === 'select') operation = 'select';
        return builder;
      },
      insert: (records: any) => {
        operation = 'insert';
        payloadData = records;
        return builder;
      },
      update: (records: any) => {
        operation = 'update';
        payloadData = records;
        return builder;
      },
      upsert: (records: any) => {
        operation = 'upsert';
        payloadData = records;
        return builder;
      },
      delete: () => {
        operation = 'delete';
        return builder;
      },
      eq: (field: string, value: any) => {
        eqFilters.push({ field, value });
        return builder;
      },
      or: (clause: string) => {
        orFilterStr = clause;
        return builder;
      },
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      gte: () => builder,
      lte: () => builder,
      match: () => builder,
      single: () => {
        isSingle = true;
        return builder;
      },
      maybeSingle: () => {
        isSingle = true;
        return builder;
      },
      then: (resolve: any, reject: any) => {
        try {
          let currentStore = loadMockStore(tableName);
          if (currentStore.length === 0) {
            const defaults = getTableDefaultData(tableName, false);
            if (Array.isArray(defaults) && defaults.length > 0) {
              currentStore = defaults;
            }
          }

          if (operation === 'insert' || operation === 'upsert') {
            const newItems = Array.isArray(payloadData) ? payloadData : [payloadData];
            newItems.forEach(item => {
              const idx = currentStore.findIndex((x: any) => x.id === item.id || (
                eqFilters.length > 0 && eqFilters.every(filter => x[filter.field] === filter.value)
              ));
              if (idx >= 0) {
                currentStore[idx] = { ...currentStore[idx], ...item, updated_at: new Date().toISOString() };
              } else {
                currentStore.push({ ...item, created_at: item.created_at || new Date().toISOString() });
              }
            });
            saveMockStore(tableName, currentStore);
            const returnedData = isSingle ? newItems[0] : newItems;
            return resolve({ data: returnedData, error: null });
          }

          if (operation === 'update') {
            currentStore = currentStore.map((item: any) => {
              if (eqFilters.length === 0 || eqFilters.every(filter => item[filter.field] === filter.value)) {
                return { ...item, ...payloadData, updated_at: new Date().toISOString() };
              }
              return item;
            });
            saveMockStore(tableName, currentStore);
            return resolve({ data: isSingle ? currentStore[0] : currentStore, error: null });
          }

          if (operation === 'delete') {
            if (eqFilters.length > 0) {
              currentStore = currentStore.filter((item: any) => !eqFilters.every(filter => item[filter.field] === filter.value));
            } else {
              currentStore = [];
            }
            saveMockStore(tableName, currentStore);
            return resolve({ data: null, error: null });
          }

          // Select query
          let filtered = currentStore;
          if (eqFilters.length > 0) {
            filtered = currentStore.filter((item: any) => eqFilters.every(filter => item[filter.field] === filter.value));
          } else if (orFilterStr) {
            const conditions = orFilterStr.split(',').map(s => s.trim().split('.eq.'));
            filtered = currentStore.filter((item: any) => {
              return conditions.some(([field, val]) => {
                if (field && val && item[field] !== undefined) {
                  return String(item[field]) === String(val);
                }
                return false;
              });
            });
          }

          // A filtered maybeSingle/single query must not fall back to an
          // unrelated first row. Real Supabase returns null when no record
          // matches the filter.
          const hasFilter = Boolean(eqFilters.length > 0 || orFilterStr);
          const result = isSingle
            ? (filtered[0] || (hasFilter ? null : getTableDefaultData(tableName, true)))
            : filtered;
          resolve({ data: result, error: null, count: Array.isArray(result) ? result.length : (result ? 1 : 0) });
        } catch (e) {
          reject(e);
        }
      }
    };
    return builder;
  };

  const mockStorageMap = new Map<string, { buffer: Buffer | Uint8Array; contentType: string }>();

  const mockStorage = {
    from: (bucket: string) => ({
      upload: async (path: string, fileData: any, options?: any) => {
        let buf: Buffer;
        if (Buffer.isBuffer(fileData)) {
          buf = fileData;
        } else if (typeof fileData === 'string') {
          buf = Buffer.from(fileData);
        } else if (fileData instanceof Uint8Array) {
          buf = Buffer.from(fileData);
        } else {
          buf = Buffer.from(String(fileData));
        }
        mockStorageMap.set(`${bucket}:${path}`, {
          buffer: buf,
          contentType: options?.contentType || 'image/png'
        });
        return { data: { path: path || `obj_${Date.now()}.png` }, error: null };
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `/api/canvases/assets/${path}` }
      }),
      createSignedUrl: async (path: string, _expiresIn: number) => ({
        data: { signedUrl: `/api/canvases/assets/${path}` },
        error: null
      }),
      download: async (path: string) => {
        const item = mockStorageMap.get(`${bucket}:${path}`);
        if (item) {
          return { data: new Blob([item.buffer], { type: item.contentType }), error: null };
        }
        return { data: new Blob([Buffer.from('mock-data')], { type: 'image/png' }), error: null };
      }
    }),
    listBuckets: async () => ({
      data: [{ name: safeProcessEnv.SUPABASE_STORAGE_BUCKET || 'creative-canvas-assets' }],
      error: null
    }),
    createBucket: async () => ({ data: {}, error: null })
  };

  const mockAuth = {
    getSession: async () => ({ data: { session: demoSession }, error: null }),
    getUser: async () => ({ data: { user: demoUser }, error: null }),
    signInWithPassword: async () => ({ data: { user: demoUser, session: demoSession }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: (callback: any) => {
      setTimeout(() => callback('INITIAL_SESSION', demoSession), 10);
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    updateUser: async () => ({ data: { user: demoUser }, error: null }),
    admin: {
      createUser: async () => ({ data: { user: demoUser }, error: null }),
      updateUserById: async () => ({ data: { user: demoUser }, error: null }),
      deleteUser: async () => ({ data: { user: demoUser }, error: null })
    }
  };

  return {
    from: mockFrom,
    storage: mockStorage,
    auth: mockAuth,
    isMock: true
  };
}

function createFailClosedSupabaseClient() {
  console.error('[SUPABASE_RUNTIME_CONFIG_MISSING] 正式环境数据库配置不可用或未配置，以 Fail-Closed 模式拒绝数据操作。');
  const errObj = {
    message: '正式环境数据库配置不可用，请联系管理员',
    code: 'SUPABASE_RUNTIME_CONFIG_MISSING'
  };

  const failFrom = (_tableName: string) => {
    const builder: any = {
      select: () => builder,
      insert: () => builder,
      update: () => builder,
      upsert: () => builder,
      delete: () => builder,
      eq: () => builder,
      or: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => builder,
      maybeSingle: () => builder,
      gte: () => builder,
      lte: () => builder,
      match: () => builder,
      then: (resolve: any) => resolve({ data: null, error: errObj })
    };
    return builder;
  };

  const failStorage = {
    from: (_bucket: string) => ({
      upload: async () => ({ data: null, error: errObj }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      createSignedUrl: async () => ({ data: null, error: errObj }),
      download: async () => ({ data: null, error: errObj })
    }),
    listBuckets: async () => ({ data: [], error: errObj }),
    createBucket: async () => ({ data: null, error: errObj })
  };

  const failAuth = {
    getSession: async () => ({ data: { session: null }, error: errObj }),
    getUser: async () => ({ data: { user: null }, error: errObj }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: errObj }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: (_callback: any) => {
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    updateUser: async () => ({ data: null, error: errObj }),
    admin: {
      createUser: async () => ({ data: null, error: errObj }),
      updateUserById: async () => ({ data: null, error: errObj }),
      deleteUser: async () => ({ data: null, error: errObj })
    }
  };

  return {
    from: failFrom,
    storage: failStorage,
    auth: failAuth,
    isFailClosed: true
  };
}

// 拥有最高权限的 Admin 客户端（仅在 Node.js 即服务端使用）
export const supabaseAdmin = typeof window === 'undefined' ? (
  isPlaceholder(serverUrl) || isPlaceholder(serverServiceKey)
    ? createMockSupabaseClient()
    : createClient(serverUrl, serverServiceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      })
) : (null as any);

// State variables for runtime config
let activeClient: any = null;
let initPromise: Promise<any> | null = null;
let isConfigured = false;
let currentProjectRef = '';
let currentStorageMedium = 'in_memory';

export async function initRuntimeSupabase(): Promise<any> {
  if (activeClient && activeClient !== __SUPABASE_LAZY_PLACEHOLDER__) {
    return activeClient;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (typeof window === 'undefined') {
      // Server-side Node context
      const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      if (!isPlaceholder(url) && !isPlaceholder(anonKey)) {
        activeClient = createClient(url, anonKey);
        isConfigured = true;
        currentStorageMedium = 'supabase_db';
      } else {
        activeClient = createMockSupabaseClient();
      }
      return activeClient;
    }

    // Browser context - fetch /api/runtime-config
    try {
      const res = await fetch('/api/runtime-config', { cache: 'no-store' });
      if (res.ok) {
        const config = await res.json();
        if (config.configured && config.supabaseUrl && config.supabaseAnonKey) {
          activeClient = createClient(config.supabaseUrl, config.supabaseAnonKey);
          isConfigured = true;
          currentProjectRef = config.projectRef || '';
          currentStorageMedium = 'supabase_db';
          console.log(`[SupabaseRuntime] Connected to Supabase projectRef: ${currentProjectRef}`);
          return activeClient;
        }
      }
    } catch (e) {
      console.warn('[SupabaseRuntime] Failed to fetch /api/runtime-config:', e);
    }

    // Fail closed rules:
    // Only allow mock if ENABLE_SUPABASE_MOCK === 'true' AND NOT in production/Published environment
    const isProd = process.env.NODE_ENV === 'production' || window.location.hostname.includes('ai.studio');
    const allowMock = !isProd && (safeProcessEnv.ENABLE_SUPABASE_MOCK === 'true');

    if (allowMock) {
      console.warn('[SupabaseRuntime] Using mock client for local dev mode.');
      activeClient = createMockSupabaseClient();
      currentStorageMedium = 'in_memory';
    } else {
      activeClient = createFailClosedSupabaseClient();
      currentStorageMedium = 'in_memory';
    }
    return activeClient;
  })();

  return initPromise;
}

function createLazyFromBuilder(tableName: string) {
  const chainedCalls: Array<{ method: string; args: any[] }> = [];

  const builder: any = {
    select: (...args: any[]) => { chainedCalls.push({ method: 'select', args }); return builder; },
    insert: (...args: any[]) => { chainedCalls.push({ method: 'insert', args }); return builder; },
    update: (...args: any[]) => { chainedCalls.push({ method: 'update', args }); return builder; },
    upsert: (...args: any[]) => { chainedCalls.push({ method: 'upsert', args }); return builder; },
    delete: (...args: any[]) => { chainedCalls.push({ method: 'delete', args }); return builder; },
    eq: (...args: any[]) => { chainedCalls.push({ method: 'eq', args }); return builder; },
    or: (...args: any[]) => { chainedCalls.push({ method: 'or', args }); return builder; },
    in: (...args: any[]) => { chainedCalls.push({ method: 'in', args }); return builder; },
    order: (...args: any[]) => { chainedCalls.push({ method: 'order', args }); return builder; },
    limit: (...args: any[]) => { chainedCalls.push({ method: 'limit', args }); return builder; },
    single: () => { chainedCalls.push({ method: 'single', args: [] }); return builder; },
    maybeSingle: () => { chainedCalls.push({ method: 'maybeSingle', args: [] }); return builder; },
    gte: (...args: any[]) => { chainedCalls.push({ method: 'gte', args }); return builder; },
    lte: (...args: any[]) => { chainedCalls.push({ method: 'lte', args }); return builder; },
    match: (...args: any[]) => { chainedCalls.push({ method: 'match', args }); return builder; },
    then: (resolve: any, reject: any) => {
      initRuntimeSupabase().then(client => {
        let b = client.from(tableName);
        for (const call of chainedCalls) {
          if (typeof b[call.method] === 'function') {
            b = b[call.method](...call.args);
          }
        }
        return b.then(resolve, reject);
      }).catch(reject);
    }
  };

  return builder;
}

function createLazyAuth() {
  return {
    getSession: async () => {
      const client = await initRuntimeSupabase();
      return client.auth.getSession();
    },
    getUser: async () => {
      const client = await initRuntimeSupabase();
      return client.auth.getUser();
    },
    signInWithPassword: async (credentials: any) => {
      const client = await initRuntimeSupabase();
      return client.auth.signInWithPassword(credentials);
    },
    signOut: async () => {
      const client = await initRuntimeSupabase();
      return client.auth.signOut();
    },
    onAuthStateChange: (callback: any) => {
      let sub: any = null;
      let unsubscribed = false;
      initRuntimeSupabase().then(client => {
        if (!unsubscribed) {
          const res = client.auth.onAuthStateChange(callback);
          sub = res?.data?.subscription;
        }
      });
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              unsubscribed = true;
              if (sub && typeof sub.unsubscribe === 'function') {
                sub.unsubscribe();
              }
            }
          }
        }
      };
    },
    updateUser: async (attributes: any) => {
      const client = await initRuntimeSupabase();
      return client.auth.updateUser(attributes);
    },
    admin: {
      createUser: async (attrs: any) => {
        const client = await initRuntimeSupabase();
        return client.auth.admin?.createUser(attrs);
      },
      updateUserById: async (id: string, attrs: any) => {
        const client = await initRuntimeSupabase();
        return client.auth.admin?.updateUserById(id, attrs);
      },
      deleteUser: async (id: string) => {
        const client = await initRuntimeSupabase();
        return client.auth.admin?.deleteUser(id);
      }
    }
  };
}

function createLazyStorage() {
  return {
    from: (bucket: string) => ({
      upload: async (path: string, fileData: any, options?: any) => {
        const client = await initRuntimeSupabase();
        return client.storage.from(bucket).upload(path, fileData, options);
      },
      getPublicUrl: (path: string) => {
        if (activeClient && activeClient.storage) {
          return activeClient.storage.from(bucket).getPublicUrl(path);
        }
        return { data: { publicUrl: `/api/canvases/assets/${path}` } };
      },
      createSignedUrl: async (path: string, expiresIn: number) => {
        const client = await initRuntimeSupabase();
        return client.storage.from(bucket).createSignedUrl(path, expiresIn);
      },
      download: async (path: string) => {
        const client = await initRuntimeSupabase();
        return client.storage.from(bucket).download(path);
      }
    }),
    listBuckets: async () => {
      const client = await initRuntimeSupabase();
      return client.storage.listBuckets();
    },
    createBucket: async (name: string, options?: any) => {
      const client = await initRuntimeSupabase();
      return client.storage.createBucket(name, options);
    }
  };
}

const _global = typeof window !== 'undefined' ? window : globalThis;

const __SUPABASE_LAZY_PLACEHOLDER__ = new Proxy({} as any, {
  get(_target, prop) {
    if (prop === 'then') return undefined;
    if (prop === 'isConfigured') return isConfigured;
    if (prop === 'projectRef') return currentProjectRef;
    if (prop === 'storageMedium') return currentStorageMedium;

    if (activeClient && activeClient !== __SUPABASE_LAZY_PLACEHOLDER__) {
      const val = activeClient[prop];
      return typeof val === 'function' ? val.bind(activeClient) : val;
    }

    initRuntimeSupabase();

    if (prop === 'from') {
      return (tableName: string) => {
        if (activeClient && activeClient !== __SUPABASE_LAZY_PLACEHOLDER__) {
          return activeClient.from(tableName);
        }
        return createLazyFromBuilder(tableName);
      };
    }

    if (prop === 'auth') {
      return createLazyAuth();
    }

    if (prop === 'storage') {
      return createLazyStorage();
    }

    return (_target as any)[prop];
  }
});

// @ts-ignore
if (!_global.__SUPABASE_CLIENT__) {
  // @ts-ignore
  _global.__SUPABASE_CLIENT__ = __SUPABASE_LAZY_PLACEHOLDER__;
}
// @ts-ignore
export const supabase = _global.__SUPABASE_CLIENT__;

if (typeof window !== 'undefined') {
  initRuntimeSupabase();
}
