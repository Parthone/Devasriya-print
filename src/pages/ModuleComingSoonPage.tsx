import { useLocation } from 'react-router-dom';

import { ModulePlaceholder } from '@/components/common/ModulePlaceholder';
import { PageHeader } from '@/components/common/PageHeader';
import { getModuleByRoute } from '@/constants/modules';
import { NAV_SECTIONS } from '@/constants/routes';

function findNavLabel(pathname: string): string | undefined {
  for (const section of NAV_SECTIONS) {
    const match = section.items.find((item) => item.path === pathname);
    if (match) return match.label;
  }
  return undefined;
}

/**
 * Route target for modules that have not been built yet. Reads the roadmap so
 * the page always matches docs/MODULES.md.
 */
export function ModuleComingSoonPage() {
  const { pathname } = useLocation();
  const module = getModuleByRoute(pathname);
  const title = module?.title ?? findNavLabel(pathname) ?? 'Module not implemented';

  return (
    <>
      <PageHeader
        title={title}
        description={module ? `Module ${String(module.index)}` : 'Not implemented yet'}
      />
      <ModulePlaceholder
        module={title}
        description={
          module?.description ??
          'This area of the application has not been built yet. It will be implemented in its own module.'
        }
        {...(module ? { scope: module.scope } : {})}
      />
    </>
  );
}
