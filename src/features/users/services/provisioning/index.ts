import { isDemoMode } from '@/config/demo';
import { demoProvisioner } from '@/features/demo/demo-provisioner';
import { secondaryAppProvisioner } from '@/features/users/services/provisioning/secondary-app.provisioner';
import type { UserAccountProvisioner } from '@/features/users/services/provisioning/types';

/**
 * The provisioner the application uses.
 *
 * Resolved per call rather than at import time, so the demo build can stand in
 * a local implementation. Swap the production branch for a Cloud Function
 * implementation when the project moves to the Blaze plan; nothing else in the
 * module needs to change.
 */
export function getUserAccountProvisioner(): UserAccountProvisioner {
  return isDemoMode() ? demoProvisioner : secondaryAppProvisioner;
}

export type { ProvisionedAccount, UserAccountProvisioner } from './types';
