import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
import type { ProductionTask } from '@/features/production/types';
import type { Id } from '@/types/common';

const NOBODY = 'nobody';

interface AssignTaskDialogProps {
  task: ProductionTask | null;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (assignee: { id: Id; name: string } | null) => void;
}

/**
 * Puts a name against a stage.
 *
 * Only active employees are offered, and the database refuses a deactivated one
 * anyway - a stage assigned to somebody who has left is work nobody is doing
 * that looks exactly like work somebody is doing.
 */
export function AssignTaskDialog({ task, isSaving, onCancel, onConfirm }: AssignTaskDialogProps) {
  const employees = useUsers();
  const [selected, setSelected] = useState<string>(NOBODY);

  const active = useMemo(
    () => (employees.data ?? []).filter((employee) => employee.isActive),
    [employees.data],
  );

  useEffect(() => {
    setSelected(task?.assignedToId ?? NOBODY);
  }, [task]);

  const submit = () => {
    if (selected === NOBODY) {
      onConfirm(null);
      return;
    }
    const employee = active.find((candidate) => candidate.id === selected);
    onConfirm(employee ? { id: employee.id, name: employee.name } : null);
  };

  return (
    <Dialog
      open={task !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign this stage</DialogTitle>
          <DialogDescription>
            {task
              ? `${task.stageName}. Recorded in the job's production history, including who it was taken from.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <FormField id="assignee" label="Who is doing this" hint="Active employees only.">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="assignee">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>Nobody yet</SelectItem>
              {active.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.name} - {employee.designation}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
