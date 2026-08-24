import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormField } from '@/components/common/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { AppError } from '@/types/common';

const resetSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
});

type ResetValues = z.infer<typeof resetSchema>;

export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const { sendPasswordReset } = useAuth();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await sendPasswordReset(values.email);
      // Always report success: confirming whether an email exists would leak
      // which staff addresses are registered.
      setSent(true);
    } catch (error) {
      if (error instanceof AppError && error.code === 'invalid-input') {
        setFormError(error.message);
        return;
      }
      setSent(true);
    }
  });

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          If that email belongs to a Devasriya Print account, a password reset link is on its way.
          The link expires after a short time.
        </p>
        <Button variant="outline" className="w-full" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-4">
      {formError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      ) : null}

      <FormField
        id="reset-email"
        label="Email"
        error={errors.email?.message}
        hint="We will email you a link to set a new password."
        required
      >
        <Input
          id="reset-email"
          type="email"
          autoComplete="username"
          autoFocus
          aria-invalid={errors.email ? true : undefined}
          {...register('email')}
        />
      </FormField>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Send reset link
      </Button>

      <Button type="button" variant="link" className="w-full" onClick={onBack}>
        Back to sign in
      </Button>
    </form>
  );
}
