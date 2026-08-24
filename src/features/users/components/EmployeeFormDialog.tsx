import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';

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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getDepartments, getDesignations } from '@/constants/organization';
import {
  employeeFormSchema,
  normaliseEmployeeValues,
  type EmployeeFormValues,
  type EmployeeInput,
} from '@/features/users/types';
import { USER_ROLES, USER_ROLE_LABELS, type UserProfile } from '@/types/auth';

const DEPARTMENT_OPTIONS = getDepartments();
const DESIGNATION_OPTIONS = getDesignations();

const EMPTY_VALUES: EmployeeFormValues = {
  name: '',
  email: '',
  mobile: '',
  designation: 'helper',
  department: 'printing',
  role: 'viewer',
  isActive: true,
};

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provided when editing; absent when adding a new employee. */
  employee?: UserProfile | undefined;
  isSaving: boolean;
  /** Receives normalised values. Resolves once the save succeeded. */
  onSubmit: (values: EmployeeInput) => Promise<void>;
  /** Editing your own account: role and status are locked. */
  isSelf?: boolean;
}

export function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
  isSaving,
  onSubmit,
  isSelf = false,
}: EmployeeFormDialogProps) {
  const isEdit = Boolean(employee);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      employee
        ? {
            name: employee.name,
            email: employee.email,
            mobile: employee.mobile,
            designation: employee.designation,
            department: employee.department,
            role: employee.role,
            isActive: employee.isActive,
          }
        : EMPTY_VALUES,
    );
  }, [open, employee, reset]);

  const submit: SubmitHandler<EmployeeFormValues> = async (values) => {
    await onSubmit(normaliseEmployeeValues(values));
  };

  const designation = watch('designation');
  const department = watch('department');
  const role = watch('role');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit employee' : 'Add employee'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the staff record. The sign-in email cannot be changed.'
              : 'The employee receives an email to set their own password. You never see it.'}
          </DialogDescription>
        </DialogHeader>

        <form
          id="employee-form"
          noValidate
          onSubmit={(event) => void handleSubmit(submit)(event)}
          className="grid gap-4 sm:grid-cols-2"
        >
          <FormField
            id="name"
            label="Full name"
            error={errors.name?.message}
            required
            className="sm:col-span-2"
          >
            <Input id="name" autoComplete="off" {...register('name')} />
          </FormField>

          <FormField
            id="email"
            label="Email"
            error={errors.email?.message}
            hint={isEdit ? 'Linked to the sign-in account' : undefined}
            required
          >
            <Input
              id="email"
              type="email"
              autoComplete="off"
              disabled={isEdit}
              {...register('email')}
            />
          </FormField>

          <FormField
            id="mobile"
            label="Mobile number"
            error={errors.mobile?.message}
            hint="10 digit Indian mobile number"
            required
          >
            <Input id="mobile" inputMode="numeric" autoComplete="off" {...register('mobile')} />
          </FormField>

          <FormField id="designation" label="Designation" error={errors.designation?.message}>
            <Select
              value={designation}
              onValueChange={(value) => {
                setValue('designation', value as EmployeeFormValues['designation'], {
                  shouldDirty: true,
                });
              }}
            >
              <SelectTrigger id="designation">
                <SelectValue placeholder="Select designation" />
              </SelectTrigger>
              <SelectContent>
                {DESIGNATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField id="department" label="Department" error={errors.department?.message}>
            <Select
              value={department}
              onValueChange={(value) => {
                setValue('department', value as EmployeeFormValues['department'], {
                  shouldDirty: true,
                });
              }}
            >
              <SelectTrigger id="department">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="role"
            label="Role"
            error={errors.role?.message}
            hint={isSelf ? 'You cannot change your own role' : 'Decides what the employee can open'}
            className="sm:col-span-2"
          >
            <Select
              value={role}
              disabled={isSelf}
              onValueChange={(value) => {
                setValue('role', value as EmployeeFormValues['role'], { shouldDirty: true });
              }}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {USER_ROLE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </form>

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
          <Button type="submit" form="employee-form" disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isEdit ? 'Save changes' : 'Add employee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
