import type {
  ContractFunctionInput,
  EvmAddress,
  EvolvableState,
  Fingerprint,
  OwnableState,
} from '~/utils/contracts';

export type RelayRegistryState = OwnableState &
  EvolvableState & {
    claimable: { [address in Fingerprint as string]: EvmAddress };
    verified: { [address in Fingerprint as string]: EvmAddress };
  };

export interface AddClaimable extends ContractFunctionInput {
  function: 'addClaimable';
  fingerprint: Fingerprint;
  address: EvmAddress;
}

export interface RemoveClaimable extends ContractFunctionInput {
  function: 'removeClaimable';
  fingerprint: Fingerprint;
}

export interface IsClaimable extends ContractFunctionInput {
  function: 'isClaimable';
  fingerprint: Fingerprint;
  address: EvmAddress;
}

export interface Claim extends ContractFunctionInput {
  function: 'claim';
  fingerprint: Fingerprint;
}

export interface Renounce extends ContractFunctionInput {
  function: 'renounce';
  fingerprint: Fingerprint;
}

export interface RemoveVerified extends ContractFunctionInput {
  function: 'removeVerified';
  fingerprint: Fingerprint;
}

export interface Verified extends ContractFunctionInput {
  function: 'verified';
  address?: EvmAddress;
}

export interface IsVerified extends ContractFunctionInput {
  function: 'isVerified';
  fingerprint: Fingerprint;
}
