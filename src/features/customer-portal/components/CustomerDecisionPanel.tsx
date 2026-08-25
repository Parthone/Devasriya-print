import { Check, Loader2, MessageSquare, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { DecisionOutcome } from '@/features/designs/types';
import type { TranslationKey } from '@/i18n/translations';
import { useTranslation } from '@/i18n/use-translation';

const HINTS: Record<DecisionOutcome, TranslationKey> = {
  approved: 'portal.decision.commentHintApprove',
  'changes-requested': 'portal.decision.commentHintChanges',
  rejected: 'portal.decision.commentHintReject',
};

const CONFIRM: Record<DecisionOutcome, TranslationKey> = {
  approved: 'portal.decision.confirmApprove',
  'changes-requested': 'portal.decision.confirmChanges',
  rejected: 'portal.decision.confirmReject',
};

/**
 * Approve, ask for changes, or reject - each with room to say something.
 *
 * The comment box stays on screen for approval too. "Approved, but make the
 * phone number bigger" is a real answer, and the second half of it is an
 * instruction that has to reach the designer; hiding the box behind a rejection
 * would quietly throw it away.
 */
export function CustomerDecisionPanel({
  isSaving,
  onSubmit,
}: {
  isSaving: boolean;
  onSubmit: (outcome: DecisionOutcome, comment: string) => void;
}) {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<DecisionOutcome | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const choose = (next: DecisionOutcome) => {
    setOutcome(next);
    setError(null);
  };

  const submit = () => {
    if (!outcome) return;
    if (outcome !== 'approved' && !comment.trim()) {
      setError(t('portal.decision.commentRequired'));
      return;
    }
    onSubmit(outcome, comment);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('portal.decision.heading')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <Button
            type="button"
            variant={outcome === 'approved' ? 'default' : 'outline'}
            aria-pressed={outcome === 'approved'}
            onClick={() => {
              choose('approved');
            }}
          >
            <Check className="size-4" aria-hidden="true" /> {t('portal.decision.approve')}
          </Button>
          <Button
            type="button"
            variant={outcome === 'changes-requested' ? 'default' : 'outline'}
            aria-pressed={outcome === 'changes-requested'}
            onClick={() => {
              choose('changes-requested');
            }}
          >
            <MessageSquare className="size-4" aria-hidden="true" />{' '}
            {t('portal.decision.requestChanges')}
          </Button>
          <Button
            type="button"
            variant={outcome === 'rejected' ? 'destructive' : 'outline'}
            aria-pressed={outcome === 'rejected'}
            onClick={() => {
              choose('rejected');
            }}
          >
            <X className="size-4" aria-hidden="true" /> {t('portal.decision.reject')}
          </Button>
        </div>

        {outcome ? (
          <div className="space-y-2">
            <Label htmlFor="portal-comment">{t('portal.decision.comment')}</Label>
            <Textarea
              id="portal-comment"
              rows={4}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                setError(null);
              }}
            />
            <p className="text-xs text-muted-foreground">{t(HINTS[outcome])}</p>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={isSaving} onClick={submit}>
                {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {isSaving ? t('portal.decision.sending') : t(CONFIRM[outcome])}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isSaving}
                onClick={() => {
                  setOutcome(null);
                  setComment('');
                  setError(null);
                }}
              >
                {t('portal.decision.cancel')}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
