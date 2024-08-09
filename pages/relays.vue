<template>
  <DashboardMobileSection title="my-relays">
    <Card class="mt-[1rem]">
      <div class="flex items-center mb-[1rem] justify-between">
        <div class="flex items-center space-x-2">
          <Icon
            name="eos-icons:product-classes-outlined"
            class="w-[1.8rem] h-[1.8rem]"
          />
          <p class="text-[2rem]">Relays</p>
        </div>
        <div class="flex justify-center">
          <UButton
            @click="registerModalOpen = true"
            color="green"
            variant="outline"
            label="Register Relay"
          />
        </div>
      </div>
      <div class="hidden xl:block">
        <DataTableMyRelays
          :currentTab="currentTab"
          @update:currentTab="handleTabChange"
          :registerModalOpen="registerModalOpen"
        />
      </div>
      <div class="block xl:hidden">
        <DataTableMyRelaysMobile
          :currentTab="currentTab"
          @update:currentTab="handleTabChange"
          :registerModalOpen="registerModalOpen"
        />
      </div>
    </Card>
  </DashboardMobileSection>
  <UModal v-model="registerModalOpen">
    <UCard class="bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <h4
        class="text-lg font-semibold mb-4 border-b border-b-[rgba(255,255,255,0.1)] pb-4"
      >
        Register Fingerprint
      </h4>
      <UContainer>
        <p class="mb-[1rem] text-center">
          Note: this is for you to register a relay for someone else.
        </p>
        <div class="mb-6">
          <UFormGroup label="EVM Address" class="mb-6">
            <UInput
              v-model="ethAddress"
              hint="EVM address associated with fingerprint"
              placeholder="EVM Address"
              :rules="[rules.required]"
              :error="ethAddressError !== null"
              persistent-hint
              class="mb-1"
            />
          </UFormGroup>
          <UFormGroup label="Relay Fingerprint">
            <UInput
              v-model="fingerPrintRegister"
              hint="Fingerprint associated with EVM Address"
              placeholder="Relay Fingerprint"
              :rules="[rules.required]"
              :error="fingerPrintRegisterError !== null"
              persistent-hint
              class="mb-1"
            />
          </UFormGroup>
        </div>
        <div class="flex justify-between">
          <UButton
            variant="outline"
            size="sm"
            color="red"
            @click="registerModalOpen = false"
          >
            Cancel
          </UButton>
          <UDivider />
          <UButton
            variant="outline"
            size="sm"
            color="primary"
            @click="handleLockRemote"
          >
            Register
          </UButton>
        </div>
      </UContainer>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useUserStore } from '@/stores/useUserStore';
import DashboardMobileSection from '@/components/DashboardMobileSection.vue';
import DataTableMyRelays from '@/components/DataTableMyRelays/DataTableMyRelays.vue';
import DataTableMyRelaysMobile from '@/components/DataTableMyRelays/DataTableMyRelaysMobile.vue';
import { initRegistrator, useRegistrator } from '@/composables/registrator';
import { initDistribution, useDistribution } from '@/composables/distribution';
import { initRelayRegistry } from '@/composables/relay-registry';
import { initFacilitator } from '@/composables/facilitator';
import { initToken } from '@/composables/token';
import { type RelayTabType } from '@/types/relay';
import Card from '~/components/ui-kit/Card.vue';
import { useMetricsStore } from '@/stores/useMetricsStore';

const userStore = useUserStore();
const registrator = useRegistrator();
const registerModalOpen = ref(false);
const currentTab = ref<RelayTabType>('all');
const metricsStore = useMetricsStore();

onMounted(async () => {
  initRelayRegistry();
  initFacilitator();
  initRegistrator();
  initFacilitator();
  initDistribution();
  initToken();

  await userStore.getVerifiedRelays();
  await metricsStore.refreshRelayMetrics();
});

const loadLockedRelays = async () => {
  await registratorStore.fetchLockedRelays(userStore.userData.address);
};

onMounted(() => {
  loadLockedRelays();
});

watch(
  () => userStore.userData.address,
  async (newAddress?: string) => {
    await useDistribution().claimable(newAddress as string);
    await useDistribution().refresh();
    await registrator.getLokedRelaysTokens(userStore.userData.address, true);

    await userStore.createRelayCache();
  }
);

const handleTabChange = (key: RelayTabType) => {
  currentTab.value = key;
};

// Modal logic
const ethAddress = ref('');
const ethAddressError = ref<string | null>(null);
const fingerPrintRegister = ref('');
const fingerPrintRegisterError = ref<string | null>(null);

const rules = {
  required: (value: string) => !!value || 'Required',
};

const handleLockRemote = async () => {
  if (fingerPrintRegisterError.value || ethAddressError.value) {
    return;
  }

  if (fingerPrintRegister.value == '' || ethAddress.value == '') {
    return;
  }

  try {
    const register = useRegistrator();
    const success = await register?.lock(
      fingerPrintRegister.value,
      ethAddress.value
    );
    if (success != null && typeof success != typeof Error) {
      registerModalOpen.value = false;
    } else {
      // handle error
    }
  } catch (error: any) {
    // handle error
  }
};
</script>
