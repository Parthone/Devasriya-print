import type {
  ProvisionedAccount,
  UserAccountProvisioner,
} from '@/features/users/services/provisioning/types';

let counter = 0;

/**
 * Account provisioning while demo mode is on.
 *
 * Creates a local id and does nothing else - no network call, no account, no
 * email. It exists so the employee and portal screens can be demonstrated end
 * to end; the real Edge Function provisioner is untouched and is what
 * production uses.
 */
export const demoProvisioner: UserAccountProvisioner = {
  name: 'demo',
  canManageAccountState: false,

  createAccount(): Promise<ProvisionedAccount> {
    counter += 1;
    return Promise.resolve({ uid: `demo-account-${String(counter)}` });
  },

  createCustomerAccount(): Promise<ProvisionedAccount> {
    counter += 1;
    return Promise.resolve({ uid: `demo-portal-${String(counter)}` });
  },

  sendPasswordSetupEmail(): Promise<void> {
    return Promise.resolve();
  },
};
