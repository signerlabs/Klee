import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
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
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { useAlert } from '@/components/ui/alert-provider'
import { sendResetOtp, updatePassword, verifyEmailOtp } from '@/lib/auth'
import { signupEmailSchema, resetPasswordSchema, otpSchema } from '@/lib/auth-schema'

type Step = 'email' | 'code' | 'password'

export type ResetPasswordFormProps = {
  onClose?: () => void
}

export function ResetPasswordForm({ onClose }: ResetPasswordFormProps) {
  const words = ['Local', 'Private', 'Personal']
  const router = useRouter()
  const { showAlert } = useAlert()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [emailError, setEmailError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
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

    const normalizedEmail = parsed.data.email.trim().toLowerCase()

    setIsSendingCode(true)
    try {
      await sendResetOtp(normalizedEmail)
      setEmail(normalizedEmail)
      setOtpCode('')
      setFailedOtpAttempts(0)
      showAlert({
        title: 'Verification code sent',
        description: `Check your inbox at ${normalizedEmail}.`,
      })
      setStep('code')
      setResendCooldown(60)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send verification code.'
      if (message.toLowerCase().includes('signups not allowed for otp')) {
        showAlert({
          variant: 'destructive',
          title: 'Reset password unavailable',
          description: 'This project does not allow OTP signup. Please contact support.',
        })
      } else {
        setEmailError(message)
      }
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleResendCode = async () => {
    if (resendCooldown > 0) return

    setCodeError(null)
    setIsSendingCode(true)
    try {
      await sendResetOtp(email)
      showAlert({
        title: 'New code sent',
        description: `Check your inbox at ${email}.`,
      })
      setResendCooldown(60)
      setFailedOtpAttempts(0)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to resend the code.'
      setCodeError(message)
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleVerifyCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCodeError(null)

    if (failedOtpAttempts >= 5) {
      setCodeError("You've entered too many codes. Request a new one.")
      return
    }

    const parsedOtp = otpSchema.safeParse(otpCode)
    if (!parsedOtp.success) {
      setCodeError(parsedOtp.error.issues[0]?.message ?? 'Enter the six-digit code.')
      return
    }

    setIsVerifyingCode(true)
    try {
      await verifyEmailOtp({ email, token: otpCode })
      setPassword('')
      setConfirmPassword('')
      setPasswordError(null)
      setStep('password')
      setResendCooldown(0)
      setFailedOtpAttempts(0)
    } catch (error) {
      console.error('Reset OTP verification failed:', error)
      setFailedOtpAttempts((prev) => prev + 1)
      const nextAttempts = failedOtpAttempts + 1
      const locked = nextAttempts >= 5
      setCodeError(
        locked
          ? "You've entered too many codes. Request a new one."
          : 'The code you entered isn’t valid. Try again.'
      )
    } finally {
      setIsVerifyingCode(false)
    }
  }

  const handleUpdatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordError(null)

    const parsed = resetPasswordSchema.safeParse({
      password,
      confirmPassword,
    })

    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? "The passwords don't match.")
      return
    }

    setIsUpdatingPassword(true)
    try {
      await updatePassword(parsed.data.password)
      showAlert({
        title: 'Password updated',
        description: 'You can now sign in with your new password.',
      })
      onClose?.()
      router.navigate({ to: '/login' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update password.'
      setPasswordError(message)
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {step === 'email' && (
        <form className="flex flex-col gap-6" onSubmit={handleSendCode}>
          <FieldGroup>
            <div className="flex flex-col items-start gap-2 text-center">
              <div className="text-xl font-bold">
                <FlipWords words={words} />
                <span>AI on your desktop</span>
              </div>
              <p className="text-muted-foreground text-sm text-balance">
                Enter your email for a password reset code
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="reset-email">Email</FieldLabel>
              <Input
                id="reset-email"
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
              <FieldDescription className="text-center">
                <Button type="button" variant="link" onClick={onClose}>
                  Back to Login
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
              <FieldLabel htmlFor="reset-otp">Verification code</FieldLabel>
              <div className="flex justify-center mt-2">
                <InputOTP
                  id="reset-otp"
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
              {codeError && (
                <p className="mt-2 text-sm text-destructive text-center">{codeError}</p>
              )}
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
                    setCodeError(null)
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
        <form className="flex flex-col gap-6" onSubmit={handleUpdatePassword}>
          <FieldGroup>
            <div className="flex flex-col items-start gap-2 text-center">
              <div className="text-xl font-bold">
                <FlipWords words={words} />
                <span>AI on your desktop</span>
              </div>
              <p className="text-muted-foreground text-sm text-balance">
                Set a new password for your account.
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter a new password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (passwordError) setPasswordError(null)
                }}
                required
                disabled={isUpdatingPassword}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  if (passwordError) setPasswordError(null)
                }}
                required
                disabled={isUpdatingPassword}
              />
            </Field>

            {passwordError && (
              <p className="text-sm text-destructive text-center">{passwordError}</p>
            )}

            <Field>
              <Button type="submit" disabled={isUpdatingPassword}>
                {isUpdatingPassword ? 'Updating password...' : 'Update password'}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      )}
    </div>
  )
}
