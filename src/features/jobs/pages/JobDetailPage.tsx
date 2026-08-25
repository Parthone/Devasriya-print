import { ArrowLeft, PencilLine, UserCog } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AudioPlayer } from '@/components/audio/AudioPlayer';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/constants/routes';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { AssignJobDialog } from '@/features/jobs/components/AssignJobDialog';
import { JobFormDialog, type JobSubmitPayload } from '@/features/jobs/components/JobFormDialog';
import { JobPriorityBadge, JobStatusBadge } from '@/features/jobs/components/JobStatusBadge';
import { useAssignJob, useJob, useUpdateJob } from '@/features/jobs/hooks/use-jobs';
import type { Job } from '@/features/jobs/types';
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

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const currentUser = useAuthenticatedUser();
  const actor = { uid: currentUser.uid, name: currentUser.name };

  const jobQuery = useJob(jobId);
  const updateJob = useUpdateJob(actor);
  const assignJob = useAssignJob(actor);

  const [isEditOpen, setEditOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Job | null>(null);

  if (jobQuery.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (jobQuery.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {jobQuery.error instanceof AppError ? jobQuery.error.message : 'Could not load this job.'}
      </p>
    );
  }

  const job = jobQuery.data;

  if (!job) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-xl font-semibold">Job not found</h1>
        <Button asChild>
          <Link to={ROUTES.jobs}>Back to jobs</Link>
        </Button>
      </div>
    );
  }

  const handleEdit = async (payload: JobSubmitPayload): Promise<void> => {
    await updateJob.mutateAsync({
      previous: job,
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

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to={ROUTES.jobs}>
          <ArrowLeft className="size-4" aria-hidden="true" /> All jobs
        </Link>
      </Button>

      <PageHeader
        title={job.jobNumber}
        description={`${job.title} - ${job.customerName}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Can permission="jobs:assign">
              <Button
                variant="outline"
                onClick={() => {
                  setAssignTarget(job);
                }}
              >
                <UserCog className="size-4" aria-hidden="true" /> Assign
              </Button>
            </Can>
            <Can permission="jobs:edit">
              <Button
                variant="outline"
                onClick={() => {
                  setEditOpen(true);
                }}
              >
                <PencilLine className="size-4" aria-hidden="true" /> Edit
              </Button>
            </Can>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <JobStatusBadge status={job.status} />
        <JobPriorityBadge priority={job.priority} />
        {job.assignedToName ? (
          <span className="text-sm text-muted-foreground">Assigned to {job.assignedToName}</span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Requirement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm whitespace-pre-wrap">{job.requirementText}</p>
            {job.requirementAudio ? (
              <AudioPlayer attachment={job.requirementAudio} />
            ) : (
              <p className="text-sm text-muted-foreground">No voice recording.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="Job date" value={formatDate(job.jobDate)} />
              <DetailRow
                label="Expected delivery"
                value={job.expectedDeliveryDate ? formatDate(job.expectedDeliveryDate) : 'Not set'}
              />
              <DetailRow
                label="Customer"
                value={`${job.customerName} (${formatMobile(job.customerMobile)})`}
              />
              <DetailRow
                label="From enquiry"
                value={job.enquiryNumber ?? 'Direct job, no enquiry'}
              />
              {job.internalNotes ? (
                <DetailRow label="Internal notes" value={job.internalNotes} />
              ) : null}
              <DetailRow label="Created" value={formatDateTime(job.createdAt)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Collection</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="Pickup office" value={job.pickupLocationName ?? 'Not chosen yet'} />
              <DetailRow label="Contact person" value={job.contactPersonName ?? 'Not set'} />
              <DetailRow
                label="Contact number"
                value={job.contactPersonMobile ? formatMobile(job.contactPersonMobile) : 'Not set'}
              />
            </dl>
          </CardContent>
        </Card>

        {job.enquiryId ? (
          <Card>
            <CardHeader>
              <CardTitle>Enquiry</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                Converted from{' '}
                <Link to={`/enquiries/${job.enquiryId}`} className="underline underline-offset-2">
                  {job.enquiryNumber}
                </Link>
                . The requirement and any recording came from that enquiry.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <JobFormDialog
        open={isEditOpen}
        onOpenChange={setEditOpen}
        job={job}
        isSaving={updateJob.isPending}
        onSubmit={handleEdit}
      />

      <AssignJobDialog
        job={assignTarget}
        isSaving={assignJob.isPending}
        onCancel={() => {
          setAssignTarget(null);
        }}
        onConfirm={(assignee) => {
          assignJob.mutate(
            { jobId: job.id, assignee },
            {
              onSettled: () => {
                setAssignTarget(null);
              },
            },
          );
        }}
      />
    </>
  );
}
