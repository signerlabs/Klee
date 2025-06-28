import React, { useMemo, useRef, useState } from 'react'
import { CodeBlock, github } from 'react-code-blocks'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { ActionIcon } from './ActionIcon'
import { Copy } from 'lucide-react'

interface ButtonCodeblockProps {
  code: string
}

export default function CodeDisplayBlock({ code }: ButtonCodeblockProps) {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)
  const isCopiedRef = useRef(false)

  const filteredCode = useMemo(() => code.replace(/^.*?\n/, '') || code, [code])
  const trimmedCode = useMemo(() => filteredCode.trim(), [filteredCode])
  const language = useMemo(
    () =>
      ['tsx', 'js', 'python', 'css', 'html', 'cs', 'javascript', 'java'].includes(code.split('\n')[0])
        ? code.split('\n')[0]
        : 'python',
    [code],
  )

  const customStyle = useMemo(() => ({ background: '#fcfcfc' }), [])
  const codeTheme = useMemo(() => github, [])

  const copyToClipboard = () => {
    if (isCopiedRef.current) return // Prevent multiple triggers
    navigator.clipboard.writeText(trimmedCode)
    isCopiedRef.current = true
    setIsCopied(true)
    toast.success(t('chat.copySuccess'))

    setTimeout(() => {
      isCopiedRef.current = false
      setIsCopied(false)
    }, 1000)
  }

  return (
    <div className="relative my-4 flex flex-col overflow-hidden text-start">
      <div className="relative flex h-10 items-center justify-between rounded-t-lg bg-[#f5f5f5] px-2">
        <span className="font-mono text-xs text-gray-800">{language}</span>
        <ActionIcon
          variant="secondary"
          icon={<Copy className="h-4 w-4" />}
          tooltipSide="left"
          tooltipText={t('chat.copy')}
          onClick={copyToClipboard}
          showTooltip={false}
        />
      </div>
      <CodeBlock
        customStyle={customStyle}
        text={trimmedCode}
        language={language}
        showLineNumbers={false}
        theme={codeTheme}
      />
    </div>
  )
}
