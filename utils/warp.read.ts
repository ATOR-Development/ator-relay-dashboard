import { isAddress } from 'viem';
import { relayRegistryContract } from '@/config/warp.config';
import { responseOutput } from '@/utils/responseOutput';

type FunctionName = 'verified' | 'claimable' | 'serials';

var test = '0x722256e823bCB92D2C9510Bf185149Ef167f3903';

// getting the relays, either claimed or verified, by using corresponding function name and user's EVM address.
export const warpRead = async (
  address: `0x${string}`,
  functionName: FunctionName
) => {
  return new Promise(async (resolve, reject) => {
    if (!address)
      resolve(
        responseOutput({
          status: 400,
          message: 'No address provided',
        })
      );

    if (!isAddress(address))
      resolve(
        responseOutput({
          status: 400,
          message: 'Invalid address provided',
        })
      );

    try {
      const { result } = await relayRegistryContract.viewState({
        function: functionName,
        address: address,
      });

      const relays = result.map((relay: string) => {
        return {
          fingerprint: relay,
          status: functionName,
          active: true,
          class: '',
        };
      });

      const count = relays.length;
      const message =
        count === 0
          ? `No ${functionName} relays found`
          : `Success. All ${functionName} relays fetched.`;

      resolve(
        responseOutput({
          data: {
            count,
            relays: relays,
          },
          message,
          status: 200,
        })
      );
    } catch (error) {
      resolve(
        responseOutput({
          data: error,
          status: 500,
          message: 'Error',
        })
      );
    }
  });
};

export const warpReadSerials = async (
  address: `0x${string}`
): Promise<string[]> => {
  if (!address) {
    responseOutput({
      status: 400,
      message: 'No address provided',
    });
    return [];
  }

  if (!isAddress(address)) {
    responseOutput({
      status: 400,
      message: 'Invalid address provided',
    });
    return [];
  }

  try {
    const { state } = await relayRegistryContract.viewState({
      data: { address: address },
    });

    // Construct the response

    const serials = Object.keys(
      (state as { serials: Record<string, object> })?.serials || {}
    );

    return serials;
  } catch (error) {
    responseOutput({
      data: error,
      status: 500,
      message: 'Error',
    });
    return [];
  }
};
