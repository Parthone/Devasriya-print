import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useTheme } from '@/hooks/use-theme';

function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      position="top-right"
      richColors
      closeButton
      {...props}
    />
  );
}

export { Toaster };
