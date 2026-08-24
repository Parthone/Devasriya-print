import { secondaryAppProvisioner } from '@/features/users/services/provisioning/secondary-app.provisioner';
import type { UserAccountProvisioner } from '@/features/users/services/provisioning/types';

/**
 * The provisioner the application uses.
 *
 * Swap this single binding for a Cloud Function implementation when the project
 * moves to the Blaze plan; nothing else in the module needs to change.
 */
export const userAccountProvisioner: UserAccountProvisioner = secondaryAppProvisioner;

export type { ProvisionedAccount, UserAccountProvisioner } from './types';
