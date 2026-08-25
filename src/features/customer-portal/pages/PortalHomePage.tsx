import { ChevronRight, Inbox } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomerSession } from '@/features/auth/hooks/use-auth';
import { useDesignsForCustomer } from '@/features/designs/hooks/use-designs';
import type { Design } from '@/features/designs/types';
import { formatDate } from '@/lib/format';
import { useTranslation } from '@/i18n/use-translation';
import type { TranslationKey } from '@/i18n/translations';

const STATUS_KEYS: Record<Design['status'], TranslationKey> = {
  draft: 'portal.status.draft',
  'submitted-for-review': 'portal.status.submitted-for-review',
  approved: 'portal.status.approved',
  rejected: 'portal.status.rejected',
  'changes-requested': 'portal.status.changes-requested',
  superseded: 'portal.status.superseded',
};

function DesignRow({ design }: { design: Design }) {
  const { t } = useTranslation();

  return (
    <li>
      <Link
        to={`/portal/designs/${design.id}`}
        className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/60"
      >
        <div className="min-w-0">
          <p className="font-medium">
            {t('portal.home.job')} {design.jobNumber}
          </p>
          <p className="truncate text-sm text-muted-foreground">{design.jobTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('portal.home.version', { n: design.version })} - {formatDate(design.uploadedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={design.status === 'approved' ? 'success' : 'warning'}>
            {t(STATUS_KEYS[design.status])}
          </Badge>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </Link>
    </li>
  );
}

/**
 * What the customer sees when they sign in.
 *
 * Only their own designs: the query is scoped by their customer id, which is
 * the same condition the security rules apply, so a wider request would be
 * refused by the database rather than merely filtered here.
 */
export function PortalHomePage() {
  const customer = useCustomerSession();
  const { t } = useTranslation();
  const designs = useDesignsForCustomer(customer.customerId);

  const { awaiting, answered } = useMemo(() => {
    const visible = (designs.data ?? []).filter((design) => design.status !== 'draft');
    return {
      awaiting: visible.filter((design) => design.status === 'submitted-for-review'),
      answered: visible.filter((design) => design.status !== 'submitted-for-review'),
    };
  }, [designs.data]);

  if (designs.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (designs.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('portal.error.loading')}
      </p>
    );
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('portal.home.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('portal.home.subtitle')}</p>
      </div>

      {awaiting.length === 0 && answered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Inbox className="size-6" aria-hidden="true" />
          <p className="text-sm">{t('portal.home.empty')}</p>
        </div>
      ) : null}

      {awaiting.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('portal.home.awaiting')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {awaiting.map((design) => (
                <DesignRow key={design.id} design={design} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {answered.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('portal.home.done')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {answered.map((design) => (
                <DesignRow key={design.id} design={design} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
