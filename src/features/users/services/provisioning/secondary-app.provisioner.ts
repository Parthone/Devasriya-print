import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';

import { parseFirebaseEnv } from '@/config/env';
import { sendPasswordSetupEmail } from '@/features/auth/services/auth.service';
import type {
  ProvisionedAccount,
  UserAccountProvisioner,
} from '@/features/users/services/provisioning/types';
import { connectAuthEmulatorFor } from '@/lib/firebase/emulators';
import { toAppError } from '@/lib/firebase/errors';
import { AppError } from '@/types/common';

let instanceCounter = 0;

/**
 * Generates a throwaway password.
 *
 * It is never shown to anyone: the account is created with it, and the employee
 * immediately receives a password-setup email to choose their own. The
 * administrator therefore never knows a staff password.
 */
function generateTemporaryPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('');
  return `Dp1!${body.slice(0, 28)}`;
}

/**
 * Creates staff accounts from the browser using a secondary Firebase app.
 *
 * A secondary app has its own Auth instance, so signing in as the new user
 * happens in an isolated session and the administrator stays signed in. The
 * secondary session is signed out and the app deleted straight away.
 *
 * Known limitation of this approach: email/password sign-up stays enabled on
 * the Firebase project. An account created outside this flow has no profile
 * document, and both the application and firestore.rules reject such a user, so
 * it grants no access to any data.
 */
export const secondaryAppProvisioner: UserAccountProvisioner = {
  name: 'secondary-app',
  canManageAccountState: false,

  async createAccount(email: string): Promise<ProvisionedAccount> {
    const config = parseFirebaseEnv();
    if (!config.ok) {
      throw new AppError('invalid-input', config.message);
    }

    instanceCounter += 1;
    const app = initializeApp(config.env, `user-provisioning-${String(instanceCounter)}`);
    const auth = getAuth(app);
    connectAuthEmulatorFor(auth);

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        generateTemporaryPassword(),
      );
      return { uid: credential.user.uid };
    } catch (error) {
      throw toAppError(error);
    } finally {
      await signOut(auth).catch(() => undefined);
      await deleteApp(app).catch(() => undefined);
    }
  },

  async sendPasswordSetupEmail(email: string): Promise<void> {
    await sendPasswordSetupEmail(email);
  },
};
