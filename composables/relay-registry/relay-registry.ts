import type { Contract, WriteInteractionResponse } from 'warp-contracts';
import type { Claim, RelayRegistryState, Renounce } from './';
import Logger from '~/utils/logger';

import { relayRegistryContract } from '@/config/warp.config';

export class RelayRegistry {
  private contract: Contract<RelayRegistryState> | null = null;
  private _isInitialized: boolean = false;
  private readonly logger = new Logger('RelayRegistry');

  get isInitialized() {
    return this._isInitialized;
  }

  initialize(contract: Contract<RelayRegistryState>) {
    if (this._isInitialized) {
      return;
    }

    this.contract = contract;
    this._isInitialized = true;
  }

  async claim(fingerprint: string): Promise<WriteInteractionResponse | null> {
    this.logger.info(`Claiming fingerprint ${fingerprint}`);

    if (!this.contract) {
      this.logger.error('claim() relay registry contract is null');
      return null;
    }

    const warpSigner = await useWarpSigner();
    if (!warpSigner) {
      this.logger.error('claim() relay registry warpSigner is null');
      return null;
    }

    return (
      this.contract
        /* @ts-expect-error warp types */
        .connect(warpSigner)
        .writeInteraction<Claim>({ function: 'claim', fingerprint })
    );
  }

  async renounce(
    fingerprint: string
  ): Promise<WriteInteractionResponse | null> {
    this.logger.info(`Renouncing fingerprint ${fingerprint}`);

    if (!this.contract) {
      this.logger.error('renounce() relay registry contract is null');
      return null;
    }

    const warpSigner = await useWarpSigner();
    if (!warpSigner) {
      this.logger.error('renounce() relay registry warpSigner is null');
      return null;
    }

    return (
      this.contract
        /* @ts-expect-error warp types */
        .connect(warpSigner)
        .writeInteraction<Renounce>({ function: 'renounce', fingerprint })
    );
  }
}

const relayRegistry = new RelayRegistry();
export const initRelayRegistry = () => {
  if (relayRegistry.isInitialized) {
    return;
  }
  relayRegistry.initialize(relayRegistryContract);
};
export const useRelayRegistry = () => relayRegistry;
