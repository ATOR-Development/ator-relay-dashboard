<template>
  <div
    class="relative grid grid-flow-row grid-cols-1 pt-4 lg:pt-0 gap-6 lg:grid-cols-6"
  >
    <div class="flex w-full flex-col gap-4 lg:col-span-6">
      <DashboardMobileSection title="account-balance">
        <Card title="Account balance" :icon="'eos-icons:master-outlined'">
          <div
            class="flex justify-between items-start lg:items-center flex-col lg:flex-row mb-2 lg:mb-0"
          >
            <p class="mb-4 text-sm">
              The connected wallet shows the following balance:
            </p>
          </div>

          <div class="flex gap-5 lg:gap-32 flex-col lg:flex-row my-4">
            <div class="border-l-4 border-cyan-600 pl-3">
              <UserBalance
                class="bg-gradient-to-r from-gray-600 to-gray-800 bg-clip-text text-6xl font-bold text-transparent drop-shadow-lg dark:from-gray-200 dark:to-gray-500"
              >
                <Ticker />
              </UserBalance>
            </div>
            <div class="flex gap-0 lg:gap-32 flex-col lg:flex-row">
              <div class="my-4 flex flex-col border-l-4 border-cyan-600 pl-3">
                <h3>
                  <Icon name="material-symbols:lock" />
                  Locked
                </h3>
                <div class="inline-flex items-baseline gap-2">
                  <template v-if="lockedPending">
                    <USkeleton class="w-[15rem] h-10" />
                  </template>
                  <template v-else>
                    <span v-if="isConnected" class="text-4xl font-bold">
                      {{
                        formatEtherNoRound(
                          registratorStore.totalLockedTokens || '0'
                        )
                      }}
                    </span>
                    <span v-if="!isConnected" class="text-4xl font-bold">
                      --
                    </span>
                    <Ticker />
                  </template>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </DashboardMobileSection>

      <DashboardMobileSection title="my-rewards">
        <Card>
          <div
            class="flex justify-between items-start lg:items-center flex-col lg:flex-row mb-2 lg:mb-0"
          >
            <div>
              <h2
                class="dark:text-cyan-200 lg:text-3xl text-2xl tracking-wide flex items-center gap-2 font-brand"
              >
                <Icon name="eos-icons:trusted-organization" />
                Rewards history
              </h2>
              <p class="mb-4 text-sm mt-4">
                Earn rewards by contributing relays to the ANYONE network.
                <a
                  href="https://docs.anyone.io/relay/rewards"
                  target="_blank"
                  class="dark:text-cyan-200 text-cyan-500 underline"
                >
                  Find Out More
                </a>
              </p>
            </div>
            <div v-if="isConnected" class="redeem flex gap-6 items-center">
              <div class="divider hidden lg:visible"></div>
              <div>
                <Button
                  :disabled="
                    !facilitatorStore.hasClaimableRewards ||
                    isRedeemLoading ||
                    !!facilitatorStore.pendingClaim
                  "
                  @onClick="handleClaimAllRewards"
                  class="mb-2"
                >
                  <span
                    v-if="isRedeemLoading || !!facilitatorStore.pendingClaim"
                    >Processing...</span
                  >
                  <span v-else-if="facilitatorStore.hasClaimableRewards"
                    >Redeem Rewards</span
                  >
                  <span v-else>Nothing to Redeem</span>
                </Button>
                <div v-if="progressLoading" class="text-center">
                  <UProgress animation="carousel">
                    <template #indicator="{ progressLoading }">
                      <div class="text-center">
                        <span v-if="progressLoading === 1" class="text-xs">
                          1 / 2 Accepting Request...
                        </span>
                        <span v-else class="text-xs">
                          2 / 2 Accepting Request...
                        </span>
                      </div>
                    </template>
                  </UProgress>
                </div>
              </div>
            </div>
          </div>

          <div class="flex gap-0 lg:gap-32 flex-col lg:flex-row">
            <div class="my-4 flex flex-col border-l-4 border-cyan-600 pl-3">
              <h3>Redeemed rewards</h3>
              <template v-if="claimedPending">
                <USkeleton class="w-[15rem] h-10" />
              </template>
              <template v-else>
                <span v-if="isConnected" class="text-4xl font-bold">
                  {{
                    formatEtherNoRound(
                      facilitatorStore.totalClaimedTokens || '0'
                    )
                  }}
                </span>
                <span v-if="!isConnected" class="text-4xl font-bold"> -- </span>
                <Ticker />
              </template>
            </div>
            <div class="my-4 flex flex-col border-l-4 border-cyan-600 pl-3">
              <h3>Redeemable rewards</h3>
              <template v-if="claimablePending">
                <USkeleton class="w-[15rem] h-10" />
              </template>
              <template v-else>
                <span v-if="isConnected" class="text-4xl font-bold">
                  {{
                    formatEtherNoRound(
                      facilitatorStore.availableAllocatedTokens || '0'
                    )
                  }}
                </span>
                <span v-if="!isConnected" class="text-4xl font-bold"> -- </span>
                <Ticker />
              </template>
            </div>
          </div>
        </Card>
      </DashboardMobileSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAccount } from '@wagmi/vue';
import { config } from '@/config/wagmi.config';
import { useFacilitatorStore } from '@/stores/useFacilitatorStore';
import { useUserStore } from '@/stores/useUserStore';
import { useRegistratorStore } from '@/stores/useRegistratorStore';
import DashboardMobileSection from '@/components/DashboardMobileSection.vue';
import UserBalance from '@/components/UserBalance.vue';
import Button from '@/components/ui-kit/Button.vue';
import Card from '@/components/ui-kit/Card.vue';
import Ticker from '@/components/ui-kit/Ticker.vue';
import ReportIssueButton from '@/components/ui-kit/ReportIssueButton.vue';
import { initRegistrator, useRegistrator } from '@/composables/registrator';
import { useFacilitator } from '@/composables/facilitator';
import { initDistribution, useDistribution } from '@/composables/distribution';
import { initRelayRegistry } from '@/composables/relay-registry';
import { initFacilitator } from '@/composables/facilitator';
import { initToken } from '@/composables/token';
import { formatEtherNoRound } from '@/utils/format';

const userStore = useUserStore();
const facilitatorStore = useFacilitatorStore();
const registratorStore = useRegistratorStore();
const { isConnected, address } = useAccount({ config } as any);

const isRedeemLoading = ref(false);
const progressLoading = ref(0);
const lockedPending = ref(false);
const claimedPending = ref(false);
const claimablePending = ref(false);

const toast = useToast();

const isLoading = ref(true);

const fetchInitialData = async (
  newAddress: string | undefined,
  forceRefresh = false
) => {
  if (!isConnected || !newAddress || !address) return;

  try {
    if (!facilitatorStore?.initialized || forceRefresh) {
      claimedPending.value = true;
      claimablePending.value = true;
    }
    if (!registratorStore?.initialized || forceRefresh) {
      lockedPending.value = true;
    }

    facilitatorStore.pendingClaim = getRedeemProcessSessionStorage(newAddress);
    // Pending claim is not null on initial load
    if (facilitatorStore.pendingClaim) {
      facilitatorStore.resetPendingClaim();
      facilitatorStore.pendingClaim = null;
    }

    await Promise.all([
      userStore.getTokenBalance(),
      (!facilitatorStore?.initialized || forceRefresh) &&
        useFacilitator()?.refresh(),
      (!registratorStore?.initialized || forceRefresh) &&
        useRegistrator()?.refresh(),
      // useDistribution().isInitialized &&
      //   useDistribution().claimable(newAddress as string),
      // useDistribution().isInitialized && useDistribution().refresh(),
    ]);
  } catch (error) {
    console.error(error);
  } finally {
    lockedPending.value = false;
    claimedPending.value = false;
    claimablePending.value = false;
  }
};

onMounted(async () => {
  isLoading.value = true;

  try {
    await initDistribution();

    initRelayRegistry();
    initFacilitator();
    initRegistrator();
    initToken();
    // add 5 seconds delay
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await fetchInitialData(userStore.userData.address);
    if (!facilitatorStore.pendingClaim) {
      progressLoading.value = 0;
    }
  } catch (error) {
    console.error('Error during onMounted execution', error);
  } finally {
    isLoading.value = false;
  }
});

watch(
  () => userStore.userData.address,
  async (newAddress?: string) => {
    await fetchInitialData(newAddress, true);
  }
);

watch(
  () => facilitatorStore.pendingClaim,
  (updatedPendingClaim) => {
    progressLoading.value = updatedPendingClaim ? 2 : 0;
  }
);

const handleClaimAllRewards = async () => {
  isRedeemLoading.value = true;
  progressLoading.value = 1;

  try {
    const facilitator = useFacilitator();
    const response = await facilitator?.claim();
    if (response) {
      toast.add({
        icon: 'i-heroicons-check-circle',
        color: 'blue',
        title: 'Success',
        description:
          'Rewards redeemed successfully please wait for the transaction to be saved',
      });
    } else {
      toast.add({
        icon: 'i-heroicons-x-circle',
        color: 'amber',
        title: 'Error',
        description: 'Error redeeming rewards',
      });
    }
  } catch (error) {
    toast.add({
      icon: 'i-heroicons-x-circle',
      color: 'amber',
      title: 'Error',
      description: `Error redeem rewards: ${error}`,
    });
  }

  isRedeemLoading.value = false;
  facilitatorStore.pendingClaim = null;
  progressLoading.value = 0;
};
</script>

<style scoped>
.divider {
  width: 1px;
  min-height: 64px;
  height: 100%;
  background: linear-gradient(
    0deg,
    rgba(22, 81, 103, 0) 0%,
    #165167 49.5%,
    rgba(22, 81, 103, 0) 100%
  );
}

.redeem {
  height: 100%;
}
</style>
