import Logger from '@/utils/logger';

interface RelayData {
  timestamp: number;
  data: {
    verifiedHardware: { [key: string]: Number };
    verified: {
      address: string;
      fingerprint: string;
      status: string;
      active: boolean;
      class: string;
    }[];
    claimable: {
      address: string;
      fingerprint: string;
      status: string;
      active: boolean;
      class: string;
    }[];
    state: any;
    nicknames: { [key: string]: string };
    registrationCredits: string[];
  };
}

class RelayCache {
  private dbName: string;
  private objectStoreName: string;
  private readonly logger = new Logger('RelayCache');
  private cacheDuration = 30 * 1000; // Cache duration in milliseconds

  constructor() {
    this.dbName = 'relayDataDB';
    this.objectStoreName = 'relays';
  }

  public clearCache(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);

      request.onerror = () => {
        this.logger.error('Failed to clear IndexedDB cache');
        reject(new Error('Failed to clear IndexedDB cache'));
      };

      request.onsuccess = () => {
        this.logger.info('IndexedDB cache cleared successfully');
        resolve();
      };
    });
  }

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        this.logger.error('Failed to open the IndexedDB database');
        reject(new Error('Failed to open the IndexedDB database'));
      };

      request.onsuccess = () => {
        this.logger.info('IndexedDB database opened successfully');
        resolve(request.result);
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.objectStoreName)) {
          const objectStore = db.createObjectStore(this.objectStoreName);
          // Optionally define indices if needed
          this.logger.info('Created object store:', this.objectStoreName);
        }
      };
    });
  }

  public async getRelayData<Data = any>(
    forceRefresh = false
  ): Promise<Data | null> {
    try {
      const db = await this.openDB();

      if (forceRefresh) {
        return null;
      }

      const fromCache = await new Promise<RelayData | null>(
        (resolve, reject) => {
          const transaction = db.transaction(this.objectStoreName, 'readonly');
          const objectStore = transaction.objectStore(this.objectStoreName);
          const request = objectStore.get('relays');

          request.onerror = () => {
            this.logger.error('Failed to get relay data from IndexedDB');
            reject(new Error('Failed to get relay data from IndexedDB'));
          };

          request.onsuccess = () => {
            resolve(request.result as RelayData | null);
          };
        }
      );

      if (fromCache) {
        this.logger.info(`Cache hit for relayDB`, fromCache);
      }

      if (fromCache && Date.now() - fromCache.timestamp < this.cacheDuration) {
        this.logger.info('Returning cached data:', fromCache.data);
        return fromCache.data as Data;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to get relay data', error);
      return null;
    }
  }

  public async saveRelayData(data: any): Promise<void> {
    try {
      const db = await this.openDB();
      const timestamp = Date.now();

      const relayData: RelayData = {
        timestamp,
        data,
      };

      this.logger.info('Saving data in relay cache', relayData);

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.objectStoreName, 'readwrite');
        const objectStore = transaction.objectStore(this.objectStoreName);
        // Use a fixed key 'relays' to ensure that the same entry is overwritten
        const request = objectStore.put(relayData, 'relays');

        request.onerror = () => {
          this.logger.error('Failed to save relay data');
          reject(new Error('Failed to save relay data'));
        };

        request.onsuccess = () => {
          this.logger.info('Data saved in relay cache');
          resolve();
        };
      });
    } catch (error) {
      this.logger.error('Failed to save relay data', error);
    }
  }
  public async saveRelayDataWithKey(key: string, newData: any): Promise<void> {
    try {
      const db = await this.openDB();
      const timestamp = Date.now();

      const existingData = await this.getRelayData<RelayData>();

      let updatedData: RelayData;

      if (existingData) {
        // Update the specific part of the data
        if (key === 'verified') {
          existingData.data.verified = newData;
        } else if (key === 'claimable') {
          existingData.data.claimable = newData;
        }

        updatedData = {
          timestamp,
          data: {
            ...existingData.data,
            [key]: newData,
          },
        };
      } else {
        // Create a new data structure if no existing data is found
        updatedData = {
          timestamp,
          data: {
            verified: key === 'verified' ? newData : [],
            claimable: key === 'claimable' ? newData : [],
            nicknames: {},
            registrationCredits: [],
            verifiedHardware: {},
            state: {},
            [key]: newData,
          },
        };
      }

      this.logger.info(`Saving data for key: ${key}`, updatedData);

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.objectStoreName, 'readwrite');
        const objectStore = transaction.objectStore(this.objectStoreName);
        const request = objectStore.put(updatedData, 'relays');

        request.onerror = () => {
          this.logger.error('Failed to save relay data');
          reject(new Error('Failed to save relay data'));
        };

        request.onsuccess = () => {
          this.logger.info(`Data saved for key: ${key}`);
          resolve();
        };
      });
    } catch (error) {
      this.logger.error('Failed to save relay data', error);
    }
  }
}

const relayCache = new RelayCache();
export const useRelayCache = () => relayCache;
