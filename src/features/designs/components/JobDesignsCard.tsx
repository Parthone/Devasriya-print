import { Check, ImagePlus, MessageSquare, Send, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { DesignPreview } from '@/features/designs/components/DesignPreview';
import { DesignStatusBadge } from '@/features/designs/components/DesignStatusBadge';
import {
  DesignUploadDialog,
  type DesignUploadPayload,
} from '@/features/designs/components/DesignUploadDialog';
import { StaffDecisionDialog } from '@/features/designs/components/StaffDecisionDialog';
import {
  useDesignsForJob,
  useRecordDesignDecision,
  useSubmitDesign,
  useUploadDesign,
} from '@/features/designs/hooks/use-designs';
import {
  approvedDesign,
  currentDesign,
  isAwaitingDecision,
  nextVersionNumber,
  type DecisionOutcome,
  type Design,
} from '@/features/designs/types';
import type { Job } from '@/features/jobs/types';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';
import { formatDateTime } from '@/lib/format';

function DecisionNote({ design }: { design: Design }) {
  if (!design.decision) return null;
  const { decision } = design;

  return (
    <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs">
      <p className="flex items-center gap-1 font-medium">
        <MessageSquare className="size-3" aria-hidden="true" />
        {decision.source === 'customer'
          ? `${decision.byName} answered in the portal`
          : `${decision.byName} recorded this for the customer`}
        {' - '}
        {formatDateTime(decision.decidedAt)}
      </p>
      {decision.comment ? <p className="mt-1 whitespace-pre-wrap">{decision.comment}</p> : null}
    </div>
  );
}

/**
 * The design conversation for one job.
 *
 * Every version stays on screen with its own outcome and comment, newest first,
 * so the history of what was asked for and what was said about it is readable
 * without opening anything.
 */
export function JobDesignsCard({ job }: { job: Job }) {
  const currentUser = useAuthenticatedUser();
  const actor = { uid: currentUser.uid, name: currentUser.name };
  const { can } = usePermissions();

  const designs = useDesignsForJob(job.id);
  const upload = useUploadDesign(actor);
  const submit = useSubmitDesign(actor);
  const decide = useRecordDesignDecision(actor);

  const [isUploadOpen, setUploadOpen] = useState(false);
  const [decision, setDecision] = useState<{ design: Design; outcome: DecisionOutcome } | null>(
    null,
  );

  const versions = designs.data ?? [];
  const current = currentDesign(versions);
  const approved = approvedDesign(versions);

  const handleUpload = (payload: DesignUploadPayload) => {
    upload.mutate(
      {
        job,
        existing: versions,
        file: payload.file,
        mimeType: payload.mimeType,
        originalFileName: payload.originalFileName,
        designerNote: payload.designerNote,
        submitNow: payload.submitNow,
      },
      {
        onSuccess: () => {
          setUploadOpen(false);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Designs</CardTitle>
        {can('designs:upload') ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setUploadOpen(true);
            }}
          >
            <ImagePlus className="size-4" aria-hidden="true" />
            {versions.length === 0 ? 'Upload design' : 'Upload revision'}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {designs.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : versions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No design has been uploaded for this job yet.
          </p>
        ) : (
          <>
            {approved ? (
              <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm">
                Version {approved.version} is approved and ready for production.
              </p>
            ) : null}

            {current ? (
              <DesignPreview
                design={current}
                openLabel="Open"
                unavailableLabel="Preview is not available."
              />
            ) : null}

            <ul className="divide-y">
              {versions.map((design) => (
                <li key={design.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        Version {design.version}
                        {design.id === current?.id ? ' - current' : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {design.uploadedByName}, {formatDateTime(design.uploadedAt)}
                      </p>
                    </div>
                    <DesignStatusBadge status={design.status} />
                  </div>

                  {design.designerNote ? (
                    <p className="mt-2 text-sm whitespace-pre-wrap">{design.designerNote}</p>
                  ) : null}

                  <DecisionNote design={design} />

                  <div className="mt-2 flex flex-wrap gap-2">
                    {can('designs:upload') && design.status === 'draft' ? (
                      <Button
                        size="sm"
                        disabled={submit.isPending}
                        onClick={() => {
                          submit.mutate(design);
                        }}
                      >
                        <Send className="size-4" aria-hidden="true" /> Send for approval
                      </Button>
                    ) : null}

                    {can('designs:approve') && isAwaitingDecision(design.status) ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDecision({ design, outcome: 'approved' });
                          }}
                        >
                          <Check className="size-4" aria-hidden="true" /> Record approval
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDecision({ design, outcome: 'changes-requested' });
                          }}
                        >
                          <MessageSquare className="size-4" aria-hidden="true" /> Changes requested
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDecision({ design, outcome: 'rejected' });
                          }}
                        >
                          <X className="size-4" aria-hidden="true" /> Record rejection
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>

      <DesignUploadDialog
        open={isUploadOpen}
        onOpenChange={setUploadOpen}
        nextVersion={nextVersionNumber(versions)}
        isSaving={upload.isPending}
        onSubmit={handleUpload}
      />

      <StaffDecisionDialog
        design={decision?.design ?? null}
        outcome={decision?.outcome ?? 'approved'}
        isSaving={decide.isPending}
        onCancel={() => {
          setDecision(null);
        }}
        onConfirm={(comment) => {
          if (!decision) return;
          decide.mutate(
            {
              design: decision.design,
              outcome: decision.outcome,
              comment,
              source: 'staff',
              previouslyApproved: approved,
            },
            {
              onSettled: () => {
                setDecision(null);
              },
            },
          );
        }}
      />
    </Card>
  );
}
