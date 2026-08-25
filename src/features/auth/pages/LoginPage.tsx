import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { FullPageLoader } from '@/components/common/FullPageLoader';
import { isDemoMode } from '@/config/demo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DemoSignInPanel } from '@/features/auth/components/DemoSignInPanel';
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm';
import { SignInForm } from '@/features/auth/components/SignInForm';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { ROUTES } from '@/constants/routes';
import { SESSION_REJECTION_MESSAGES } from '@/types/auth';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'sign-in' | 'forgot-password'>('sign-in');
  const demo = isDemoMode();

  if (session.status === 'loading') {
    return <FullPageLoader label="Checking your session..." />;
  }

  if (session.status === 'authenticated') {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  // A customer who lands on the staff sign-in belongs in the review portal.
  if (session.status === 'customer') {
    return <Navigate to={ROUTES.portal} replace />;
  }

  const redirectTo = (location.state as LocationState | null)?.from ?? ROUTES.dashboard;

  // Demo mode replaces the credential form entirely: nothing to type, nothing
  // authenticated. The production sign-in path below is untouched.
  if (demo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Printing and advertising job management.</CardDescription>
        </CardHeader>
        <CardContent>
          <DemoSignInPanel
            onEntered={() => {
              void navigate(redirectTo, { replace: true });
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'sign-in' ? 'Sign in' : 'Reset your password'}</CardTitle>
        <CardDescription>
          {mode === 'sign-in'
            ? 'Staff accounts only. Contact your administrator if you need access.'
            : 'Enter the email address your administrator registered.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'sign-in' && session.rejection ? (
          <p
            role="alert"
            className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
          >
            {SESSION_REJECTION_MESSAGES[session.rejection]}
          </p>
        ) : null}

        {mode === 'sign-in' ? (
          <SignInForm
            onSuccess={() => {
              void navigate(redirectTo, { replace: true });
            }}
            onForgotPassword={() => {
              setMode('forgot-password');
            }}
          />
        ) : (
          <ForgotPasswordForm
            onBack={() => {
              setMode('sign-in');
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
