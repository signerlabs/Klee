import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { FlipWords } from '@/components/ui/flip-words'
import googleIcon from '@/assets/icons/google.png'
import {
  completeSignupWithPassword,
  sendSignupOtp,
  signInWithGoogle,
  verifySignupOtp,
} from '@/lib/auth'
import {
  signupEmailSchema,
  signupPasswordSchema,
  otpSchema,
  type SignupEmailValues,
  type SignupPasswordValues,
} from '@/lib/auth-schema'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { useAlert } from '@/components/ui/alert-provider'
import type { z } from 'zod'

type Step = 'email' | 'code' | 'password'
type PasswordFieldErrors = Partial<Record<keyof SignupPasswordValues, string>>

const words = ['Local', 'Private', 'Personal']

const mapPasswordIssues = (issues: z.ZodIssue[]): PasswordFieldErrors => {
  if (!issues.length) return {}
  return issues.reduce<PasswordFieldErrors>((acc, issue) => {
    const key = issue.path[0] as keyof SignupPasswordValues
    if (!key) return acc
    acc[key] = issue.message
    return acc
  }, {})
}

export function SignupForm({ className, ...props }: React.ComponentProps<'div'>) {
  const router = useRouter()
  const { showAlert } = useAlert()

  const [step, setStep] = useState<Step>('email')

  const [email, setEmail] = useState<SignupEmailValues['email']>('')
  const [otpCode, setOtpCode] = useState('')
  const [username, setUsername] = useState<SignupPasswordValues['username']>('')
  const [password, setPassword] = useState<SignupPasswordValues['password']>('')
  const [confirmPassword, setConfirmPassword] =
    useState<SignupPasswordValues['confirmPassword']>('')

  const [emailError, setEmailError] = useState<string | null>(null)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [passwordErrors, setPasswordErrors] = useState<PasswordFieldErrors>({})
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)
  const [isCompletingSignup, setIsCompletingSignup] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [failedOtpAttempts, setFailedOtpAttempts] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return

    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [resendCooldown])

  const handleSendCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEmailError(null)

    const parsed = signupEmailSchema.safeParse({ email })
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Please enter a valid email address.'
      setEmailError(message)
      return
    }

    const sanitizedEmail = parsed.data.email.trim().toLowerCase()

    setIsSendingCode(true)
    try {
      await sendSignupOtp(sanitizedEmail)
      setEmail(sanitizedEmail)
      setOtpCode('')
      setFailedOtpAttempts(0)
      showAlert({
        title: 'Verification code sent',
        description: `Check your inbox at ${sanitizedEmail}.`,
      })
      setStep('code')
      setResendCooldown(60)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send verification code.'
      setEmailError(message)
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleResendCode = async () => {
    if (resendCooldown > 0) return

    setOtpError(null)
    setIsSendingCode(true)
    try {
      await sendSignupOtp(email)
      showAlert({
        title: 'New code sent',
        description: `Check your inbox at ${email}.`,
      })
      setResendCooldown(60)
      setFailedOtpAttempts(0)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to resend the code.'
      setOtpError(message)
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleVerifyCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setOtpError(null)

    if (failedOtpAttempts >= 5) {
      setOtpError("You've entered too many codes. Request a new one.")
      return
    }

    const parsedOtp = otpSchema.safeParse(otpCode)
    if (!parsedOtp.success) {
      setOtpError(parsedOtp.error.issues[0]?.message ?? 'Enter the six-digit code.')
      return
    }

    setIsVerifyingCode(true)
    try {
      await verifySignupOtp({ email, token: otpCode })
      setStep('password')
      setResendCooldown(0)
      setFailedOtpAttempts(0)
    } catch (error) {
      console.error('OTP verification failed:', error)
      setFailedOtpAttempts((prev) => prev + 1)
      const nextAttempts = failedOtpAttempts + 1
      const locked = nextAttempts >= 5
      setOtpError(
        locked
          ? "You've entered too many codes. Request a new one."
          : 'The code you entered isn’t valid. Try again.'
      )
    } finally {
      setIsVerifyingCode(false)
    }
  }

  const handleCompleteSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordErrors({})
    setPasswordStatus(null)

    const parsed = signupPasswordSchema.safeParse({
      username,
      password,
      confirmPassword,
    })

    if (!parsed.success) {
      setPasswordErrors(mapPasswordIssues(parsed.error.issues))
      return
    }

    setIsCompletingSignup(true)
    try {
      await completeSignupWithPassword(parsed.data)
      showAlert({
        title: 'Registration complete',
        description: 'You are signed in and ready to go.',
      })
      router.navigate({ to: '/' })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'We could not update your password. Try again.'
      setPasswordStatus(message)
    } finally {
      setIsCompletingSignup(false)
    }
  }

  const handleGoogleSignup = async () => {
    try {
      await signInWithGoogle()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google sign-up failed. Please try again.'
      showAlert({
        variant: 'destructive',
        title: 'Google sign-up failed',
        description: message,
      })
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      {step === 'email' && (
        <form className="flex flex-col gap-6" onSubmit={handleSendCode}>
          <FieldGroup>
            <div className="flex flex-col items-start gap-2 text-center">
              <div className="text-xl font-bold">
                <FlipWords words={words} />
                <span>AI on your desktop</span>
              </div>
              <p className="text-muted-foreground text-sm text-balance">
                Enter your email to receive a verification code
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="signup-email">Email</FieldLabel>
              <Input
                id="signup-email"
                type="email"
                placeholder="m@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={isSendingCode}
              />
              {emailError && <p className="mt-1 text-sm text-destructive">{emailError}</p>}
            </Field>

            <Field>
              <Button type="submit" disabled={isSendingCode}>
                {isSendingCode ? 'Sending code...' : 'Send verification code'}
              </Button>
            </Field>

            <FieldSeparator>Or continue with</FieldSeparator>

            <Field>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignup}
                disabled={isSendingCode}
              >
                <img src={googleIcon} alt="Google" className="h-4 w-4 mr-2" />
                Sign up with Google
              </Button>

              <FieldDescription className="px-6 text-center">
                Already have an account?
                <Button
                  type="button"
                  variant="link"
                  onClick={() => router.navigate({ to: '/login' })}
                >
                  Login
                </Button>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      )}

      {step === 'code' && (
        <form className="flex flex-col gap-6" onSubmit={handleVerifyCode}>
          <FieldGroup>
            <div className="flex flex-col items-start gap-2 text-center">
              <div className="text-xl font-bold">
                <FlipWords words={words} />
                <span>AI on your desktop</span>
              </div>
              <p className="text-muted-foreground text-sm text-balance">
                Enter the 6-digit code from your email.
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="signup-otp">Verification code</FieldLabel>
              <div className="flex justify-center mt-2">
                <InputOTP
                  id="signup-otp"
                  maxLength={6}
                  value={otpCode}
                  onChange={setOtpCode}
                  disabled={isVerifyingCode || failedOtpAttempts >= 5}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <p className="text-sm text-muted-foreground mt-2 text-center">
                The code expires shortly. Request a new one if you need it. Sent to{' '}
                <span className="font-medium text-foreground">{email}</span>.
              </p>
              {otpError && <p className="mt-2 text-sm text-destructive text-center">{otpError}</p>}
            </Field>

            <Field className="flex flex-col gap-2">
              <Button type="submit" disabled={isVerifyingCode || failedOtpAttempts >= 5}>
                {isVerifyingCode ? 'Verifying...' : 'Verify code'}
              </Button>
              {resendCooldown > 0 ? (
                <p className="text-sm text-muted-foreground text-center">
                  Resend available in {resendCooldown}s
                </p>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleResendCode}
                  disabled={isSendingCode || isVerifyingCode}
                >
                  {isSendingCode ? 'Resending...' : 'Resend code'}
                </Button>
              )}
              <p className="text-center text-sm text-muted-foreground">
                Need a fresh start?{' '}
                <Button
                  type="button"
                  variant="link"
                  onClick={() => {
                    setOtpCode('')
                    setOtpError(null)
                    setStep('email')
                    setResendCooldown(0)
                    setFailedOtpAttempts(0)
                  }}
                >
                  Start over
                </Button>
              </p>
            </Field>
          </FieldGroup>
        </form>
      )}

      {step === 'password' && (
        <form className="flex flex-col gap-6" onSubmit={handleCompleteSignup}>
          <FieldGroup>
            <div className="flex flex-col items-start gap-2 text-center">
              <div className="text-xl font-bold">
                <FlipWords words={words} />
                <span>AI on your desktop</span>
              </div>
              <p className="text-muted-foreground text-sm text-balance">
                Set your password and choose a username to finish signing up.
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="signup-username">Username</FieldLabel>
              <Input
                id="signup-username"
                type="text"
                placeholder="Your username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value)
                  if (passwordErrors.username) {
                    setPasswordErrors((prev) => ({ ...prev, username: undefined }))
                  }
                }}
                required
                disabled={isCompletingSignup}
                aria-invalid={Boolean(passwordErrors.username)}
              />
              {passwordErrors.username && (
                <p className="mt-1 text-sm text-destructive">{passwordErrors.username}</p>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="signup-password">Password</FieldLabel>
              <Input
                id="signup-password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (passwordErrors.password) {
                    setPasswordErrors((prev) => ({ ...prev, password: undefined }))
                  }
                }}
                required
                disabled={isCompletingSignup}
                aria-invalid={Boolean(passwordErrors.password)}
              />
              {passwordErrors.password && (
                <p className="mt-1 text-sm text-destructive">{passwordErrors.password}</p>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="signup-confirm-password">Confirm password</FieldLabel>
              <Input
                id="signup-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  if (passwordErrors.confirmPassword) {
                    setPasswordErrors((prev) => ({ ...prev, confirmPassword: undefined }))
                  }
                }}
                required
                disabled={isCompletingSignup}
                aria-invalid={Boolean(passwordErrors.confirmPassword)}
              />
              {passwordErrors.confirmPassword && (
                <p className="mt-1 text-sm text-destructive">{passwordErrors.confirmPassword}</p>
              )}
            </Field>

            {passwordStatus && (
              <p className="text-sm text-destructive text-center">{passwordStatus}</p>
            )}

            <Field>
              <Button type="submit" disabled={isCompletingSignup}>
                {isCompletingSignup ? 'Finishing up...' : 'Complete sign up'}
              </Button>
            </Field>

            <FieldDescription className="text-center">
              Want to use a different email?
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setPassword('')
                  setConfirmPassword('')
                  setPasswordErrors({})
                  setPasswordStatus(null)
                  setStep('email')
                }}
              >
                Start over
              </Button>
            </FieldDescription>
          </FieldGroup>
        </form>
      )}
    </div>
  )
}
