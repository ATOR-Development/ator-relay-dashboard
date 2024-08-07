import { formatEther } from 'viem';
import { useAccount } from '@wagmi/vue';
import { getBalance } from '@wagmi/core';
import { type GetBalanceReturnType } from '@wagmi/core';
import type { RelayMeta } from '@/types/relay';

import { useNickNameCache } from '~/composables/nicknameCache';

import {
  warpRead,
  warpReadSerials,
  readNickNames,
  getAllRelays,
} from '@/utils/warp.read';
import { config } from '@/config/wagmi.config';
import { getAnonAddress } from '@/config/web3modal.config';
import type { RelayRow } from '@/types/relay';
import { useRelayCache } from '~/composables/relayCache';

type CacheData = {
  tokenBalance: number;
  tokenBalanceUsd: number;
};

export const useUserStore = defineStore('user', {
  state: () => ({
    address: null as `0x${string}` | null,
    userData: useAccount({ config } as any),
    tokenBalance: {
      value: 0n,
      symbol: '',
      decimals: 0,
      formatted: '0',
    } as GetBalanceReturnType,
    tokenBalanceUsd: 0,
    cacheTimings: {} as CacheData,
    verifiedRelays: [] as RelayRow[],
    claimableRelays: [] as RelayRow[],
    registrationCredits: [] as string[],
    families: {} as Record<string, string[]>,
    relaysMeta: {} as Record<string, RelayMeta>,
    nickNames: {} as Record<string, string>,
    claimableRewards: 0,
    claimedRewardsTotal: 0,
    serials: [] as string[],
  }),
  actions: {
    // Get ANON balance
    async getTokenBalance(forceRefresh = false) {
      if (!this.userData.address) {
        return;
      }

      if (this.cacheTimings.tokenBalance && !forceRefresh) {
        const now = new Date().getTime();
        if (now - this.cacheTimings.tokenBalance < 30000) {
          return;
        }
      }
      const token = getAnonAddress() as `0x${string}`;

      this.tokenBalance = await getBalance(config, {
        token,
        address: this.userData.address as `0x${string}`,
      });

      this.cacheTimings.tokenBalance = new Date().getTime();
    },
    // Get ANON balance in USD using price store
    async getUsdTokenBalance(forceRefresh = false) {
      if (!this.userData.address) {
        return;
      }

      if (this.cacheTimings.tokenBalanceUsd && !forceRefresh) {
        const now = new Date().getTime();
        if (now - this.cacheTimings.tokenBalanceUsd < 30000) {
          return;
        }
      }
      const priceStore = usePriceStore();
      await priceStore.fetchPrice();

      this.tokenBalanceUsd =
        priceStore.currentPrice.data *
        Number(formatEther(this.tokenBalance?.value ?? BigInt(0)));

      this.cacheTimings.tokenBalanceUsd = new Date().getTime();
    },
    async getVerifiedRelaysOld(forceRefresh = false) {
      if (!this.userData.address) {
        this.verifiedRelays = [];
        return;
      }

      const relayCache = useRelayCache();
      if (!forceRefresh) {
        const cachedData = await relayCache.getRelayData();
        if (cachedData) {
          this.verifiedRelays = cachedData.verified;
          return;
        }
      }

      const verified: any = await warpRead(this.userData.address, 'verified');
      if (verified.status === 200) {
        const relays = await verified.json();
        this.verifiedRelays = relays.relays;
        await relayCache.saveRelayDataWithKey('verified', this.verifiedRelays);
      } else if (verified.status === 500) {
        this.verifiedRelays = [];
        throw new Error('rate limited');
      }
    },

    async getClaimableRelaysOld(forceRefresh = false) {
      if (!this.userData.address) {
        this.claimableRelays = [];
        return;
      }

      const relayCache = useRelayCache();
      if (!forceRefresh) {
        const cachedData = await relayCache.getRelayData();
        if (cachedData) {
          this.claimableRelays = cachedData.claimable;
          return;
        }
      }

      const claimable: any = await warpRead(this.userData.address, 'claimable');
      if (claimable.status === 200) {
        const relays = await claimable.json();
        this.claimableRelays = relays.relays;
        await relayCache.saveRelayDataWithKey(
          'claimable',
          this.claimableRelays
        );
      } else if (claimable.status === 500) {
        this.claimableRelays = [];
        throw new Error('rate limited');
      }
    },
    // Get verified relays using Warp
    async getVerifiedRelays(forceRefresh = false) {
      if (!this.userData.address) {
        this.verifiedRelays = [];
        return;
      }

      const relayCache = useRelayCache();
      const cachedData = await relayCache.getRelayData(forceRefresh);
      if (cachedData) {
        this.verifiedRelays = cachedData.verified;
        return;
      } else {
        // build cache
        await this.createRelayCache();
      }
    },

    async getClaimableRelays(forceRefresh = false) {
      if (!this.userData.address) {
        this.claimableRelays = [];
        return;
      }

      const relayCache = useRelayCache();
      const cachedData = await relayCache.getRelayData(forceRefresh);
      if (cachedData) {
        this.claimableRelays = cachedData.claimable;
        return;
      } else {
        // build cache
        await this.createRelayCache();
      }
    },
    async createRelayCache() {
      if (!this.userData.address) {
        return;
      }

      const data = await getAllRelays(this.userData.address);
      if (!data) {
        return;
      }

      this.nickNames = data.data.nicknames;
      // refresh the relays
      this.verifiedRelays = data.data.verified.map((relay) => ({
        fingerprint: relay.fingerprint,
        status: relay.status,
        consensusWeight: 0,
        observedBandwidth: 0,
        active: relay.active,
        class: relay.class,
        isWorking: false,
        nickname: '',
      }));

      this.claimableRelays = data.data.claimable.map((relay) => ({
        fingerprint: relay.fingerprint,
        status: relay.status,
        consensusWeight: 0,
        observedBandwidth: 0,
        active: relay.active,
        class: relay.class,
        isWorking: false,
        nickname: '',
      }));

      this.registrationCredits = data.data.registrationCredits;

      this.families = data.data.families;

      // save to cache
      const relayCache = useRelayCache();
      await relayCache.saveRelayData(data.data);
    },
    async hasRegistrationCredit(fingerprint: string, forceRefresh = false) {
      if (!this.userData.address) {
        this.registrationCredits = [];
        return;
      }

      const relayCache = useRelayCache();
      const cachedData = await relayCache.getRelayData(forceRefresh);
      if (cachedData) {
        this.registrationCredits = cachedData.registrationCredits;
        return this.registrationCredits.includes(fingerprint);
      } else {
        // build cache
        await this.createRelayCache();
      }
    },
    async familyVerified(fingerprint: string) {
      if (!this.userData.address) {
        return false;
      }

      const relayCache = useRelayCache();
      const cachedData = await relayCache.getRelayData();
      if (cachedData) {
        if (cachedData.families[fingerprint]) {
          var family = cachedData.families[fingerprint] as string[];
          for (const member of family) {
            if (
              this.verifiedRelays.find((relay) => relay.fingerprint === member)
            ) {
            } else {
              return false;
            }
          }
          return true;
        }
        return true;
      } else {
        // build cache
        await this.createRelayCache();
      }
    },
    async clearCache() {
      const relayCache = useRelayCache();
      this.verifiedRelays = [];
      this.claimableRelays = [];
      this.nickNames = {};
      this.registrationCredits = [];
      await relayCache.clearCache();
    },
    async getRelaysMeta() {},
    async getSerialsRelays(forceRefresh = false) {
      if (!this.userData.address) {
        this.serials = [];
        return;
      }

      const relayCache = useRelayCache();
      if (!forceRefresh) {
        const cachedData = await relayCache.getRelayData();
        if (cachedData) {
          return;
        }
      }

      const serials = await warpReadSerials(this.userData.address);
      this.serials = serials;
    },
    isHardwareRelay(fingerprint: string) {
      return this.serials.includes(fingerprint);
    },
  },
  getters: {
    // Check if the user has any claimable rewards
    hasClaimableRewards: (state) => state.claimableRewards > 0,
    // All relays, verified and claimable
    allRelays: (state) => [...state.verifiedRelays, ...state.claimableRelays],
  },
  // set initialized state
});
