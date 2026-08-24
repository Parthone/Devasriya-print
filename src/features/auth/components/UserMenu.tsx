import { LogOut, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { USER_ROLE_LABELS } from '@/types/auth';
import { AppError } from '@/types/common';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

export function UserMenu() {
  const { session, signOut } = useAuth();
  const [isSigningOut, setSigningOut] = useState(false);

  if (session.status !== 'authenticated') return null;
  const { user } = session;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      toast.success('Signed out');
    } catch (error) {
      toast.error('Could not sign out', {
        description: error instanceof AppError ? error.message : 'Please try again.',
      });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            {initialsOf(user.name)}
          </span>
          <span className="hidden text-left leading-tight sm:flex sm:flex-col">
            <span className="text-sm font-medium">{user.name}</span>
            <span className="text-xs text-muted-foreground">{USER_ROLE_LABELS[user.role]}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <ShieldCheck className="size-4" aria-hidden="true" />
          {USER_ROLE_LABELS[user.role]}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isSigningOut}
          onSelect={(event) => {
            event.preventDefault();
            void handleSignOut();
          }}
        >
          <LogOut className="size-4" aria-hidden="true" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
