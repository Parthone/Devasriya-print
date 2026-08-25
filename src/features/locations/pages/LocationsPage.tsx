import { Building2, PencilLine, Plus } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { LocationFormDialog } from '@/features/locations/components/LocationFormDialog';
import {
  useCreateLocation,
  useLocations,
  useUpdateLocation,
} from '@/features/locations/hooks/use-locations';
import type { Location, LocationInput } from '@/features/locations/types';
import { formatMobile } from '@/lib/phone';
import { AppError } from '@/types/common';

/** Pickup offices and their contact people. Owner only, via settings:manage. */
export function LocationsPage() {
  const currentUser = useAuthenticatedUser();
  const locationsQuery = useLocations();
  const createLocation = useCreateLocation(currentUser.uid);
  const updateLocation = useUpdateLocation(currentUser.uid);

  const [isFormOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Location | undefined>(undefined);

  const handleSubmit = async (input: LocationInput): Promise<void> => {
    if (editing) {
      await updateLocation.mutateAsync({ id: editing.id, input });
    } else {
      await createLocation.mutateAsync(input);
    }
    setFormOpen(false);
    setEditing(undefined);
  };

  const locations = locationsQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Pickup offices"
        description="Where customers collect finished work, and who they should contact."
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" /> Add office
          </Button>
        }
      />

      <Card>
        <CardContent>
          {locationsQuery.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : locationsQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {locationsQuery.error instanceof AppError
                ? locationsQuery.error.message
                : 'Could not load the offices.'}
            </p>
          ) : locations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Building2 className="size-6" aria-hidden="true" />
              <p className="text-sm">
                No pickup offices yet. Add one so jobs can say where to collect.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Office</TableHead>
                  <TableHead>Contact person</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell>
                      <div className="font-medium">{location.name}</div>
                      <div className="text-xs text-muted-foreground">{location.address}</div>
                      {location.phone ? (
                        <div className="text-xs text-muted-foreground">
                          {formatMobile(location.phone)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{location.contactName ?? 'Not set'}</div>
                      {location.contactMobile ? (
                        <div className="text-xs text-muted-foreground">
                          {formatMobile(location.contactMobile)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={location.isActive ? 'success' : 'secondary'}>
                        {location.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(location);
                          setFormOpen(true);
                        }}
                      >
                        <PencilLine className="size-4" aria-hidden="true" /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <LocationFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
        location={editing}
        isSaving={createLocation.isPending || updateLocation.isPending}
        onSubmit={handleSubmit}
      />
    </>
  );
}
