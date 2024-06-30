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

    await auth.getTokenBalance();
    await auth.getUsdTokenBalance();

    this.setRefreshing(false);
    this.logger.info('Registrator refreshed', {
      currentLockSize: currentLockSize ? currentLockSize.toString() : null,
    });
  }

  async getLokedRelaysTokens(address: string): Promise<LokedRelaysType> {
    if (!this.contract) {
      throw new Error(ERRORS.NOT_INITIALIZED);
    }

    const lokedRelaysReponse = (await this.contract.getRegistration(
      address
    )) as {
      data: LokedRelaysResponse;
    };

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

    if (address === useUserStore().userData?.address) {
      useRegistratorStore().lokedRelays = lokedRelays;
      useRegistratorStore().totalLockedTokens = totalLockedTokens;
    }

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

  async lock(fingerprint: string): Promise<TransactionResponse | null> {
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

    const toast = useToast();

    try {
      const token = useToken();
      if (!token) {
        throw new Error(ERRORS.NOT_INITIALIZED);
      }

      const tokenResult = await token.approve(
        runtimeConfig.public.registratorContract as string,
        registratorStore.currentLockSize
      );
      await tokenResult?.wait();

      const result = await this.contract
        .connect(this.signer)
        // @ts-ignore
        .register(auth.userData.address, fingerprint);

      await result.wait();
      await this.refresh();

      toast.add({
        icon: 'i-heroicons-check-circle',
        color: 'primary',
        title: 'Success',
        timeout: 0,
        description: `${formatEther(registratorStore.totalLockedTokens || '0')} $ATOR locked.`,
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
