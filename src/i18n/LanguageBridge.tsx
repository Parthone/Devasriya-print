import type { ReactNode } from 'react';

import { useAuth } from '@/features/auth/hooks/use-auth';
import { I18nProvider } from '@/i18n/I18nProvider';

/**
 * Feeds the signed-in customer's preferred language into the i18n layer.
 *
 * Module 3 already records whether a customer reads Hindi or English, so a
 * customer who has never touched the toggle still opens the portal in their own
 * language. An explicit choice in this browser still wins.
 */
export function LanguageBridge({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const preferred = session.status === 'customer' ? session.customer.preferredLanguage : undefined;

  return <I18nProvider preferred={preferred}>{children}</I18nProvider>;
}
