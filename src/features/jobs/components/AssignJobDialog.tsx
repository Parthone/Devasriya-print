import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { FormField } from '@/components/common/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUsers } from '@/features/users/hooks/use-users';
import type { Job } from '@/features/jobs/types';
import { USER_ROLE_LABELS } from '@/types/auth';

const UNASSIGNED = 'unassigned';

interface AssignJobDialogProps {
  job: Job | null;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (assignee: { id: string; name: string } | null) => void;
}

/**
 * Assigns a job to a staff member.
 *
 * Only rendered for holders of jobs:assign, which is owner and admin - the same
 * roles that may read the staff directory, so no extra access is needed.
 */
export function AssignJobDialog({ job, isSaving, onCancel, onConfirm }: AssignJobDialogProps) {
  const usersQuery = useUsers();
  const [selected, setSelected] = useState<string>(UNASSIGNED);

  useEffect(() => {
    setSelected(job?.assignedToId ?? UNASSIGNED);
  }, [job]);

  const employees = (usersQuery.data ?? []).filter((employee) => employee.isActive);

  return (
    <Dialog
      open={job !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign job</DialogTitle>
          <DialogDescription>{job ? `${job.jobNumber} - ${job.title}` : ''}</DialogDescription>
        </DialogHeader>

        <FormField id="assignee" label="Responsible employee">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="assignee">
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Nobody yet</SelectItem>
              {employees.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.name} - {USER_ROLE_LABELS[employee.role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => {
              const employee = employees.find((entry) => entry.id === selected);
              onConfirm(employee ? { id: employee.id, name: employee.name } : null);
            }}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
