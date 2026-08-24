import { Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/hooks/use-theme';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Sun className="size-4 dark:hidden" aria-hidden="true" />
          <Moon className="hidden size-4 dark:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            setTheme('light');
          }}
          aria-current={theme === 'light'}
        >
          <Sun className="size-4" aria-hidden="true" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setTheme('dark');
          }}
          aria-current={theme === 'dark'}
        >
          <Moon className="size-4" aria-hidden="true" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setTheme('system');
          }}
          aria-current={theme === 'system'}
        >
          <Monitor className="size-4" aria-hidden="true" /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
