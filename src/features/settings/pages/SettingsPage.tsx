import { Building2, Calculator, ShieldCheck, UserCog, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import type { Permission } from '@/features/permissions/catalogue';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';

interface SettingsLink {
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
  permission: Permission;
}

const SECTIONS: SettingsLink[] = [
  {
    label: 'Employees',
    description: 'Staff accounts, roles and who is still with the business.',
    path: ROUTES.users,
    icon: UserCog,
    permission: 'employees:view',
  },
  {
    label: 'Roles & Permissions',
    description: 'What each role may see and do, and the trail of who changed it.',
    path: ROUTES.roles,
    icon: ShieldCheck,
    permission: 'settings:view',
  },
  {
    label: 'Products & Rates',
    description: 'The rate card new pricing lines start from.',
    path: ROUTES.products,
    icon: Calculator,
    permission: 'settings:manage',
  },
  {
    label: 'Production Stages',
    description: 'The stages work moves through, in order.',
    path: ROUTES.workflowStages,
    icon: Workflow,
    permission: 'settings:manage',
  },
  {
    label: 'Pickup Offices',
    description: 'Where customers collect finished work.',
    path: ROUTES.locations,
    icon: Building2,
    permission: 'settings:manage',
  },
];

/**
 * The settings hub.
 *
 * Each section is a real screen owned by the module that built it; this page
 * only gathers them, and shows a person exactly the ones their role can open.
 */
export function SettingsPage() {
  const { can } = usePermissions();
  const sections = SECTIONS.filter((section) => can(section.permission));

  return (
    <>
      <PageHeader title="Settings" description="How the business is set up." />

      {sections.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Your role does not manage any settings.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Card key={section.path} className="transition-colors hover:bg-accent/40">
              <Link to={section.path}>
                <CardContent className="flex items-start gap-3 py-1">
                  <section.icon
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{section.label}</p>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
