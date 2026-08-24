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

const signInSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type SignInValues = z.infer<typeof signInSchema>;

interface SignInFormProps {
  onSuccess: () => void;
  onForgotPassword: () => void;
}

export function SignInForm({ onSuccess, onForgotPassword }: SignInFormProps) {
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
      onSuccess();
    } catch (error) {
      setFormError(
        error instanceof AppError ? error.message : 'Could not sign in. Please try again.',
      );
    }
  });

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

      <FormField id="email" label="Email" error={errors.email?.message} required>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          aria-invalid={errors.email ? true : undefined}
          {...register('email')}
        />
      </FormField>

      <FormField id="password" label="Password" error={errors.password?.message} required>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          {...register('password')}
        />
      </FormField>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </Button>

      <Button type="button" variant="link" className="w-full" onClick={onForgotPassword}>
        Forgot password?
      </Button>
    </form>
  );
}
