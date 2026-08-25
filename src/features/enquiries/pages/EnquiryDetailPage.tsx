import { ArrowLeft, ArrowRightLeft, MessageSquarePlus, PencilLine } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AudioPlayer } from '@/components/audio/AudioPlayer';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/constants/routes';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import {
  EnquiryFormDialog,
  type EnquirySubmitPayload,
} from '@/features/enquiries/components/EnquiryFormDialog';
import { EnquiryStatusBadge } from '@/features/enquiries/components/EnquiryStatusBadge';
import { FollowUpDialog } from '@/features/enquiries/components/FollowUpDialog';
import {
  useAddFollowUp,
  useEnquiry,
  useUpdateEnquiry,
} from '@/features/enquiries/hooks/use-enquiries';
import { ENQUIRY_SOURCE_LABELS, type Enquiry } from '@/features/enquiries/types';
import {
  ConvertToJobDialog,
  type ConversionPayload,
} from '@/features/jobs/components/ConvertToJobDialog';
import { useConvertEnquiry } from '@/features/jobs/hooks/use-jobs';
import { Can } from '@/features/permissions/components/Can';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatMobile } from '@/lib/phone';
import { AppError } from '@/types/common';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 sm:grid-cols-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm sm:col-span-3">{value}</dd>
    </div>
  );
}

export function EnquiryDetailPage() {
  const { enquiryId } = useParams<{ enquiryId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthenticatedUser();
  const actor = { uid: currentUser.uid, name: currentUser.name };

  const enquiryQuery = useEnquiry(enquiryId);
  const updateEnquiry = useUpdateEnquiry(actor);
  const addFollowUp = useAddFollowUp(actor);
  const convert = useConvertEnquiry(actor);

  const [isEditOpen, setEditOpen] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState<Enquiry | null>(null);
  const [convertTarget, setConvertTarget] = useState<Enquiry | null>(null);

  if (enquiryQuery.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (enquiryQuery.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {enquiryQuery.error instanceof AppError
          ? enquiryQuery.error.message
          : 'Could not load this enquiry.'}
      </p>
    );
  }

  const enquiry = enquiryQuery.data;

  if (!enquiry) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-xl font-semibold">Enquiry not found</h1>
        <Button asChild>
          <Link to={ROUTES.enquiries}>Back to enquiries</Link>
        </Button>
      </div>
    );
  }

  const handleEdit = async (payload: EnquirySubmitPayload): Promise<void> => {
    await updateEnquiry.mutateAsync({
      previous: enquiry,
      input: payload.input,
      customer: {
        id: payload.customer.id,
        name: payload.customer.name,
        mobile: payload.customer.mobile,
      },
      change: payload.change,
    });
    setEditOpen(false);
  };

  const handleConvert = (payload: ConversionPayload): void => {
    convert.mutate(
      { enquiry, ...payload },
      {
        onSuccess: (job) => {
          setConvertTarget(null);
          void navigate(`/jobs/${job.id}`);
        },
      },
    );
  };

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to={ROUTES.enquiries}>
          <ArrowLeft className="size-4" aria-hidden="true" /> All enquiries
        </Link>
      </Button>

      <PageHeader
        title={enquiry.enquiryNumber}
        description={`${enquiry.customerName} - ${formatMobile(enquiry.customerMobile)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Can permission="enquiries:edit">
              <Button
                variant="outline"
                onClick={() => {
                  setFollowUpTarget(enquiry);
                }}
              >
                <MessageSquarePlus className="size-4" aria-hidden="true" /> Follow-up
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditOpen(true);
                }}
              >
                <PencilLine className="size-4" aria-hidden="true" /> Edit
              </Button>
            </Can>
            <Can permission="jobs:create">
              {enquiry.convertedJobId ? (
                <Button variant="outline" asChild>
                  <Link to={`/jobs/${enquiry.convertedJobId}`}>View job</Link>
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setConvertTarget(enquiry);
                  }}
                >
                  <ArrowRightLeft className="size-4" aria-hidden="true" /> Convert to job
                </Button>
              )}
            </Can>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <EnquiryStatusBadge status={enquiry.status} />
        {enquiry.assignedToName ? (
          <span className="text-sm text-muted-foreground">
            Assigned to {enquiry.assignedToName}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Requirement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm whitespace-pre-wrap">{enquiry.requirementText}</p>
            {enquiry.requirementAudio ? (
              <AudioPlayer attachment={enquiry.requirementAudio} owner="enquiries" />
            ) : (
              <p className="text-sm text-muted-foreground">No voice recording.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enquiry</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="Date" value={formatDate(enquiry.enquiryDate)} />
              <DetailRow label="Source" value={ENQUIRY_SOURCE_LABELS[enquiry.source]} />
              <DetailRow
                label="Customer"
                value={`${enquiry.customerName} (${formatMobile(enquiry.customerMobile)})`}
              />
              <DetailRow
                label="Next follow-up"
                value={enquiry.nextFollowUpAt ? formatDate(enquiry.nextFollowUpAt) : 'None set'}
              />
              {enquiry.lostReason ? (
                <DetailRow label="Lost because" value={enquiry.lostReason} />
              ) : null}
              {enquiry.notes ? <DetailRow label="Notes" value={enquiry.notes} /> : null}
              <DetailRow label="Created" value={formatDateTime(enquiry.createdAt)} />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Follow-ups</CardTitle>
          </CardHeader>
          <CardContent>
            {enquiry.followUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ol className="divide-y">
                {enquiry.followUps.map((entry) => (
                  <li key={`${String(entry.at.getTime())}-${entry.byId}`} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{entry.byName}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(entry.at)}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{entry.note}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <EnquiryFormDialog
        open={isEditOpen}
        onOpenChange={setEditOpen}
        enquiry={enquiry}
        isSaving={updateEnquiry.isPending}
        onSubmit={handleEdit}
      />

      <FollowUpDialog
        enquiry={followUpTarget}
        isSaving={addFollowUp.isPending}
        onCancel={() => {
          setFollowUpTarget(null);
        }}
        onSubmit={(note, nextFollowUpAt) => {
          addFollowUp.mutate(
            { enquiry, note, nextFollowUpAt },
            {
              onSuccess: () => {
                setFollowUpTarget(null);
              },
            },
          );
        }}
      />

      <ConvertToJobDialog
        enquiry={convertTarget}
        isSaving={convert.isPending}
        onCancel={() => {
          setConvertTarget(null);
        }}
        onConfirm={handleConvert}
      />
    </>
  );
}
