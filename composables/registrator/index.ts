import {
  AbstractProvider,
  BrowserProvider,
  Contract,
  JsonRpcSigner,
  TransactionResponse,
  formatEther,
} from 'ethers';

import { abi } from './Registrator.json';
import { useRegistratorStore } from '@/stores/useRegistratorStore';
import { useUserStore } from '@/stores/useUserStore'; // Import the user store
import Logger from '~/utils/logger';

import { useToken } from '../token';
import type { LokedRelaysResponse, LokedRelaysType } from '~/types/registrator';

const runtimeConfig = useRuntimeConfig();

const ERRORS = {
  NOT_INITIALIZED: 'Registrator is not initialized!',
  CONNECTING_CONTRACT:
    'There was an error connecting to the Registrator Contract',
  CLAIMING_TOKENS: 'Error claiming tokens',
  COULD_NOT_FUND_ORACLE: 'Could not fund Oracle',
  FUNDING_ORACLE: 'Error funding Oracle',
  REQUESTING_UPDATE: 'Error requesting update from Registrator',
  REQUESTING_UPDATE_NOT_SUCCESSFUL:
    'Requesting update from Registrator was not successful',
  RECEIVE_AND_REQUEST_UPDATE:
    'Error funding & requesting update from Registrator',
  NO_PROVIDER: 'No Provider to initialize Registrator',
  NO_SIGNER: 'No Signer connected',
};

export class Registrator {
  private _refreshing: boolean = false;
  private contract!: Contract;
  private signer: JsonRpcSigner | null = null;
  private readonly logger = new Logger('Registrator');

  constructor(
    private contractAddress: string,
    provider: BrowserProvider | AbstractProvider
  ) {
    this.refreshContract(provider);
  }

  static buildContract(
    contractAddress: string,
    providerOrSigner: BrowserProvider | AbstractProvider | JsonRpcSigner
  ): Contract {
    return new Contract(contractAddress, abi, providerOrSigner);
  }

  private refreshContract(
    providerOrSigner: BrowserProvider | AbstractProvider | JsonRpcSigner
  ) {
    this.contract = Registrator.buildContract(
      this.contractAddress,
      providerOrSigner
    );
  }

  async setSigner(signer?: JsonRpcSigner) {
    if (signer) {
      this.signer = signer;
      this.refreshContract(this.signer);
    } else {
      this.signer = null;
      this.refreshContract(useProvider());
    }
    return this.refresh();
  }

  private setRefreshing(refreshing: boolean) {
    useState<boolean>('registrator-refreshing').value = refreshing;
    this._refreshing = refreshing;
  }

  async refresh(): Promise<void> {
    if (this._refreshing) {
      return;
    }

    this.setRefreshing(true);
    const auth = useUserStore();
    this.logger.info(
      auth.userData?.address
        ? `Refreshing Registrator for ${auth.userData?.address}`
        : 'Refreshing Registrator'
    );

    let lockedRelays = null,
      currentLockSize = null;

    if (auth.userData?.address) {
      lockedRelays = await this.getLokedRelaysTokens(auth.userData.address);
      currentLockSize = await this.getCurrentLockSize(auth.userData.address);
    }

    await auth.getTokenBalance(true);
    await auth.getUsdTokenBalance(true);

    this.setRefreshing(false);
    useRegistratorStore().setInitialized(true);

    this.logger.info('Registrator refreshed', {
      currentLockSize: currentLockSize ? currentLockSize.toString() : null,
    });
  }

  async getLokedRelaysTokens(
    address: string,
    initialized?: boolean
  ): Promise<LokedRelaysType> {
    if (!this.contract) {
      throw new Error(ERRORS.NOT_INITIALIZED);
    }

    const lokedRelaysReponse = (await this.contract.getRegistration(
      address
    )) as {
      data: LokedRelaysResponse;
    };

    if (initialized) {
      useRegistratorStore().setLoading(true);
    }
    let totalLockedTokens = 0n;
    const lokedRelays = lokedRelaysReponse.data.reduce((acc, item) => {
      if (item[3]) {
        acc[item[3]] = {
          amount: item[0],
          owner: item[2],
          unlockedAt: item[1],
        };
        totalLockedTokens += item[0];
      }
      return acc;
    }, {} as LokedRelaysType);

    // get current block number
    const provider = this.signer?.provider || useProvider();
    const currentBlockNumber = await provider.getBlockNumber();

    if (address === useUserStore().userData?.address) {
      useRegistratorStore().lokedRelays = lokedRelays;
      useRegistratorStore().totalLockedTokens = totalLockedTokens;
      useRegistratorStore().blockNumber = currentBlockNumber;
    }
    useRegistratorStore().setLoading(false);

    return lokedRelays;
  }

  async getCurrentLockSize(address: string): Promise<bigint> {
    if (!this.contract) {
      throw new Error(ERRORS.NOT_INITIALIZED);
    }

    const currentLockSize = (await this.contract.currentLockSize()) as bigint;

    if (address === useUserStore().userData?.address) {
      useRegistratorStore().currentLockSize = currentLockSize;
    }
    return currentLockSize;
  }

  async lock(
    fingerprint: string,
    address: string
  ): Promise<TransactionResponse | null> {
    const toast = useToast();
    const auth = useUserStore();
    const registratorStore = useRegistratorStore();
    let signer: JsonRpcSigner | undefined;
    if (auth.userData) {
      const _signer = await useSigner();
      if (_signer) {
        signer = _signer;
      }
    }

    await this.setSigner(signer);

    if (!this.signer) {
      throw new Error(ERRORS.NO_SIGNER);
    }
    if (!this.contract || !registratorStore.currentLockSize) {
      throw new Error(ERRORS.NOT_INITIALIZED);
    }

    try {
      const token = useToken();
      if (!token) {
        throw new Error(ERRORS.NOT_INITIALIZED);
      }

      const tokenResult = await token.approve(
        runtimeConfig.public.registratorContract as string,
        registratorStore.currentLockSize
      );
      toast.add({
        icon: 'i-heroicons-clock',
        color: 'primary',
        id: 'approve-token',
        timeout: 0,
        title: 'Approving token...',
        closeButton: undefined,
      });
      await tokenResult?.wait();

      toast.remove('approve-token');
      toast.add({
        icon: 'i-heroicons-check-circle',
        id: 'token-approved',
        color: 'primary',
        title:
          'Token approved! Please accept the transaction to lock the relay.',
      });

      const result = await this.contract
        .connect(this.signer)
        // @ts-ignore
        .register(address == '' ? auth.userData.address : address, fingerprint);

      toast.remove('token-approved');
      toast.add({
        icon: 'i-heroicons-clock',
        color: 'primary',
        id: 'lock-relay',
        timeout: 0,
        title: 'Locking relay...',
        closeButton: undefined,
      });
      await result.wait();
      toast.remove('lock-relay');
      await this.refresh();

      toast.add({
        icon: 'i-heroicons-check-circle',
        color: 'primary',
        title: 'Success',
        id: 'relay-locked',
        timeout: 0,
        description: `We've locked ${formatEther(registratorStore.currentLockSize || '0')} $ANYONE.  Once picked up on Arweave, you can click the 'claim' button to claim your relay.`,
      });

      return result;
    } catch (error) {
      const msg = (error as Error)?.message;

      if (!msg.includes('User denied transaction signature.')) {
        toast.add({
          icon: 'i-heroicons-x-circle',
          color: 'amber',
          title: 'Error',
          description: `Error redeem rewards: ${msg}`,
        });
      } else {
        toast.add({
          icon: 'i-heroicons-x-circle',
          color: 'amber',
          title: 'Error',
          description: 'User denied transaction signature.',
        });
      }

      this.logger.error(ERRORS.FUNDING_ORACLE, error);
    }

    return null;
  }

  async unlock(
    fingerprint: string,
    upto: bigint
  ): Promise<TransactionResponse | null> {
    const auth = useUserStore();
    const registratorStore = useRegistratorStore();

    let signer: JsonRpcSigner | undefined;
    if (auth.userData) {
      const _signer = await useSigner();
      if (_signer) {
        signer = _signer;
      }
    }

    await this.setSigner(signer);

    if (!this.signer) {
      throw new Error(ERRORS.NO_SIGNER);
    }
    if (!this.contract) {
      throw new Error(ERRORS.NOT_INITIALIZED);
    }

    const toast = useToast();

    try {
      const blockNumber = await signer?.provider?.getBlockNumber();
      if (!blockNumber || typeof blockNumber !== 'number') {
        toast.add({
          icon: 'i-heroicons-x-circle',
          color: 'amber',
          title: 'Error',
          description: 'Error getting block number',
        });
        this.logger.error('Error getting block number');
        return null;
      }

      const lockTime = await registratorStore.getUnlockTime(fingerprint);
      if (!lockTime) {
        toast.add({
          icon: 'i-heroicons-x-circle',
          color: 'amber',
          title: 'Error',
          description: 'Error getting unlock time',
        });
        this.logger.error('Error getting unlock time');
        return null;
      }

      if (blockNumber < Number(lockTime)) {
        toast.add({
          icon: 'i-heroicons-x-circle',
          color: 'amber',
          title: 'Error',
          description:
            'Tokens are still locked, they can be unlocked after block number ' +
            lockTime,
        });
        this.logger.error('Tokens are still locked');
        return null;
      }

      const token = useToken();
      if (!token) {
        throw new Error(ERRORS.NOT_INITIALIZED);
      }

      toast.add({
        icon: 'i-heroicons-clock',
        color: 'primary',
        id: 'approve-token',
        timeout: 0,
        title: 'Approving token...',
        closeButton: undefined,
      });
      const tokenResult = await token.approve(
        runtimeConfig.public.registratorContract as string,
        upto
      );

      await tokenResult?.wait();
      toast.remove('approve-token');
      toast.add({
        icon: 'i-heroicons-check-circle',
        id: 'token-approved',
        color: 'primary',
        title:
          'Token approved! Please accept the transaction to unlock the relay.',
      });
      const result = await this.contract
        .connect(this.signer)
        // @ts-ignore
        .unregister(auth.userData.address, upto, fingerprint);

      toast.remove('token-approved');
      toast.add({
        icon: 'i-heroicons-clock',
        color: 'primary',
        id: 'unlock-relay',
        timeout: 0,
        title: 'Unlocking relay...',
        closeButton: undefined,
      });
      await result.wait();
      await this.refresh();

      toast.remove('unlock-relay');
      toast.add({
        icon: 'i-heroicons-check-circle',
        color: 'primary',
        title: 'Success',
        timeout: 0,
        description: `Tokens unlocked. We've unlocked ${formatEther(upto.toString())} $ANYONE.`,
      });

      return result;
    } catch (error) {
      const msg = (error as Error)?.message;

      if (!msg.includes('User denied transaction signature.')) {
        toast.add({
          icon: 'i-heroicons-x-circle',
          color: 'amber',
          title: 'Error',
          description: `Error unlocking tokens: ${msg}`,
        });
      } else {
        toast.add({
          icon: 'i-heroicons-x-circle',
          color: 'amber',
          title: 'Error',
          description: 'User denied transaction signature.',
        });
      }

      this.logger.error('Error with unlocking: ', error);
    }

    return null;
  }
}

let registrator: Registrator | null = null;
export const initRegistrator = async () => {
  const provider = useProvider();

  if (!registrator) {
    registrator = new Registrator(
      runtimeConfig.public.registratorContract as string,
      provider
    );
    await registrator.refresh();
  }
};
export const useRegistrator = () => registrator;
