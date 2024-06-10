import { isAddress } from 'viem';
import { relayRegistryContract } from '@/config/warp.config';
import { responseOutput } from '@/utils/responseOutput';

type FunctionName = 'verified' | 'claimable' | 'serials';

var test = "0x722256e823bCB92D2C9510Bf185149Ef167f3903";

export const warpRead = async (
  address: `0x${string}`,
  functionName: FunctionName
) => {
  return new Promise(async (resolve,reject) => {
    if (!address)
      resolve(responseOutput({
        status: 400,
        message: 'No address provided',
      }));
  
    if (!isAddress(address))
      resolve(responseOutput({
        status: 400,
        message: 'Invalid address provided',
      }));
    
    try {
      const { result } = await relayRegistryContract.viewState({
        function: functionName,
        test
      });

      // Construct the response
      const returnedData = Object.entries(result).map(([key, value]) => {
        if (value === test) {
          return {
            fingerprint: key,
            status: functionName,
            active: true,
            class: '',
          };
        }
        return null;
      }).filter(entry => entry !== null);
  
      const count = Object.keys(result as object).length;
      const message =
        count === 0
          ? `No ${functionName} relays found`
          : `Success. All ${functionName} relays fetched.`;

      
      console.log(returnedData);
  
      resolve(responseOutput({
        data: {
          count,
          relays: returnedData,
        },
        message,
        status: 200,
      }))
    } catch (error) {
      console.log("error: ", error)
      resolve(responseOutput({
        data: error,
        status: 500,
        message: 'Error',
      }));
    }
  })
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
      data: {address: address},
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
