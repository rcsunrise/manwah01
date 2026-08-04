import { HistoryItem, PromptTemplate, StorageStats } from "../types";
import { supabase } from "../lib/supabase";

const DB_NAME = 'YingjiaDB';
const DB_VERSION = 1;
const STORE_HISTORY = 'history';
const STORE_TEMPLATES = 'templates';

// 5GB in Bytes
export const MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024; 

/* 
 * SQL Helper for Supabase Table `system_prompts`
 * 请在 Supabase SQL Editor 中运行此脚本，创建全局预设库：
 *
 * CREATE TABLE IF NOT EXISTS public.system_prompts (
 *   id TEXT PRIMARY KEY,
 *   name TEXT NOT NULL,
 *   content TEXT NOT NULL,
 *   role TEXT,
 *   timestamp BIGINT NOT NULL
 * );
 *
 * -- 开启RLS保护
 * ALTER TABLE public.system_prompts ENABLE ROW LEVEL SECURITY;
 * 
 * -- 允许任何人读取全局系统指令
 * CREATE POLICY "Allow public read-access to system prompts" 
 *   ON public.system_prompts FOR SELECT 
 *   USING (true);
 *
 * -- 允许鉴权用户写入（你可以修改为仅限特定管理员邮箱等）
 * CREATE POLICY "Allow authenticated users to insert system prompts" 
 *   ON public.system_prompts FOR INSERT 
 *   WITH CHECK (auth.role() = 'authenticated');
 * 
 * CREATE POLICY "Allow authenticated users to update system prompts" 
 *   ON public.system_prompts FOR UPDATE 
 *   USING (auth.role() = 'authenticated');
 *
 * CREATE POLICY "Allow authenticated users to delete system prompts" 
 *   ON public.system_prompts FOR DELETE 
 *   USING (auth.role() = 'authenticated');
 */

class DBService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject("Error opening database");

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_HISTORY)) {
          const store = db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
          db.createObjectStore(STORE_TEMPLATES, { keyPath: 'id' });
        }
      };
    });
  }

  // Helper to calculate string size in bytes (approximate for base64)
  private calculateSize(str: string): number {
    return new Blob([str]).size;
  }

  // --- History Methods ---

  async saveToHistory(item: Omit<HistoryItem, 'size'>): Promise<void> {
    await this.init();
    const size = this.calculateSize(item.imageUrl) + this.calculateSize(item.prompt);
    const fullItem: HistoryItem = { ...item, size };

    // 1. Save to local IndexedDB for immediate responsive offline cache
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_HISTORY, 'readwrite');
      const store = tx.objectStore(STORE_HISTORY);
      store.add(fullItem);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject("Failed to save to history");
    });

    // 2. Persist seamlessly to Supabase `generation_history` table
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      const sbRecord = {
        id: item.id || `hist_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        user_id: userId,
        prompt: item.prompt,
        image_url: item.imageUrl,
        parameters: {
          roleUsed: item.roleUsed,
          model: item.model
        },
        size,
        timestamp: item.timestamp || Date.now()
      };

      await supabase.from('generation_history').upsert(sbRecord);
    } catch (e) {
      console.warn("Supabase history save non-blocking warning:", e);
    }
  }

  async getHistory(): Promise<HistoryItem[]> {
    await this.init();

    // 1. Get local IndexedDB history items
    let localResults: HistoryItem[] = await new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_HISTORY, 'readonly');
      const store = tx.objectStore(STORE_HISTORY);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev');
      const results: HistoryItem[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject("Failed to fetch history");
    });

    // 2. Fetch remote Supabase history items
    try {
      const { data, error } = await supabase
        .from('generation_history')
        .select('*')
        .order('timestamp', { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        const remoteItems: HistoryItem[] = data.map(row => ({
          id: row.id,
          prompt: row.prompt,
          imageUrl: row.image_url,
          roleUsed: row.parameters?.roleUsed,
          model: (row.parameters?.model || 'gemini-2.5-flash') as any,
          timestamp: Number(row.timestamp) || Date.now(),
          size: Number(row.size) || 0
        }));

        // Merge remote items with local items by ID or timestamp
        const localIds = new Set(localResults.map(i => i.id));
        remoteItems.forEach(ri => {
          if (!localIds.has(ri.id)) {
            localResults.push(ri);
          }
        });

        // Re-sort newest first
        localResults.sort((a, b) => b.timestamp - a.timestamp);
      }
    } catch (e) {
      console.warn("Supabase history sync warning:", e);
    }

    return localResults;
  }

  async deleteHistoryItem(id: string): Promise<void> {
    await this.init();

    // Delete locally
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_HISTORY, 'readwrite');
      const store = tx.objectStore(STORE_HISTORY);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject("Failed to delete item");
    });

    // Delete on Supabase
    try {
      await supabase.from('generation_history').delete().eq('id', id);
    } catch (e) {
      console.warn("Supabase delete history item warning:", e);
    }
  }

  async deleteHistoryItems(ids: string[]): Promise<void> {
    await this.init();

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_HISTORY, 'readwrite');
      const store = tx.objectStore(STORE_HISTORY);
      ids.forEach(id => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject("Failed to delete items");
    });

    try {
      for (const id of ids) {
        await supabase.from('generation_history').delete().eq('id', id);
      }
    } catch (e) {
      console.warn("Supabase delete history items warning:", e);
    }
  }

  async clearHistory(): Promise<void> {
    await this.init();

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_HISTORY, 'readwrite');
      const store = tx.objectStore(STORE_HISTORY);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject("Failed to clear history");
    });

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        await supabase.from('generation_history').delete().eq('user_id', userId);
      } else {
        await supabase.from('generation_history').delete();
      }
    } catch (e) {
      console.warn("Supabase clear history warning:", e);
    }
  }

  // --- Template Methods ---

  async syncTemplates(templates: PromptTemplate[]): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
        const tx = this.db!.transaction(STORE_TEMPLATES, 'readwrite');
        const store = tx.objectStore(STORE_TEMPLATES);
        templates.forEach(t => store.put(t));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject("Failed to sync templates");
    });
  }

  async saveTemplate(template: PromptTemplate): Promise<void> {
    if (template.id.startsWith('p')) {
      try {
        const { error } = await supabase.from('system_prompts').upsert(template);
        if (error) console.warn("Failed to update system prompt. Requires admin privileges or table does not exist:", error);
      } catch (e) {
        console.warn("Exception updating system prompt:", e);
      }
      return; // Do not save system prompts into personal local storage
    }

    // Save personal templates to local IndexedDB ONLY to prevent JWT header bloat
    await this.init();
    return new Promise((resolve, reject) => {
        const tx = this.db!.transaction(STORE_TEMPLATES, 'readwrite');
        const store = tx.objectStore(STORE_TEMPLATES);
        store.put(template); // put allows update if id exists
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject("Failed to save template");
    });
  }

  async getSystemTemplatesFromDB(): Promise<PromptTemplate[]> {
    try {
      const { data, error } = await supabase
        .from('system_prompts')
        .select('*')
        .order('id', { ascending: true }); // p0, p1 etc

      if (!error && data && data.length > 0) {
        return data as PromptTemplate[];
      }
    } catch (e) {
      console.warn("Error fetching system templates from DB", e);
    }
    return [];
  }

  async getTemplates(): Promise<PromptTemplate[]> {
    let personalTemplates: PromptTemplate[] = [];

    // Migrate existing bloated metadata from user_metadata to prevent 400 Nginx errors
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (user && user.user_metadata?.prompt_templates) {
         personalTemplates = user.user_metadata.prompt_templates;
         // Clear it from Supabase so the JWT shrinks on the next token refresh!
         await supabase.auth.updateUser({
            data: { prompt_templates: null }
         });
      }
    } catch (e) {
      console.warn("Failed to check Supabase user_metadata for migration.", e);
    }

    await this.init();
    let localTemplates: PromptTemplate[] = await new Promise((resolve, reject) => {
        const tx = this.db!.transaction(STORE_TEMPLATES, 'readonly');
        const store = tx.objectStore(STORE_TEMPLATES);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject("Failed to fetch templates");
    });

    // Merge migrated templates with local ones
    if (personalTemplates.length > 0) {
       for (const pt of personalTemplates) {
          if (!localTemplates.find(t => t.id === pt.id)) {
             localTemplates.push(pt);
             // Save it locally since we just migrated it
             this.saveTemplate(pt).catch(e => console.warn(e));
          }
       }
    }
    personalTemplates = localTemplates;

    // Now get system templates
    let systemTemplates = await this.getSystemTemplatesFromDB();

    // Remove duplicates from personal that match system IDs (just in case they got blended previously)
    const systemIds = new Set(systemTemplates.map(t => t.id));
    personalTemplates = personalTemplates.filter(t => !systemIds.has(t.id) && !t.id.startsWith('p'));

    return [...systemTemplates, ...personalTemplates];
  }

  async deleteTemplate(id: string): Promise<void> {
    if (id.startsWith('p')) {
      try {
        const { error } = await supabase.from('system_prompts').delete().eq('id', id);
        if (error) console.warn("Failed to delete system prompt. Requires admin privileges or table does not exist:", error);
      } catch (e) {
        console.warn("Exception deleting system prompt:", e);
      }
      return;
    }

    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_TEMPLATES, 'readwrite');
      const store = tx.objectStore(STORE_TEMPLATES);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject("Failed to delete template");
    });
  }


  // --- Stats ---

  async getStorageStats(): Promise<StorageStats> {
    await this.init();
    const history = await this.getHistory();
    let totalBytes = 0;
    history.forEach(item => totalBytes += item.size);
    return {
      usedBytes: totalBytes,
      fileCount: history.length
    };
  }
}

export const dbService = new DBService();