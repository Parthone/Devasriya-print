import { ArrowLeft, Ban, Check, PencilLine, Printer, Send, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/constants/routes';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { DecisionDialog } from '@/features/estimates/components/DecisionDialog';
import {
  EstimateFormDialog,
  type EstimateFormPayload,
} from '@/features/estimates/components/EstimateFormDialog';
import { QuotationView } from '@/features/estimates/components/QuotationView';
import {
  useCloseEstimate,
  useEstimate,
  useMarkEstimateSent,
  useRecordEstimateDecision,
  useUpdateDraftEstimate,
} from '@/features/estimates/hooks/use-estimates';
import { canTransition, isEditable } from '@/features/estimates/types';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';
import { formatDateTime } from '@/lib/format';
import { AppError } from '@/types/common';

export function EstimateDetailPage() {
  const { estimateId } = useParams<{ estimateId: string }>();
  const currentUser = useAuthenticatedUser();
  const actor = { uid: currentUser.uid, name: currentUser.name };
  const { can } = usePermissions();

  const estimateQuery = useEstimate(estimateId);
  const updateDraft = useUpdateDraftEstimate(actor);
  const markSent = useMarkEstimateSent(actor);
  const recordDecision = useRecordEstimateDecision(actor);
  const close = useCloseEstimate(actor);

  const [isEditOpen, setEditOpen] = useState(false);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [isCancelOpen, setCancelOpen] = useState(false);

  if (estimateQuery.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (estimateQuery.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {estimateQuery.error instanceof AppError
          ? estimateQuery.error.message
          : 'Could not load this quotation.'}
      </p>
    );
  }

  const estimate = estimateQuery.data;

  if (!estimate) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-xl font-semibold">Quotation not found</h1>
        <Button asChild>
          <Link to={ROUTES.estimates}>Back to quotations</Link>
        </Button>
      </div>
    );
  }

  // The buttons follow the same transition table the service and the security
  // rules use, so nothing is offered that would be refused.
  const canEdit = can('estimates:edit') && isEditable(estimate.status);
  const canSend = can('estimates:edit') && canTransition(estimate.status, 'sent');
  const canDecide = can('estimates:approve') && canTransition(estimate.status, 'approved');
  const canCancel = can('estimates:edit') && canTransition(estimate.status, 'cancelled');

  const handleEdit = async (payload: EstimateFormPayload): Promise<void> => {
    await updateDraft.mutateAsync({ estimate, ...payload });
    setEditOpen(false);
  };

  return (
    <>
      <div className="no-print space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link to={ROUTES.estimates}>
            <ArrowLeft className="size-4" aria-hidden="true" /> All quotations
          </Link>
        </Button>

        <PageHeader
          title={estimate.estimateNumber}
          description={`${estimate.jobNumber} - ${estimate.customerName}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  window.print();
                }}
              >
                <Printer className="size-4" aria-hidden="true" /> Print
              </Button>
              {canEdit ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditOpen(true);
                  }}
                >
                  <PencilLine className="size-4" aria-hidden="true" /> Edit
                </Button>
              ) : null}
              {canSend ? (
                <Button
                  disabled={markSent.isPending}
                  onClick={() => {
                    markSent.mutate(estimate);
                  }}
                >
                  <Send className="size-4" aria-hidden="true" /> Mark sent
                </Button>
              ) : null}
              {canDecide ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDecision('approved');
                    }}
                  >
                    <Check className="size-4" aria-hidden="true" /> Record approval
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDecision('rejected');
                    }}
                  >
                    <X className="size-4" aria-hidden="true" /> Record rejection
                  </Button>
                </>
              ) : null}
              {canCancel ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setCancelOpen(true);
                  }}
                >
                  <Ban className="size-4" aria-hidden="true" /> Cancel
                </Button>
              ) : null}
            </div>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Record</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Job{' '}
              <Link to={`/jobs/${estimate.jobId}`} className="underline underline-offset-2">
                {estimate.jobNumber}
              </Link>
              . The prices below were copied from that job when this quotation was created and do
              not change afterwards.
            </p>
            <p className="text-muted-foreground">
              Created {formatDateTime(estimate.createdAt)}.
              {estimate.sentAt ? ` Sent ${formatDateTime(estimate.sentAt)}.` : ''}
              {estimate.cancelledAt ? ` Cancelled ${formatDateTime(estimate.cancelledAt)}.` : ''}
            </p>
            {estimate.decision ? (
              <p>
                {estimate.decision.outcome === 'approved' ? 'Approved' : 'Rejected'} by the
                customer, recorded {formatDateTime(estimate.decision.at)} by{' '}
                {estimate.decision.byName}.
                {estimate.decision.note ? ` "${estimate.decision.note}"` : ''}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <QuotationView estimate={estimate} />

      <EstimateFormDialog
        open={isEditOpen}
        onOpenChange={setEditOpen}
        estimate={estimate}
        isSaving={updateDraft.isPending}
        onSubmit={(payload) => {
          void handleEdit(payload);
        }}
      />

      <DecisionDialog
        estimate={decision ? estimate : null}
        outcome={decision ?? 'approved'}
        isSaving={recordDecision.isPending}
        onCancel={() => {
          setDecision(null);
        }}
        onConfirm={(note) => {
          if (!decision) return;
          recordDecision.mutate(
            { estimate, outcome: decision, note },
            {
              onSettled: () => {
                setDecision(null);
              },
            },
          );
        }}
      />

      <AlertDialog open={isCancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this quotation?</AlertDialogTitle>
            <AlertDialogDescription>
              {estimate.estimateNumber} stays on record but can no longer be sent or approved. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={close.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={close.isPending}
              onClick={() => {
                close.mutate(
                  { estimate, status: 'cancelled' },
                  {
                    onSettled: () => {
                      setCancelOpen(false);
                    },
                  },
                );
              }}
            >
              Cancel quotation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
