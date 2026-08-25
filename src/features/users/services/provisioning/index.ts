import { isDemoMode } from '@/config/demo';
import { demoProvisioner } from '@/features/demo/demo-provisioner';
import { edgeFunctionProvisioner } from '@/features/users/services/provisioning/edge-function.provisioner';
import type { UserAccountProvisioner } from '@/features/users/services/provisioning/types';

/**
 * The provisioner the application uses.
 *
 * Resolved per call rather than at import time, so the demo build can stand in
 * a local implementation. The production branch talks to the provision-account
 * Edge Function, which is the only place the service role key exists.
 */
export function getUserAccountProvisioner(): UserAccountProvisioner {
  return isDemoMode() ? demoProvisioner : edgeFunctionProvisioner;
}

export type { ProvisionedAccount, UserAccountProvisioner } from './types';
