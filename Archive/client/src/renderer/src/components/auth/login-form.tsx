import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FlipWords } from '@/components/ui/flip-words'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import googleIcon from '@/assets/icons/google.png'
import { signInWithEmail, signInWithGoogle } from '@/lib/auth'
import { AuthApiError } from '@supabase/supabase-js'
import { loginSchema, type LoginValues } from '@/lib/auth-schema'
import { useAlert } from '@/components/ui/alert-provider'
import { ResetPasswordForm } from './resetpwd-form'

type LoginFormProps = {
  className?: string
}

export function LoginForm({ className }: LoginFormProps) {
  const words = ['Local', 'Private', 'Personal']
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState<LoginValues['email']>('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof LoginValues, string>>>({})
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const { showAlert } = useAlert()

  const handleEmailSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitted(true)
    setFieldErrors({})

    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      const errors: Partial<Record<keyof LoginValues, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (key === 'email' || key === 'password') {
          errors[key] = issue.message
        }
      }
      setFieldErrors(errors)
      return
    }

    const { email: safeEmail, password: safePassword } = parsed.data
    setIsLoading(true)
    try {
      await signInWithEmail(safeEmail, safePassword)
      showAlert({
        title: 'Welcome back',
        description: 'You are now signed in.',
      })
      setFieldErrors({})
      router.navigate({ to: '/' })
    } catch (error) {
      if (error instanceof AuthApiError) {
        const message =
          error.code === 'invalid_credentials'
            ? 'Invalid email or password.\nPlease sign up or verify your account if needed.'
            : "We couldn't sign you in right now. Please try again."
        setFieldErrors({
          password: message,
        })
        return
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.'
      console.error('Google sign-in error:', message)
      showAlert({
        variant: 'destructive',
        title: 'Google sign-in failed',
        description: message,
      })
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {showResetPassword ? (
        <div className="flex flex-col gap-4">
          <ResetPasswordForm
            onClose={() => {
              setShowResetPassword(false)
            }}
          />
        </div>
      ) : (
        <form className="flex flex-col gap-6" onSubmit={handleEmailSignIn}>
          <FieldGroup>
            <div className="flex flex-col items-start gap-2 text-center">
              <div className="text-xl font-bold">
                <FlipWords words={words} />
                <span>AI on your desktop</span>
              </div>
              <p className="text-muted-foreground text-sm text-balance">
                Enter your email below to login to your account
              </p>
            </div>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: undefined }))
                  }
                }}
                disabled={isLoading}
              />
              {isSubmitted && fieldErrors.email && (
                <p className="mt-1 text-sm text-destructive">{fieldErrors.email}</p>
              )}
            </Field>
            <Field>
              <div className="flex items-center">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <button
                  type="button"
                  onClick={() => setShowResetPassword(true)}
                  className="ml-auto text-sm underline-offset-4 hover:underline"
                >
                  Forgot your password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }))
                  }
                }}
                disabled={isLoading}
              />
              {isSubmitted && fieldErrors.password && (
                <p className="mt-1 text-sm text-destructive whitespace-pre-line">
                  {fieldErrors.password}
                </p>
              )}
            </Field>
            <Field>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Login'}
              </Button>
            </Field>
            <FieldSeparator>Or continue with</FieldSeparator>
            <Field>
              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
              >
                <img src={googleIcon} alt="Google" className="h-4 w-4 mr-2" />
                Continue with Google
              </Button>
              <FieldDescription className="text-center">
                Don&apos;t have an account?
                <Button
                  type="button"
                  variant={'link'}
                  onClick={() => router.navigate({ to: '/signup' })}
                >
                  Sign up
                </Button>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      )}
    </div>
  )
}
