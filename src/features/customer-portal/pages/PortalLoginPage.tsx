import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { FormField } from '@/components/common/FormField';
import { FullPageLoader } from '@/components/common/FullPageLoader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { isDemoMode } from '@/config/demo';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useTranslation } from '@/i18n/use-translation';

interface LocationState {
  from?: string;
}

/**
 * Customer sign-in.
 *
 * A separate page from the staff sign-in on purpose. It is the same Firebase
 * Auth underneath, but the two are different doors: a customer never sees the
 * staff screen and a staff member is redirected out of this one, so nobody has
 * to work out which kind of account they are holding.
 */
export function PortalLoginPage() {
  const { session, signIn, sendPasswordReset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  if (session.status === 'loading') {
    return <FullPageLoader label={t('portal.signIn.working')} />;
  }

  if (session.status === 'customer') {
    const target = (location.state as LocationState | null)?.from ?? ROUTES.portal;
    return <Navigate to={target} replace />;
  }

  if (session.status === 'authenticated') {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsWorking(true);

    void (async () => {
      try {
        // Demo mode signs the visitor straight in as the sample customer; no
        // Firebase call is made and the credentials are ignored.
        await signIn(email, password);
        void navigate(ROUTES.portal, { replace: true });
      } catch {
        setError(t('portal.error.signIn'));
      } finally {
        setIsWorking(false);
      }
    })();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('portal.signIn.title')}</CardTitle>
        <CardDescription>{t('portal.signIn.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm">
              {notice}
            </p>
          ) : null}

          <FormField id="portal-email" label={t('portal.signIn.email')} required>
            <Input
              id="portal-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              required={!isDemoMode()}
            />
          </FormField>

          <FormField id="portal-password" label={t('portal.signIn.password')} required>
            <Input
              id="portal-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              required={!isDemoMode()}
            />
          </FormField>

          <Button type="submit" className="w-full" disabled={isWorking}>
            {isWorking ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isWorking ? t('portal.signIn.working') : t('portal.signIn.submit')}
          </Button>

          <div className="flex flex-col gap-2 text-center">
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => {
                setNotice(t('portal.signIn.forgotSent'));
                void sendPasswordReset(email).catch(() => undefined);
              }}
            >
              {t('portal.signIn.forgot')}
            </Button>
            <p className="text-xs text-muted-foreground">{t('portal.signIn.staffHint')}</p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
