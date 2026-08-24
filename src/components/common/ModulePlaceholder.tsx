import { Construction } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ModulePlaceholderProps {
  module: string;
  description: string;
  /** What this module will do, shown as a short checklist. */
  scope?: string[];
}

/**
 * Rendered by routes whose module has not been built yet. It exists so the
 * shell, routing and layout can be verified end-to-end before any business
 * logic is written - it is not a mock of the eventual feature.
 */
export function ModulePlaceholder({ module, description, scope }: ModulePlaceholderProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Construction className="size-5 text-muted-foreground" aria-hidden="true" />
          <CardTitle>{module}</CardTitle>
          <Badge variant="secondary">Not implemented</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {scope && scope.length > 0 ? (
        <CardContent>
          <p className="mb-2 text-sm font-medium">Planned scope</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {scope.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}
