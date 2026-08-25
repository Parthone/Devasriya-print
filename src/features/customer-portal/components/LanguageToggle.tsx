import { Languages } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { LANGUAGES } from '@/constants/india';
import { LANGUAGE_ENDONYMS } from '@/i18n/translations';
import { useTranslation } from '@/i18n/use-translation';

/**
 * Hindi / English.
 *
 * Deliberately two plain buttons rather than a dropdown: it has to be obvious
 * and reachable on a phone. Each button is labelled in its own language, never
 * translated - somebody who opened the wrong one has to be able to read their
 * way out.
 */
export function LanguageToggle() {
  const { language, setLanguage, t } = useTranslation();

  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('language.switch')}>
      <Languages className="size-4 text-muted-foreground" aria-hidden="true" />
      {LANGUAGES.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={option === language ? 'default' : 'ghost'}
          aria-pressed={option === language}
          onClick={() => {
            setLanguage(option);
          }}
        >
          {LANGUAGE_ENDONYMS[option]}
        </Button>
      ))}
    </div>
  );
}
