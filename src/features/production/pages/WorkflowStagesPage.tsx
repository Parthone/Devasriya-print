import { GripVertical, Loader2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { FormField } from '@/components/common/FormField';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/constants/organization';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import {
  useCreateWorkflowStage,
  useUpdateWorkflowStage,
  useWorkflowStages,
} from '@/features/production/hooks/use-production';
import type { WorkflowStage, WorkflowStageInput } from '@/features/production/types';
import { AppError } from '@/types/common';

interface StageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage?: WorkflowStage | undefined;
  nextPosition: number;
  isSaving: boolean;
  onSubmit: (input: WorkflowStageInput) => void;
}

function StageDialog({
  open,
  onOpenChange,
  stage,
  nextPosition,
  isSaving,
  onSubmit,
}: StageDialogProps) {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState<Department>('printing');
  const [position, setPosition] = useState('0');
  const [isActive, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(stage?.name ?? '');
    setDepartment(stage?.department ?? 'printing');
    setPosition(String(stage?.position ?? nextPosition));
    setActive(stage?.isActive ?? true);
    setError(null);
  }, [open, stage, nextPosition]);

  const submit = () => {
    if (name.trim().length < 2) {
      setError('Give the stage a name');
      return;
    }
    onSubmit({ name: name.trim(), department, position: Number(position), isActive });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{stage ? 'Edit stage' : 'Add a stage'}</DialogTitle>
          <DialogDescription>
            Stages run in the order below. Changing a name here does not rewrite the jobs that
            already went through it - every task keeps the name it was made with.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField id="stage-name" label="Stage name" error={error ?? undefined} required>
            <Input
              id="stage-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          </FormField>

          <FormField id="stage-department" label="Department" required>
            <Select
              value={department}
              onValueChange={(value) => {
                setDepartment(value as Department);
              }}
            >
              <SelectTrigger id="stage-department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {DEPARTMENT_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField id="stage-position" label="Order" hint="Lower numbers run first.">
            <Input
              id="stage-position"
              type="number"
              min={0}
              max={99}
              value={position}
              onChange={(event) => {
                setPosition(event.target.value);
              }}
            />
          </FormField>

          {stage ? (
            <FormField
              id="stage-active"
              label="In use"
              hint="A stage that is switched off stops appearing on new jobs. Jobs already running keep theirs."
            >
              <Button
                id="stage-active"
                type="button"
                variant={isActive ? 'default' : 'outline'}
                onClick={() => {
                  setActive((current) => !current);
                }}
              >
                {isActive ? 'In use' : 'Not in use'}
              </Button>
            </FormField>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {stage ? 'Save changes' : 'Add stage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The shop's own list of production stages.
 *
 * No two print shops run the same sequence, and a shop's own sequence changes
 * as it grows - so this is data the owner edits, not something baked into the
 * software. Stages are switched off rather than deleted: a job that went
 * through "Lamination" last month still has to say so.
 */
export function WorkflowStagesPage() {
  const currentUser = useAuthenticatedUser();
  const stages = useWorkflowStages();
  const create = useCreateWorkflowStage(currentUser.uid);
  const update = useUpdateWorkflowStage(currentUser.uid);

  const [isOpen, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkflowStage | undefined>(undefined);

  const list = stages.data ?? [];
  const nextPosition = list.reduce((highest, stage) => Math.max(highest, stage.position), -1) + 1;

  const submit = (input: WorkflowStageInput) => {
    if (editing) {
      update.mutate(
        { id: editing.id, input },
        {
          onSuccess: () => {
            setOpen(false);
          },
        },
      );
      return;
    }
    create.mutate(input, {
      onSuccess: () => {
        setOpen(false);
      },
    });
  };

  return (
    <>
      <PageHeader
        title="Production Stages"
        description="The sequence work moves through on the shop floor. Jobs sent to production pick up whichever stages are in use at that moment."
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" /> Add stage
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4">
          {stages.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : stages.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {stages.error instanceof AppError
                ? stages.error.message
                : 'Could not load the stages.'}
            </p>
          ) : list.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No stages yet. Add the first one - a job cannot be sent to production until at least
              one stage exists.
            </p>
          ) : (
            <ol className="divide-y">
              {list.map((stage) => (
                <li key={stage.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <GripVertical className="size-4 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {stage.position + 1}. {stage.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {DEPARTMENT_LABELS[stage.department]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {stage.isActive ? (
                      <Badge variant="success">In use</Badge>
                    ) : (
                      <Badge variant="secondary">Not in use</Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(stage);
                        setOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <StageDialog
        open={isOpen}
        onOpenChange={setOpen}
        stage={editing}
        nextPosition={nextPosition}
        isSaving={create.isPending || update.isPending}
        onSubmit={submit}
      />
    </>
  );
}
