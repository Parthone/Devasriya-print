import { CheckCircle2, CircleDashed, CircleDot, XCircle } from 'lucide-react';

import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_CONFIG } from '@/config/app.config';
import { parseFirebaseEnv, shouldUseEmulators } from '@/config/env';
import { MODULE_STATUS_LABELS, MODULES, type ModuleStatus } from '@/constants/modules';

const STATUS_ICON: Record<ModuleStatus, typeof CheckCircle2> = {
  done: CheckCircle2,
  'in-progress': CircleDot,
  planned: CircleDashed,
};

const STATUS_VARIANT: Record<ModuleStatus, 'success' | 'warning' | 'outline'> = {
  done: 'success',
  'in-progress': 'warning',
  planned: 'outline',
};

/**
 * Foundation dashboard. It reports the state of the environment only - business
 * metrics arrive with the reporting module, and nothing here is mocked.
 */
export function DashboardPage() {
  const firebaseEnv = parseFirebaseEnv();
  const usingEmulators = shouldUseEmulators();
  const delivered = MODULES.filter((module) => module.status === 'done').length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${APP_CONFIG.tagline} - ${String(delivered)} of ${String(MODULES.length)} modules delivered.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
          <CardDescription>Live status of this build. No sample data is shown.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <StatusRow
            label="Firebase configuration"
            ok={firebaseEnv.ok}
            okText={`Project ${firebaseEnv.ok ? firebaseEnv.env.projectId : ''}`}
            failText="Missing - copy .env.example to .env.local"
          />
          <StatusRow
            label="Backend target"
            ok
            okText={usingEmulators ? 'Firebase Emulator Suite (local)' : 'Firebase cloud project'}
            failText=""
          />
          <StatusRow
            label="Locale and currency"
            ok
            okText={`${APP_CONFIG.locale} - ${APP_CONFIG.currency} (${APP_CONFIG.currencySymbol})`}
            failText=""
          />
          <StatusRow label="Timezone" ok okText={APP_CONFIG.timeZone} failText="" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Build roadmap</CardTitle>
          <CardDescription>
            Modules are implemented one at a time, each approved before work starts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {MODULES.map((module) => {
              const Icon = STATUS_ICON[module.status];
              return (
                <li key={module.id} className="flex items-start gap-3 py-3">
                  <Icon
                    className={
                      module.status === 'done'
                        ? 'mt-0.5 size-4 shrink-0 text-success'
                        : 'mt-0.5 size-4 shrink-0 text-muted-foreground'
                    }
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Module {String(module.index)}
                      </span>
                      <span className="text-sm font-medium">{module.title}</span>
                      <Badge variant={STATUS_VARIANT[module.status]} className="text-[10px]">
                        {MODULE_STATUS_LABELS[module.status]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{module.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

interface StatusRowProps {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
}

function StatusRow({ label, ok, okText, failText }: StatusRowProps) {
  return (
    <div className="flex items-start gap-2 rounded-md border p-3">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-sm text-muted-foreground">{ok ? okText : failText}</p>
      </div>
    </div>
  );
}
