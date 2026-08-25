import { AlertTriangle, MessageSquareText, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import {
  EnquiryFormDialog,
  type EnquirySubmitPayload,
} from '@/features/enquiries/components/EnquiryFormDialog';
import { EnquiryCardList, EnquiryTable } from '@/features/enquiries/components/EnquiryTable';
import { useCreateEnquiry, useEnquiryDirectory } from '@/features/enquiries/hooks/use-enquiries';
import {
  DEFAULT_PAGE_SIZE,
  dueForFollowUp,
  queryEnquiries,
  type EnquiryStatusFilter,
} from '@/features/enquiries/services/enquiry-search';
import { ENQUIRY_STATUSES, ENQUIRY_STATUS_LABELS } from '@/features/enquiries/types';
import { Can } from '@/features/permissions/components/Can';
import { AppError } from '@/types/common';

const STATUS_OPTIONS: { value: EnquiryStatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
  ...ENQUIRY_STATUSES.map((status) => ({
    value: status,
    label: ENQUIRY_STATUS_LABELS[status],
  })),
];

export function EnquiriesPage() {
  const currentUser = useAuthenticatedUser();
  const actor = { uid: currentUser.uid, name: currentUser.name };

  const directory = useEnquiryDirectory();
  const createEnquiry = useCreateEnquiry(actor);

  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<EnquiryStatusFilter>('open');
  const [page, setPage] = useState(1);
  const [isFormOpen, setFormOpen] = useState(false);

  const enquiries = useMemo(() => directory.data?.enquiries ?? [], [directory.data]);
  const result = useMemo(
    () => queryEnquiries(enquiries, { term, status, page, pageSize: DEFAULT_PAGE_SIZE }),
    [enquiries, term, status, page],
  );
  const dueCount = useMemo(() => dueForFollowUp(enquiries).length, [enquiries]);

  const handleSubmit = async (payload: EnquirySubmitPayload): Promise<void> => {
    await createEnquiry.mutateAsync({
      input: payload.input,
      customer: {
        id: payload.customer.id,
        name: payload.customer.name,
        mobile: payload.customer.mobile,
      },
      recording: payload.recording,
    });
    setFormOpen(false);
  };

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="What customers have asked for, and what still needs chasing."
        actions={
          <Can permission="enquiries:create">
            <Button
              onClick={() => {
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" /> New enquiry
            </Button>
          </Can>
        }
      />

      {directory.data?.capReached ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Showing the {directory.data.cap} most recent enquiries only. Search covers this set.
          </span>
        </div>
      ) : null}

      {dueCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          {dueCount} {dueCount === 1 ? 'enquiry needs' : 'enquiries need'} a follow-up today or
          earlier.
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Search number, customer, mobile or requirement"
                aria-label="Search enquiries"
                className="pl-8"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as EnquiryStatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="sm:w-48" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {directory.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : directory.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {directory.error instanceof AppError
                ? directory.error.message
                : 'Could not load enquiries.'}
            </p>
          ) : result.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <MessageSquareText className="size-6" aria-hidden="true" />
              <p className="text-sm">
                {term || status !== 'open'
                  ? 'No enquiries match this search.'
                  : 'No open enquiries. Add one when a customer asks for something.'}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden sm:block">
                <EnquiryTable enquiries={result.items} />
              </div>
              <div className="sm:hidden">
                <EnquiryCardList enquiries={result.items} />
              </div>

              <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Showing {result.items.length} of {result.total} enquiries
                  {result.pageCount > 1 ? ` (page ${result.page} of ${result.pageCount})` : ''}
                </p>
                {result.pageCount > 1 ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={result.page <= 1}
                      onClick={() => {
                        setPage((current) => Math.max(1, current - 1));
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={result.page >= result.pageCount}
                      onClick={() => {
                        setPage((current) => current + 1);
                      }}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <EnquiryFormDialog
        open={isFormOpen}
        onOpenChange={setFormOpen}
        isSaving={createEnquiry.isPending}
        onSubmit={handleSubmit}
      />
    </>
  );
}
