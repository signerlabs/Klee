import { z } from 'zod'

export const otpSchema = z.string().regex(/^\d{6}$/, 'Enter the six-digit code')

const usernameSchema = z
  .string()
  .nonempty('Username is required')
  .min(3, 'Username must be at least 3 characters')
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Start with a letter, use only letters, numbers, _')

const emailSchema = z.string().nonempty('Email is required').email('Invalid email format')

const basePasswordSchema = z
  .string()
  .nonempty('Password is required')
  .min(8, 'Use at least 8 characters for your password')

const strongPasswordSchema = basePasswordSchema.regex(
  /^(?=.*[A-Za-z])(?=.*\d).+$/,
  'Use at least one letter and one number'
)

export const loginSchema = z.object({
  email: emailSchema,
  password: basePasswordSchema,
})
export type LoginValues = z.infer<typeof loginSchema>

export const signupEmailSchema = z.object({
  email: emailSchema,
})
export type SignupEmailValues = z.infer<typeof signupEmailSchema>

export const signupPasswordSchema = z
  .object({
    username: usernameSchema,
    password: strongPasswordSchema,
    confirmPassword: z.string().nonempty('Please confirm your password'),
  })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The passwords don't match.",
        path: ['confirmPassword'],
      })
    }
  })

export type SignupPasswordValues = z.infer<typeof signupPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z.string().nonempty('Please confirm your password'),
  })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The passwords don't match.",
        path: ['confirmPassword'],
      })
    }
  })

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
