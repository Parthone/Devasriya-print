import type {
  ProvisionedAccount,
  UserAccountProvisioner,
} from '@/features/users/services/provisioning/types';

let counter = 0;

/**
 * Account provisioning while demo mode is on.
 *
 * Creates a local id and does nothing else - no Firebase app, no account, no
 * email. It exists so the employee screens can be demonstrated end to end; the
 * real secondary-app provisioner is untouched and is what production uses.
 */
export const demoProvisioner: UserAccountProvisioner = {
  name: 'demo',
  canManageAccountState: false,

  createAccount(): Promise<ProvisionedAccount> {
    counter += 1;
    return Promise.resolve({ uid: `demo-account-${String(counter)}` });
  },

  sendPasswordSetupEmail(): Promise<void> {
    return Promise.resolve();
  },
};
