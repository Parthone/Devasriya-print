import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Placeholder sign-in screen.
 *
 * No form is wired up on purpose: authentication is Module 1. Rendering this
 * route proves the auth shell and routing work before any credentials are
 * handled.
 */
export function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Authentication is not implemented yet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          Module 1 adds Firebase Authentication, user profiles and protected routes. Until then
          every route is open in local development.
        </p>
      </CardContent>
    </Card>
  );
}
