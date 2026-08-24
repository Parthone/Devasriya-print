import { Check, Lock, Minus } from 'lucide-react';
import { Fragment } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  type Permission,
} from '@/features/permissions/catalogue';
import { OWNER_ONLY_PERMISSIONS, resolvePermissions } from '@/features/permissions/matrix';
import { USER_ROLES, USER_ROLE_LABELS, type UserRole } from '@/types/auth';

const ROLE_PERMISSION_SETS: Record<UserRole, Set<Permission>> = Object.fromEntries(
  USER_ROLES.map((role) => [role, new Set(resolvePermissions(role))]),
) as Record<UserRole, Set<Permission>>;

const OWNER_ONLY = new Set<Permission>(OWNER_ONLY_PERMISSIONS);

/**
 * Read-only reference of who can do what.
 *
 * It renders the live role matrix rather than a copy of it, so it can never
 * drift from the rules the application actually enforces.
 */
export function RolesPage() {
  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="What each role can do in Devasriya Print."
      />

      <Card>
        <CardHeader>
          <CardTitle>Permission matrix</CardTitle>
          <CardDescription>
            These are the defaults built into this version. Permissions are not editable yet -
            changing them is a Settings feature planned for a later module.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">Permission</TableHead>
                {USER_ROLES.map((role) => (
                  <TableHead key={role} className="text-center">
                    {USER_ROLE_LABELS[role]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSION_GROUPS.map((group) => (
                <Fragment key={group.title}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={USER_ROLES.length + 1} className="text-xs font-medium">
                      {group.title}
                    </TableCell>
                  </TableRow>
                  {group.permissions.map((permission) => (
                    <TableRow key={permission}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{PERMISSION_LABELS[permission]}</span>
                          {OWNER_ONLY.has(permission) ? (
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <Lock className="size-3" aria-hidden="true" /> Owner only
                            </Badge>
                          ) : null}
                        </div>
                        <code className="text-xs text-muted-foreground">{permission}</code>
                      </TableCell>
                      {USER_ROLES.map((role) => {
                        const allowed = ROLE_PERMISSION_SETS[role].has(permission);
                        return (
                          <TableCell key={role} className="text-center">
                            {allowed ? (
                              <>
                                <Check className="mx-auto size-4 text-success" aria-hidden="true" />
                                <span className="sr-only">
                                  {USER_ROLE_LABELS[role]} can {PERMISSION_LABELS[permission]}
                                </span>
                              </>
                            ) : (
                              <>
                                <Minus
                                  className="mx-auto size-4 text-muted-foreground/50"
                                  aria-hidden="true"
                                />
                                <span className="sr-only">
                                  {USER_ROLE_LABELS[role]} cannot {PERMISSION_LABELS[permission]}
                                </span>
                              </>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
