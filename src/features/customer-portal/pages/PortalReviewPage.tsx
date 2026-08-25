import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AudioPlayer } from '@/components/audio/AudioPlayer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/constants/routes';
import { useCustomerSession } from '@/features/auth/hooks/use-auth';
import { CustomerDecisionPanel } from '@/features/customer-portal/components/CustomerDecisionPanel';
import { DesignPreview } from '@/features/designs/components/DesignPreview';
import {
  useDesignsForCustomer,
  useRecordDesignDecision,
} from '@/features/designs/hooks/use-designs';
import {
  approvedDesign,
  isAwaitingDecision,
  type DecisionOutcome,
  type Design,
} from '@/features/designs/types';
import { useJob } from '@/features/jobs/hooks/use-jobs';
import { formatDate } from '@/lib/format';
import type { TranslationKey } from '@/i18n/translations';
import { useTranslation } from '@/i18n/use-translation';

const DECIDED_KEYS: Record<DecisionOutcome, TranslationKey> = {
  approved: 'portal.decided.approved',
  rejected: 'portal.decided.rejected',
  'changes-requested': 'portal.decided.changesRequested',
};

function DecisionSummary({ design }: { design: Design }) {
  const { t } = useTranslation();
  if (!design.decision) return null;
  const { decision } = design;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(DECIDED_KEYS[decision.outcome])}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          {t('portal.decided.on', { date: formatDate(decision.decidedAt) })}
          {decision.source === 'staff' ? ` - ${t('portal.decided.byStaff')}` : ''}
        </p>
        {decision.comment ? (
          <div>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {t('portal.decided.yourComment')}
            </p>
            <p className="whitespace-pre-wrap">{decision.comment}</p>
          </div>
        ) : null}
        {decision.outcome === 'changes-requested' ? (
          <p>{t('portal.decided.waitingNewVersion')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The design review screen.
 *
 * Everything the customer needs in one column: what they asked for, including
 * the voice message they left, what the designer sent, and the three answers
 * they can give. Earlier versions stay listed underneath with whatever was said
 * about them, so a change request never disappears once it has been acted on.
 */
export function PortalReviewPage() {
  const { designId } = useParams<{ designId: string }>();
  const customer = useCustomerSession();
  const { t, language } = useTranslation();

  // Read through the customer-scoped query rather than by id: it is the same
  // query the security rules authorise, so nothing here can reach a design
  // belonging to somebody else even if an id is guessed.
  const designs = useDesignsForCustomer(customer.customerId);
  const decide = useRecordDesignDecision({ uid: customer.uid, name: customer.customerName });

  const design = useMemo(
    () => (designs.data ?? []).find((candidate) => candidate.id === designId) ?? null,
    [designs.data, designId],
  );

  const history = useMemo(
    () =>
      (designs.data ?? [])
        .filter(
          (candidate) =>
            candidate.jobId === design?.jobId &&
            candidate.id !== design.id &&
            candidate.status !== 'draft',
        )
        .sort((a, b) => b.version - a.version),
    [designs.data, design],
  );

  const jobQuery = useJob(design?.jobId);
  const approved = useMemo(
    () => approvedDesign((designs.data ?? []).filter((item) => item.jobId === design?.jobId)),
    [designs.data, design],
  );

  if (designs.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
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

  if (!design || design.status === 'draft') {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-medium">{t('portal.error.notFound')}</p>
        <Button asChild>
          <Link to={ROUTES.portal}>{t('portal.home.title')}</Link>
        </Button>
      </div>
    );
  }

  const job = jobQuery.data;
  const handleDecision = (outcome: DecisionOutcome, comment: string) => {
    decide.mutate({
      design,
      outcome,
      comment,
      source: 'customer',
      previouslyApproved: approved,
      language,
    });
  };

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to={ROUTES.portal}>
          <ArrowLeft className="size-4" aria-hidden="true" /> {t('portal.home.title')}
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('portal.review.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('portal.review.job')} {design.jobNumber} - {design.jobTitle}
        </p>
        <p className="mt-1 text-sm">
          {isAwaitingDecision(design.status)
            ? t('portal.review.currentVersion', { n: design.version })
            : t('portal.review.viewingVersion', { n: design.version })}
        </p>
      </div>

      <DesignPreview
        design={design}
        openLabel={t('portal.review.openFile')}
        unavailableLabel={t('portal.review.previewUnavailable')}
      />

      {design.designerNote ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('portal.review.designerNote')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{design.designerNote}</p>
          </CardContent>
        </Card>
      ) : null}

      {isAwaitingDecision(design.status) ? (
        <CustomerDecisionPanel isSaving={decide.isPending} onSubmit={handleDecision} />
      ) : (
        <DecisionSummary design={design} />
      )}

      {job ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('portal.review.requirement')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm whitespace-pre-wrap">{job.requirementText}</p>
            {job.requirementAudio ? (
              <div>
                <p className="mb-1 text-xs tracking-wide text-muted-foreground uppercase">
                  {t('portal.review.requirementAudio')}
                </p>
                <AudioPlayer attachment={job.requirementAudio} />
              </div>
            ) : null}
            {job.pickupLocationName ? (
              <p className="text-sm text-muted-foreground">
                {t('portal.review.pickup')}: {job.pickupLocationName}
                {job.contactPersonName
                  ? ` - ${t('portal.review.contact')}: ${job.contactPersonName}`
                  : ''}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('portal.review.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('portal.review.noHistory')}</p>
          ) : (
            <ul className="divide-y">
              {history.map((previous) => (
                <li key={previous.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to={`/portal/designs/${previous.id}`}
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {t('portal.review.viewingVersion', { n: previous.version })}
                    </Link>
                    <Badge variant="outline">{formatDate(previous.uploadedAt)}</Badge>
                  </div>
                  {previous.decision ? (
                    <div className="mt-1 text-sm text-muted-foreground">
                      <p>{t(DECIDED_KEYS[previous.decision.outcome])}</p>
                      {previous.decision.comment ? (
                        <p className="whitespace-pre-wrap">{previous.decision.comment}</p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
