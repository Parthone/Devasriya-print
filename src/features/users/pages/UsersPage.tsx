import { Loader2, Plus, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

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
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DEPARTMENT_LABELS } from '@/constants/organization';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { EmployeeFormDialog } from '@/features/users/components/EmployeeFormDialog';
import { EmployeeTable } from '@/features/users/components/EmployeeTable';
import {
  useCreateEmployee,
  useResendPasswordEmail,
  useSetUserActive,
  useUpdateEmployee,
  useUsers,
} from '@/features/users/hooks/use-users';
import type { EmployeeInput } from '@/features/users/types';
import type { UserProfile } from '@/types/auth';
import { AppError } from '@/types/common';

function matches(employee: UserProfile, term: string): boolean {
  const haystack = [
    employee.name,
    employee.email,
    employee.mobile,
    DEPARTMENT_LABELS[employee.department],
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term.toLowerCase());
}

/** Staff directory and account management. Owner and admin roles only. */
export function UsersPage() {
  const currentUser = useAuthenticatedUser();
  const usersQuery = useUsers();
  const createEmployee = useCreateEmployee(currentUser.uid);
  const updateEmployee = useUpdateEmployee(currentUser.uid);
  const setActive = useSetUserActive(currentUser.uid);
  const resendPassword = useResendPasswordEmail();

  const [search, setSearch] = useState('');
  const [isFormOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserProfile | undefined>(undefined);
  const [statusTarget, setStatusTarget] = useState<UserProfile | null>(null);

  const employees = useMemo(() => {
    const list = usersQuery.data ?? [];
    return search.trim() ? list.filter((employee) => matches(employee, search.trim())) : list;
  }, [usersQuery.data, search]);

  const handleSubmit = async (values: EmployeeInput): Promise<void> => {
    if (editing) {
      const { email: _email, ...changes } = values;
      await updateEmployee.mutateAsync({ uid: editing.id, changes });
    } else {
      await createEmployee.mutateAsync(values);
    }
    setFormOpen(false);
    setEditing(undefined);
  };

  const isSaving = createEmployee.isPending || updateEmployee.isPending;

  return (
    <>
      <PageHeader
        title="Employees"
        description="Staff accounts, roles and access to Devasriya Print."
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" /> Add employee
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search
              className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Search by name, email, mobile or department"
              aria-label="Search employees"
              className="pl-8"
            />
          </div>

          {usersQuery.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : usersQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {usersQuery.error instanceof AppError
                ? usersQuery.error.message
                : 'Could not load employees.'}
            </p>
          ) : employees.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Users className="size-6" aria-hidden="true" />
              <p className="text-sm">
                {search ? 'No employees match that search.' : 'No employees yet.'}
              </p>
            </div>
          ) : (
            <EmployeeTable
              employees={employees}
              currentUserId={currentUser.uid}
              onEdit={(employee) => {
                setEditing(employee);
                setFormOpen(true);
              }}
              onToggleActive={(employee) => {
                setStatusTarget(employee);
              }}
              onResendPassword={(employee) => {
                resendPassword.mutate(employee.email);
              }}
            />
          )}
        </CardContent>
      </Card>

      <EmployeeFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
        employee={editing}
        isSelf={editing?.id === currentUser.uid}
        isSaving={isSaving}
        onSubmit={handleSubmit}
      />

      <AlertDialog
        open={statusTarget !== null}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.isActive ? 'Deactivate this employee?' : 'Activate this employee?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.isActive
                ? `${statusTarget.name} will be signed out and blocked from opening the software until reactivated. Their records and history are kept.`
                : `${statusTarget?.name ?? 'This employee'} will be able to sign in again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setActive.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={setActive.isPending}
              onClick={() => {
                if (!statusTarget) return;
                setActive.mutate(
                  { uid: statusTarget.id, isActive: !statusTarget.isActive },
                  {
                    onSettled: () => {
                      setStatusTarget(null);
                    },
                  },
                );
              }}
            >
              {setActive.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {statusTarget?.isActive ? 'Deactivate' : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
