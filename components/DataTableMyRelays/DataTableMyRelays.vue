<script lang="ts" setup>
import { useAccount } from 'use-wagmi';
import type { FunctionName } from '@/utils/warp.write';
import { useRelayRegistry } from '@/composables/relay-registry';
import { config } from '@/config/wagmi.config';
import {
  type RelayRow,
  type RelayTabType,
  type RelayMeta,
} from '@/types/relay';
import { RELAY_COLUMS, TABS, VERBS } from '@/constants/relay';
import { useMetricsStore } from '@/stores/useMetricsStore';

import Tabs from '../ui-kit/Tabs.vue';
import Tooltip from '../ui-kit/Tooltip.vue';
import Popover from '../ui-kit/Popover.vue';

import BigNumber from 'bignumber.js';

import LockStatusColumn from './columns/LockStatusColumn.vue';
import RegistrationActionColumn from './columns/RegistrationActionColumn.vue';
import { useRegistrator } from '@/composables/registrator';
import { useRegistratorStore } from '@/stores/useRegistratorStore';

import type { ValidatedRelay } from '@/stores/useMetricsStore';

const toast = useToast();
const userStore = useUserStore();
const registry = useRelayRegistry();
const metricsStore = useMetricsStore();
const registratorStore = useRegistratorStore();

const { allRelays, claimableRelays } = storeToRefs(userStore);
const { address } = useAccount({ config });
const currentTab = ref<RelayTabType>('all');

// Fetching and refreshing the relay data from Warp - stored in Pinia user store
const {
  refresh: verifiedRelaysRefresh,
  error: verifiedRelaysError,
  pending: verifiedPending,
} = await useAsyncData(
  'verifiedRelays',
  () => userStore.getVerifiedRelays().then(() => true),
  { server: false, watch: [address] }
);
const {
  refresh: claimableRelaysRefresh,
  error: claimableRelaysError,
  pending: claimablePending,
} = await useAsyncData(
  'claimableRelays',
  () => userStore.getClaimableRelays().then(() => true),
  { watch: [address] }
);

const timestamp = computed(
  () => metricsStore.relays.timestamp && new Date(metricsStore.relays.timestamp)
);

// The user's relays
const fingerprints = computed(() => {
  return allRelays.value.map((relay) => relay.fingerprint);
});

console.log('STAGE LOG: fingerprints', fingerprints);
console.log('STAGE LOG: metricsStore', metricsStore);

const relayMeta = computed(() => {
  if (!userStore.userData) {
    return null;
  }
  if (!allRelays.value) {
    return null;
  }
  if (!metricsStore.relays.latest) {
    return null;
  }

  return fingerprints.value.reduce(
    // @ts-ignore
    (acc, fp) => {
      const myMetrics = metricsStore.relays.latest!.find(
        ({ relay }) => fp === relay.fingerprint
      );
      const relay = myMetrics ? myMetrics.relay : null;

      // @ts-ignore
      acc[fp] = relay
        ? {
            ...relay,
            consensus_weight: BigNumber(relay.consensus_weight).toFormat(),
            observed_bandwidth:
              BigNumber(relay.observed_bandwidth)
                .dividedBy(Math.pow(1024, 2))
                .toFormat(3) + ' MiB/s',
          }
        : { fingerprint: fp };

      return acc;
    },
    {} as Record<string, RelayMeta>
  );
});

console.log('STAGE LOG: relayMeta', relayMeta);

const relayAction = async (action: FunctionName, fingerprint: string) => {
  //TODO: Sign the message
  // See: The following resources
  // https://academy.warp.cc/docs/sdk/advanced/plugins/signature
  // https://github.com/brewlabs-code/ator/blob/main/composables/warp-signer.ts
  // https://docs.google.com/document/d/1VLRd2bP96avNZksMwrf8WSDmcAwrcaQpYAd5SUGDhx0/edit?pli=1#heading=h.gtsv79v2cvnl

  // Apply style to the selected row
  const selectedRow = allRelays.value.find(
    (row) => row.fingerprint === fingerprint
  );
  selectedRow!.isWorking = true;
  selectedRow!.class = 'animate-pulse bg-green-100 dark:bg-zinc-600';

  try {
    switch (action) {
      case 'claim': {
        const res = await registry.claim(fingerprint);

        if (!res) {
          selectedRow!.class = '';
          selectedRow!.isWorking = false;
          return;
        }

        break;
      }

      case 'renounce':
        await registry.renounce(fingerprint);
        break;
    }

    // Refresh the relays
    await verifiedRelaysRefresh();
    await claimableRelaysRefresh();

    toast.add({
      icon: 'i-heroicons-check-circle',
      color: 'primary',
      title: 'Success',
      timeout: 0,
      description: `Successfully ${
        VERBS[action].pastTense
      } relay ${truncatedAddress(fingerprint)}!`,
    });
  } catch (error) {
    // @ts-ignore
    if (error?.code !== 'ACTION_REJECTED') {
      toast.add({
        icon: 'i-heroicons-x-circle',
        color: 'amber',
        title: 'Error',
        description: `Error ${
          VERBS[action].presentTense
        } relay ${truncatedAddress(fingerprint)}!`,
      });
    }
  }

  selectedRow!.class = '';
  selectedRow!.isWorking = false;
};

// Table columns and actions

const getVerifiedItems = (row: RelayRow) => [
  [
    {
      label: 'Renounce',
      icon: 'i-heroicons-trash-20-solid',
      click: () => relayAction('renounce', row.fingerprint),
    },
  ],
];

const handleTabChange = (key: string) => {
  currentTab.value = key as RelayTabType;
};

const handleLockRelay = async (fingerprint: string) => {
  const selectedRow = allRelays.value.find(
    (row) => row.fingerprint === fingerprint
  );
  selectedRow!.isWorking = true;
  selectedRow!.class = 'animate-pulse bg-green-100 dark:bg-zinc-600';

  try {
    const register = useRegistrator();
    await register?.lock(fingerprint);

    selectedRow!.class = '';
    selectedRow!.isWorking = false;
  } catch {
    selectedRow!.class = '';
    selectedRow!.isWorking = false;
  }
};

const getTableData = (tab: RelayTabType) => {
  switch (tab) {
    case 'all':
      return allRelays.value;
    case 'locked':
      return allRelays.value.filter((relay) =>
        registratorStore.isRelayLocked(relay.fingerprint)
      );
    case 'claimable':
      return claimableRelays.value;
  }
};
</script>

<template>
  <div class="-mx-4 sm:-mx-0">
    <UAlert
      v-if="verifiedRelaysError || claimableRelaysError"
      class="mb-6"
      icon="i-heroicons-exclamation-triangle"
      description="There was an error retrieving relays. We'll load what we can."
      title="Relay error"
      color="red"
      variant="subtle"
    />

    <Tabs :tabs="TABS" @onChange="handleTabChange" />

    <UTable
      :loading="verifiedPending || claimablePending"
      :columns="RELAY_COLUMS[currentTab]"
      :rows="getTableData(currentTab)"
      :ui="{ td: { base: 'max-w-sm truncate' } }"
      :empty-state="{
        icon: 'i-heroicons-circle-stack-20-solid',
        label:
          currentTab === 'claimable'
            ? 'No Claimable relays!'
            : 'No pending claimable or verified relays!',
      }"
    >
      <template #actions-data="{ row }">
        <div class="w-8">
          <Icon
            v-if="row.isWorking"
            name="heroicons:arrow-path-20-solid"
            class="h-6 w-6 animate-spin"
          />
          <UDropdown
            v-if="row.status === 'verified' && !row.isWorking"
            :items="getVerifiedItems(row)"
            :popper="{ placement: 'left-end' }"
          >
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-ellipsis-horizontal-20-solid"
            />
          </UDropdown>
        </div>
      </template>
      <template #nickname-data="{ row }">
        {{ relayMeta?.[row.fingerprint]?.nickname || '-' }}
      </template>

      <template #active-data="{ row }">
        <USkeleton v-if="metricsStore.relayMetricsPending" class="h-6 w-full" />
        <div
          v-else
          :class="
            relayMeta?.[row.fingerprint]?.running
              ? 'status-active'
              : 'status-inactive'
          "
        ></div>
      </template>

      <template #consensusWeight-data="{ row }">
        <USkeleton v-if="metricsStore.relayMetricsPending" class="h-6 w-full" />
        <span
          v-else-if="
            relayMeta?.[row.fingerprint]?.consensus_weight !== undefined
          "
        >
          {{ relayMeta?.[row.fingerprint]?.consensus_weight }}
        </span>
        <span v-else class="text-sm flex items-center gap-2">
          <Icon
            name="heroicons:exclamation-circle"
            class="h-4 w-4 text-red-500"
          />
          Unable to fetch
        </span>
      </template>
      <template #observedBandwidth-data="{ row }">
        <USkeleton v-if="metricsStore.relayMetricsPending" class="h-6 w-full" />

        <span
          v-else-if="
            relayMeta?.[row.fingerprint]?.observed_bandwidth !== undefined
          "
        >
          {{ relayMeta?.[row.fingerprint]?.observed_bandwidth }}
        </span>
        <span v-else class="text-sm flex items-center gap-2">
          <Icon
            name="heroicons:exclamation-circle"
            class="h-4 w-4 text-red-500"
          />
          Unable to fetch
        </span>
      </template>

      <template #lockStatus-header="{ column }">
        <div class="flex gap-1 items-center">
          <span>{{ column.label }}</span>
          <Tooltip
            placement="top"
            arrow
            text="Shows the current lock status and amount of locked tokens needed for Registration."
          >
            <Icon name="heroicons:exclamation-circle" class="h-4" />
          </Tooltip>
        </div>
      </template>
      <template #lockStatus-data="{ row }">
        <LockStatusColumn
          :is-locked="registratorStore.isRelayLocked(row.fingerprint)"
          :is-hardware="userStore.isHardwareRelay(row.fingerprint)"
          :is-verified="row.status === 'verified'"
        />
      </template>

      <template #status-header="{ column }">
        <div class="relative flex gap-1 items-center">
          <span>{{ column.label }}</span>
          <Popover placement="top" :arrow="false">
            <template #content>
              <div class="text-sm font-medium text-cyan-500 mb-3">
                Registration Status
              </div>

              <div class="text-xs font-normal text-gray-600 dark:text-gray-300">
                <span class="text-gray-800 dark:text-white">Claimable:</span>
                'Claim Now' button is active
              </div>
              <div class="text-xs font-normal text-gray-600 dark:text-gray-300">
                <span class="text-gray-800 dark:text-white">Claimed:</span> This
                item has already been claimed. No further action is needed.
              </div>
            </template>
            <template #trigger>
              <div><Icon name="heroicons:exclamation-circle" /></div>
            </template>
          </Popover>
        </div>
      </template>
      <template #status-data="{ row }">
        <RegistrationActionColumn
          :row="row"
          @relay-action="relayAction"
          @on-lock-relay="handleLockRelay"
          :is-locked="
            registratorStore.isRelayLocked(row.fingerprint) ||
            row.status === 'verified' ||
            userStore.isHardwareRelay(row.fingerprint)
          "
        />
      </template>
      <template #unlock-data="{ row }">
        <UButton
          :ui="{ base: 'text-sm' }"
          icon="i-heroicons-check-circle-solid"
          size="xl"
          color="green"
          variant="outline"
          label="Unlock"
          :disabled="true"
          :trailing="false"
        />
      </template>
      <template #owner-data="{ row }">
        <UBadge
          v-if="
            registratorStore.isRelayOwner(
              row.fingerprint,
              userStore.userData.address!
            )
          "
          color="white"
          variant="solid"
        >
          Owner
        </UBadge>
        <UBadge v-else color="cayan" variant="outline"> Others </UBadge>
      </template>
    </UTable>
  </div>
</template>

<style scoped lang="scss">
.status-active,
.status-inactive {
  width: 16px;
  height: 16px;
  border-radius: 50%;
}
// TODO: use variables
.status-active {
  background: #00ff84;
}

.status-inactive {
  background: #fa5858;
}
</style>