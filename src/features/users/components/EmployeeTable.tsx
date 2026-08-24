import { History, KeyRound, MoreHorizontal, PencilLine, UserCheck, UserX } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DEPARTMENT_LABELS, DESIGNATION_LABELS } from '@/constants/organization';
import { formatMobile } from '@/features/users/types';
import { USER_ROLE_LABELS, type UserProfile } from '@/types/auth';
import type { Id } from '@/types/common';

interface EmployeeTableProps {
  employees: UserProfile[];
  currentUserId: Id;
  /** Holder of employees:manage - without it the directory is read-only. */
  canManage: boolean;
  /** Holder of employees:manage-admins - required to touch owner/admin rows. */
  canManageAdmins: boolean;
  onEdit: (employee: UserProfile) => void;
  onToggleActive: (employee: UserProfile) => void;
  onResendPassword: (employee: UserProfile) => void;
  onViewHistory: (employee: UserProfile) => void;
}

export function EmployeeTable({
  employees,
  currentUserId,
  canManage,
  canManageAdmins,
  onEdit,
  onToggleActive,
  onResendPassword,
  onViewHistory,
}: EmployeeTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((employee) => {
          const isSelf = employee.id === currentUserId;
          // Admin and owner records may only be changed by somebody who can
          // manage administrators.
          const isPrivileged = employee.role === 'owner' || employee.role === 'admin';
          const canEditRow = canManage && (!isPrivileged || canManageAdmins);
          return (
            <TableRow key={employee.id}>
              <TableCell>
                <div className="font-medium">
                  {employee.name}
                  {isSelf ? (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {DESIGNATION_LABELS[employee.designation]}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">{employee.email}</div>
                <div className="text-xs text-muted-foreground">{formatMobile(employee.mobile)}</div>
              </TableCell>
              <TableCell className="text-sm">{DEPARTMENT_LABELS[employee.department]}</TableCell>
              <TableCell className="text-sm">{USER_ROLE_LABELS[employee.role]}</TableCell>
              <TableCell>
                <Badge variant={employee.isActive ? 'success' : 'secondary'}>
                  {employee.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              {canManage ? (
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${employee.name}`}
                      >
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={!canEditRow}
                        onSelect={() => {
                          onEdit(employee);
                        }}
                      >
                        <PencilLine className="size-4" aria-hidden="true" /> Edit details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          onViewHistory(employee);
                        }}
                      >
                        <History className="size-4" aria-hidden="true" /> View history
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!canEditRow}
                        onSelect={() => {
                          onResendPassword(employee);
                        }}
                      >
                        <KeyRound className="size-4" aria-hidden="true" /> Send password email
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={isSelf || !canEditRow}
                        onSelect={() => {
                          onToggleActive(employee);
                        }}
                      >
                        {employee.isActive ? (
                          <>
                            <UserX className="size-4" aria-hidden="true" /> Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="size-4" aria-hidden="true" /> Activate
                          </>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
