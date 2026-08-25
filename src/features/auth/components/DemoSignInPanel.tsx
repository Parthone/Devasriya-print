import { Loader2, PlayCircle } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DEMO_DESCRIPTION, DEMO_LABEL } from '@/config/demo';
import { useAuth } from '@/features/auth/hooks/use-auth';

/**
 * Sign-in panel shown instead of the credential form while demo mode is on.
 *
 * Deliberately plain: no emulator details, no environment names, nothing that
 * belongs in a developer console rather than in front of a client.
 */
export function DemoSignInPanel({ onEntered }: { onEntered: () => void }) {
  const { signIn } = useAuth();
  const [isEntering, setIsEntering] = useState(false);

  const enter = async () => {
    setIsEntering(true);
    await signIn('', '');
    onEntered();
  };

  return (
    <div className="space-y-4">
      <Badge variant="secondary" className="gap-1">
        <PlayCircle className="size-3" aria-hidden="true" /> {DEMO_LABEL}
      </Badge>

      <p className="text-sm text-muted-foreground">{DEMO_DESCRIPTION}</p>

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={isEntering}
        onClick={() => void enter()}
      >
        {isEntering ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Enter Demo
      </Button>

      <p className="text-center text-xs text-muted-foreground">No credentials required.</p>
    </div>
  );
}
